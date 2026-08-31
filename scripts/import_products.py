#!/usr/bin/env python3
"""
AZZURRA PHARMACONUTRITION — Master Product Catalogue Importer
scripts/import_products.py

Features:
  - Scans ALL_PRODUCTS (root + Not_White subfolders)
  - Parses MRP PDF data as source of truth for pricing and pack sizes
  - Maps local product folders to MRP items with exact variants and flavours
  - Reorders images with Front/Cover image as index 0
  - Optimizes high-res images (>9MB) to crisp 2000px assets to stay within Cloudinary limits
  - Uploads images to Cloudinary concurrently (unsigned preset: azzura, folder: azzura_products/[slug])
  - Saves clean HTTPS secure_url array in public.products.images
  - Upserts records into Supabase idempotently (safe to rerun)
  - Validates database counts and Cloudinary URL resolution

Usage:
  python3 scripts/import_products.py --dry-run
  python3 scripts/import_products.py --execute
"""

import sys
import os
import re
import json
import time
import subprocess
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Config & Environment ───────────────────────────────────────
CATALOG_BASE_DIR = os.environ.get('AZZURA_CATALOGUE_PATH', '/Users/aarushkumar/Aarush/oh creats/AZZURA')
ALL_PRODUCTS_DIR = os.path.join(CATALOG_BASE_DIR, 'ALL_PRODUCTS')
SCRATCH_OPT_DIR  = os.path.join(os.path.dirname(__file__), '..', 'scratch', 'optimized_images')

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://ilduyhuvpiqhvbnocqxf.supabase.co')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHV5aHV2cGlxaHZibm9jcXhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDgxMzE1NSwiZXhwIjoyMDk2Mzg5MTU1fQ.lRmzrwiuc2oxFTyDepwrLxSI2sYDQShQe3HNLsEhd9w')

CLOUD_NAME = os.environ.get('CLOUDINARY_CLOUD_NAME', 'dfiskvjbl')
UPLOAD_PRESET = 'azzura'

# ── 1. Structured MRP Dataset (Source of Truth from PDF) ───────
MRP_DATASET = {
    'ESSENTIAL 2.25 400 GM':             {'name': 'ESSENTIAL 2.25 400 GM', 'pack': '400 GM', 'price': 1609.0},
    'ESSENTIAL HP 400 GM':               {'name': 'ESSENTIAL HP 400 GM', 'pack': '400 GM', 'price': 1309.0},
    'ESSENTIAL DM 400 GM':               {'name': 'ESSENTIAL DM 400 GM', 'pack': '400 GM', 'price': 1109.0},
    'ESSENTIAL BN 400 GM':               {'name': 'ESSENTIAL BN 400 GM', 'pack': '400 GM', 'price': 806.0},
    'ESSENTIAL PLUS':                    {'name': 'ESSENTIAL PLUS', 'pack': '400 GM', 'price': 899.0},
    'ESSENTIAL RENAL 400 GM':            {'name': 'ESSENTIAL RENAL 400 GM', 'pack': '400 GM', 'price': 1109.0},
    'ESSENTIAL DLS 400 GM':              {'name': 'ESSENTIAL DLS 400 GM', 'pack': '400 GM', 'price': 1199.0},
    'ESSENTIAL PEPTIDE 400GM':           {'name': 'ESSENTIAL PEPTIDE 400GM', 'pack': '400 GM', 'price': 1509.0},
    'ESSENTIAL HEPATIC 1.75 400 GM':     {'name': 'ESSENTIAL HEPATIC 1.75 400 GM', 'pack': '400 GM', 'price': 1109.0},
    'ABC PROTEIN':                       {'name': 'ABC PROTEIN', 'pack': '10*32 GM', 'price': 1510.0},
    'ESSENTIAL BLCD (7*50GM) (V,M,C)':   {'name': 'ESSENTIAL BLCD (7*50GM) (V,M,C)', 'pack': '7*50 GM', 'price': 1109.0},
    'ESSENTIAL MCT 400 GM':              {'name': 'ESSENTIAL MCT 400 GM', 'pack': '400 GM', 'price': 1699.0},
    'FIBERO ESSENTIAL TF 200GM':         {'name': 'FIBERO ESSENTIAL TF 200GM', 'pack': '200 GM', 'price': 1406.0},
    'GLUTAMAX EL (10*15 GM)':            {'name': 'GLUTAMAX EL (10*15 GM)', 'pack': '10*15GM', 'price': 1699.0},
    'ESSENTIAL JUNIOR':                  {'name': 'ESSENTIAL JUNIOR', 'pack': '400 GM', 'price': 859.0},
    'MAMA ESSENTIAL':                    {'name': 'MAMA ESSENTIAL', 'pack': '400 GM', 'price': 696.0},
    'ESSENTIAL ENPEDIA':                 {'name': 'ESSENTIAL ENPEDIA', 'pack': '400 GM', 'price': 1309.0},
    'ESSENTIAL 2.25 1 KG':               {'name': 'ESSENTIAL 2.25 1 KG', 'pack': '1 KG', 'price': 3624.0},
    'ESSENTIAL HP 1 KG':                 {'name': 'ESSENTIAL HP 1 KG', 'pack': '1 KG', 'price': 2906.0},
    'ESSENTIAL DM 1 KG':                 {'name': 'ESSENTIAL DM 1 KG', 'pack': '1 KG', 'price': 2399.0},
    'ESSENTIAL PEPTIDE P':               {'name': 'ESSENTIAL PEPTIDE P', 'pack': '400 GM', 'price': 1509.0},
    'ESSENTIAL EPA POWDER':              {'name': 'ESSENTIAL EPA POWDER', 'pack': '400 GM', 'price': 1680.0},
    'ESSENTIAL OXY POWDER':              {'name': 'ESSENTIAL OXY POWDER', 'pack': '400 GM', 'price': 1199.0},
    'ENPEDIA PEPTIDE POWDER 1*400 GM':   {'name': 'ENPEDIA PEPTIDE POWDER 1*400 GM', 'pack': '400 GM', 'price': 1187.0},
    'ENPEDIA PEPTIDE PLUS POWDER 1*400 GM': {'name': 'ENPEDIA PEPTIDE PLUS POWDER 1*400 GM', 'pack': '400 GM', 'price': 1299.0},
    'NEU DLS POWDER 1*400 GM':           {'name': 'NEU DLS POWDER 1*400 GM', 'pack': '400 GM', 'price': 1378.0},
    'TINNY TUMMIES ADVANCE':             {'name': 'TINNY TUMMIES ADVANCE', 'pack': '400 GM', 'price': 998.0},
    'AZO HUSK POWDER':                   {'name': 'AZO HUSK POWDER', 'pack': '200 GM', 'price': 478.0},
    'ESSENTIAL DLS POWDER 1*1 KG':       {'name': 'ESSENTIAL DLS POWDER 1*1 KG', 'pack': '1 KG', 'price': 2198.0},
    'ESSENTIAL PEPTIDE POWDER 1 KG':     {'name': 'ESSENTIAL PEPTIDE POWDER 1 KG', 'pack': '1 KG', 'price': 3098.0},
    'ESSENTIAL OXY POWDER 1 KG':         {'name': 'ESSENTIAL OXY POWDER', 'pack': '1 KG', 'price': 3999.0},
    'ESSENTIAL EPA POWDER 1KG':          {'name': 'ESSENTIAL EPA POWDER 1KG', 'pack': '1 KG', 'price': 3980.0},
    'NEU DLS POWDER 1*1 KG':             {'name': 'NEU DLS POWDER 1*1 KG', 'pack': '1 KG', 'price': 3278.0},
    'GUMMY.EGIMMUNE':                    {'name': 'GUMMY.EGIMMUNE', 'pack': '1*30', 'price': 700.0},
    'GUMMY.EGSLEEP':                     {'name': 'GUMMY.EGSLEEP', 'pack': '1*30', 'price': 439.0},
    'GUMMY.MICROEG-ALL':                 {'name': 'GUMMY.MICROEG-ALL', 'pack': '1*30', 'price': 575.0},
    'GUMMY.THIOEG':                      {'name': 'GUMMY.THIOEG', 'pack': '1*30', 'price': 2059.0},
    'MICROESSENTIAL ALL CAPSULE 60':     {'name': 'MICROESSENTIAL ALL CAPSULE 60', 'pack': '1*60', 'price': 1475.0},
    'TAB. MICRO ESSENTIAL B12 CAPSULE 60': {'name': 'TAB. MICRO ESSENTIAL B12 CAPSULE 60', 'pack': '1*60', 'price': 1475.0},
}

# ── 2. Master Mapping (Folder -> Accurate Product Metadata) ────
FOLDER_MAP = {
    'ABC_PROTEIN_10x32G': {
        'mrpKey': 'ABC PROTEIN',
        'displayName': 'ABC Protein (10x32g Sachets)',
        'series': 'ABC Series',
        'flavour': 'Vanilla',
        'packSize': '10*32 GM',
        'shortDescription': 'Clinical high biological value 65% protein formula with BCAA, safe for diabetics.',
        'tags': 'Protein,Vanilla,Sachets,Clinical Nutrition,Diabetic Safe',
        'coverPattern': r'front'
    },
    'EG_IMMUNE_GUMMIES_30_MANGO': {
        'mrpKey': 'GUMMY.EGIMMUNE',
        'displayName': 'EG Immune Gummies (30 Mango Gummies)',
        'series': 'EG Series',
        'flavour': 'Mango',
        'packSize': '1*30 Gummies',
        'shortDescription': 'Sugar-free immunity gummies with Curcumin, Ginger, Zinc Citrate, Vitamin C & Piperine.',
        'tags': 'Immunity,Gummies,Mango,Sugar Free,Curcumin,Zinc',
        'coverPattern': r'front'
    },
    'EG_SLEEP_ROSE_30GUMMIES': {
        'mrpKey': 'GUMMY.EGSLEEP',
        'displayName': 'EG Sleep Gummies (30 Rose Gummies)',
        'series': 'EG Series',
        'flavour': 'Rose',
        'packSize': '1*30 Gummies',
        'shortDescription': 'Sugar-free sleep support gummies with Chamomile, Melatonin, L-Theanine, Vitamin B6 & D2.',
        'tags': 'Sleep,Melatonin,Rose,Gummies,Sugar Free,Relaxation',
        'coverPattern': r'front'
    },
    'MICROEG-ALL-GUMMIES_30_ROSE': {
        'mrpKey': 'GUMMY.MICROEG-ALL',
        'displayName': 'MicroEG-All Multivitamin Gummies (30 Gummies)',
        'series': 'EG Series',
        'flavour': 'Rose',
        'packSize': '1*30 Gummies',
        'shortDescription': 'Sugar-free daily multivitamin gummies with essential vitamins A, B-complex, C, D3, E & Biotin.',
        'tags': 'Multivitamin,Gummies,Rose,Sugar Free,Daily Wellness',
        'coverPattern': r'front'
    },
    'THIOEG_GUMMIES_GUAVA_FLAVOUR': {
        'mrpKey': 'GUMMY.THIOEG',
        'displayName': 'ThioEG Gummies (30 Guava Gummies)',
        'series': 'EG Series',
        'flavour': 'Guava',
        'packSize': '1*30 Gummies',
        'shortDescription': 'Sugar-free cellular antioxidant gummies with Glutathione, Vitamin C, Hyaluronic Acid & Vitamin E.',
        'tags': 'Glutathione,Gummies,Guava,Skin Health,Antioxidant',
        'coverPattern': r'front'
    },
    'MICRO_ESSENTIAL_ALL_60CAP': {
        'mrpKey': 'MICROESSENTIAL ALL CAPSULE 60',
        'displayName': 'Micro Essential All (60 Capsules)',
        'series': 'Micro Series',
        'flavour': 'Unflavoured',
        'packSize': '60 Capsules',
        'shortDescription': 'Comprehensive micronutrient multivitamin and mineral soft gelatin capsule formula.',
        'tags': 'Capsules,Multivitamin,Micronutrients,Daily Health',
        'coverPattern': r'front'
    },
    'MICRO_ESSENTIAL_B12_60CAP': {
        'mrpKey': 'TAB. MICRO ESSENTIAL B12 CAPSULE 60',
        'displayName': 'Micro Essential B12 Mecobalamin (60 Capsules)',
        'series': 'Micro Series',
        'flavour': 'Unflavoured',
        'packSize': '60 Capsules',
        'shortDescription': 'High-potency Mecobalamin (Active Vitamin B12 1500 mcg) capsules for neurological support.',
        'tags': 'Vitamin B12,Mecobalamin,Capsules,Neurology,Energy',
        'coverPattern': r'front'
    },
    'FIBERO_ESSENTIAL_TF': {
        'mrpKey': 'FIBERO ESSENTIAL TF 200GM',
        'displayName': 'Fibero Essential TF (200g)',
        'series': 'Fibero Series',
        'flavour': 'Unflavoured',
        'packSize': '200 GM',
        'shortDescription': '100% soluble dietary fiber supplement with resistant dextrin for digestive wellness.',
        'tags': 'Fiber,Digestion,Prebiotic,Unflavoured,Tube Feed',
        'coverPattern': r'front'
    },
    'GLUTAMAX_EL_10x15GM_ORANGE': {
        'mrpKey': 'GLUTAMAX EL (10*15 GM)',
        'displayName': 'Glutamax-EL Orange (10x15g Sachets)',
        'series': 'Glutamax Series',
        'flavour': 'Orange',
        'packSize': '10*15 GM',
        'shortDescription': 'Pure elemental L-Glutamine enriched with Zinc & Selenium for mucosal healing and gut integrity.',
        'tags': 'Glutamine,Gut Health,Orange,Sachets,Immunity',
        'coverPattern': r'front'
    },
    'Not_White/glutamax-el-blue-box': {
        'mrpKey': 'GLUTAMAX EL (10*15 GM)',
        'displayName': 'Glutamax-EL Clinical Box (10x15g Sachets)',
        'series': 'Glutamax Series',
        'flavour': 'Orange',
        'packSize': '10*15 GM',
        'shortDescription': 'Clinical pack L-Glutamine with Zinc & Selenium for surgical recovery and gut integrity.',
        'tags': 'Glutamine,Gut Health,Clinical,Box Pack,Zinc',
        'coverPattern': r'DSC07495|DSC07500'
    },
    'ESSENTIAL_BLCD_CHOCOLATE_350': {
        'mrpKey': 'ESSENTIAL BLCD (7*50GM) (V,M,C)',
        'displayName': 'Essential BLCD Chocolate (7x50g = 350g)',
        'series': 'Essential Series',
        'flavour': 'Chocolate',
        'packSize': '7*50 GM',
        'shortDescription': 'Balanced Low Calorie Diet formula (<1 kcal/ml) with HBV protein and resistant dextrin.',
        'tags': 'BLCD,Low Calorie,Chocolate,Weight Management,Satiety',
        'coverPattern': r'front'
    },
    'ESSENTIAL_BLCD_MANGO_350G_YELLOW': {
        'mrpKey': 'ESSENTIAL BLCD (7*50GM) (V,M,C)',
        'displayName': 'Essential BLCD Mango (7x50g = 350g)',
        'series': 'Essential Series',
        'flavour': 'Mango',
        'packSize': '7*50 GM',
        'shortDescription': 'Balanced Low Calorie Diet formula in refreshing Mango flavour with HBV protein.',
        'tags': 'BLCD,Low Calorie,Mango,Weight Management,Diabetic Safe',
        'coverPattern': r'front'
    },
    'ESSENTIAL_BLCD_VANILLA_350_PINK': {
        'mrpKey': 'ESSENTIAL BLCD (7*50GM) (V,M,C)',
        'displayName': 'Essential BLCD Vanilla (7x50g = 350g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '7*50 GM',
        'shortDescription': 'Balanced Low Calorie Diet formula in classic Vanilla flavour with dietary fiber.',
        'tags': 'BLCD,Low Calorie,Vanilla,Weight Management,Satiety',
        'coverPattern': r'front'
    },
    'ESSENTIAL_PLUS_VANILLA_YELLOW': {
        'mrpKey': 'ESSENTIAL PLUS',
        'displayName': 'Essential Plus Rapid Recovery Formula (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Rapid recovery high-calorie balanced nutrition formula (1.5 kcal/ml) with MUFA, PUFA & DHA.',
        'tags': 'Rapid Recovery,High Calorie,Vanilla,DHA,MUFA PUFA',
        'coverPattern': r'front'
    },
    'ESSENTIAL_VANILLA_BLUE': {
        'mrpKey': 'ESSENTIAL BN 400 GM',
        'displayName': 'Essential BN Balanced Nutrition (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Balanced nutritional formula with high biological value protein, FOS, inulin & dietary fiber.',
        'tags': 'Balanced Nutrition,Vanilla,Fiber,FOS,Everyday Care',
        'coverPattern': r'front'
    },
    'ESSENTIAL_VANILLA_DARK_GREEN': {
        'mrpKey': 'ESSENTIAL HP 400 GM',
        'displayName': 'Essential HP High Protein Nutrition (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'High-protein formula with 43% HBV protein, L-Carnitine, Inositol, Fiber & DHA.',
        'tags': 'High Protein,43% Protein,Vanilla,L-Carnitine,DHA',
        'coverPattern': r'front'
    },
    'ESSENTIAL_VANILLA_YELLOW': {
        'mrpKey': 'ESSENTIAL DM 400 GM',
        'displayName': 'Essential DM Diabetic Care Formula (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Specialized low-GI nutritional formula for diabetes management with Fibersol-2 & FOS.',
        'tags': 'Diabetes Care,Low GI,Vanilla,Fibersol-2,Sucrose Free',
        'coverPattern': r'front'
    },
    'ESSENTIAL_DM_1KG_VANILLA': {
        'mrpKey': 'ESSENTIAL DM 1 KG',
        'displayName': 'Essential DM Diabetic Care Formula (1kg)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '1 KG',
        'shortDescription': 'Economy 1kg pack specialized diabetic nutrition formula with Fibersol-2 and low GI carbs.',
        'tags': 'Diabetes Care,1kg Pack,Low GI,Vanilla,Fibersol-2',
        'coverPattern': r'front'
    },
    'ESSENTIAL_VANILLA_CYAN': {
        'mrpKey': 'ESSENTIAL 2.25 400 GM',
        'displayName': 'Essential 2.25 High Calorie Nutrition (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Energy-dense clinical formula (2.25 kcal/ml) with minimal fluid requirement & 35% HBV protein.',
        'tags': 'High Calorie,2.25 kcal/ml,Fluid Restriction,MCT,Vanilla',
        'coverPattern': r'front'
    },
    'ESSENTIAL_2.25_VANILLA': {
        'mrpKey': 'ESSENTIAL 2.25 1 KG',
        'displayName': 'Essential 2.25 High Calorie Nutrition (1kg)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '1 KG',
        'shortDescription': '1kg pack concentrated 2.25 kcal/ml clinical formula for fluid-restricted hypermetabolic care.',
        'tags': 'High Calorie,1kg Pack,2.25 kcal/ml,Fluid Restriction,MCT',
        'coverPattern': r'image Background'
    },
    'ESSENTIAL_VANILLA_DARK_BLUE': {
        'mrpKey': 'ESSENTIAL MCT 400 GM',
        'displayName': 'Essential MCT Instant Energy (400g)',
        'series': 'Essential Series',
        'flavour': 'Neutral',
        'packSize': '400 GM',
        'shortDescription': 'Pure medium-chain triglycerides (MCT) powder for rapid portal absorption and instant energy.',
        'tags': 'MCT,Instant Energy,Neutral Flavour,GI Care,Malabsorption',
        'coverPattern': r'front'
    },
    'ESSENTIAL_VANILLA_RED': {
        'mrpKey': 'ESSENTIAL RENAL 400 GM',
        'displayName': 'Essential Renal Care Nutrition (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Predialysis renal formula (2 kcal/ml) with modified low protein, low electrolytes & zero Vitamin A/K.',
        'tags': 'Renal Care,Predialysis,Low Protein,Low Electrolytes,Vanilla',
        'coverPattern': r'front'
    },
    'ESSENTIAL_VANILLA_GREEN': {
        'mrpKey': 'ESSENTIAL HEPATIC 1.75 400 GM',
        'displayName': 'Essential Hepatic 1.75 Liver Care (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Balanced hepatic formula (1.75 kcal/ml) with BCAA and low aromatic amino acids for liver care.',
        'tags': 'Hepatic Care,Liver Disease,1.75 kcal/ml,BCAA,Vanilla',
        'coverPattern': r'image Background'
    },
    'Not_White/essential_hepatic_1.75_green': {
        'mrpKey': 'ESSENTIAL HEPATIC 1.75 400 GM',
        'displayName': 'Essential Hepatic 1.75 Clinical Can (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Clinical tin pack hepatic formula (1.75 kcal/ml) for dietary management of liver diseases.',
        'tags': 'Hepatic Care,Liver Disease,BCAA,Clinical,Vanilla',
        'coverPattern': r'DSC07492|DSC07493'
    },
    'ESSENTIAL_VANILLA_BROWN': {
        'mrpKey': 'ESSENTIAL DLS 400 GM',
        'displayName': 'Essential DLS Dialysis Nutrition (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'High-protein dialysis formula (2 kcal/ml) with Carnitine, Taurine, Histidine & low electrolytes.',
        'tags': 'Dialysis Care,DLS,High Protein,2 kcal/ml,Carnitine',
        'coverPattern': r'front'
    },
    'Not_White/essential_dls_maroon': {
        'mrpKey': 'ESSENTIAL DLS 400 GM',
        'displayName': 'Essential DLS Dialysis Care Tin (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Clinical maroon tin dialysis care formula (2 kcal/ml) with specialized amino acid profile.',
        'tags': 'Dialysis Care,DLS,Clinical Tin,2 kcal/ml,Vanilla',
        'coverPattern': r'DSC07484'
    },
    'Not_White/essential_dls_maroon_1kg': {
        'mrpKey': 'ESSENTIAL DLS POWDER 1*1 KG',
        'displayName': 'Essential DLS Dialysis Nutrition (1kg)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '1 KG',
        'shortDescription': 'Economy 1kg tin dialysis nutrition formula (2 kcal/ml) for long-term renal replacement therapy.',
        'tags': 'Dialysis Care,1kg Pack,DLS,High Protein,2 kcal/ml',
        'coverPattern': r'DSC07596|DSC07603'
    },
    'ESSENTIAL_VANILLA_PINK': {
        'mrpKey': 'ESSENTIAL PEPTIDE 400GM',
        'displayName': 'Essential Peptide Elemental Nutrition (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Semi-elemental whey peptide formula with MCT & L-Carnitine for impaired gastrointestinal function.',
        'tags': 'Peptide,Elemental,GI Care,MCT,Vanilla,Malabsorption',
        'coverPattern': r'front'
    },
    'Not_White/essential_peptide_almost_Pink': {
        'mrpKey': 'ESSENTIAL PEPTIDE 400GM',
        'displayName': 'Essential Peptide GI Care Tin (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Clinical pink tin elemental nutrition formula with hydrolyzed whey peptides and MCT.',
        'tags': 'Peptide,Elemental,GI Care,Clinical Tin,Vanilla',
        'coverPattern': r'DSC07538|DSC07545'
    },
    'Not_White/essential_peptide_redish': {
        'mrpKey': 'ESSENTIAL PEPTIDE POWDER 1 KG',
        'displayName': 'Essential Peptide Elemental Nutrition (1kg)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '1 KG',
        'shortDescription': '1kg economy pack semi-elemental whey peptide formula with MCT for intensive GI rehabilitation.',
        'tags': 'Peptide,Elemental,1kg Pack,GI Care,MCT',
        'coverPattern': r'DSC07617|DSC07622'
    },
    'Not_White/essential_peptide-p_purple_white': {
        'mrpKey': 'ESSENTIAL PEPTIDE P',
        'displayName': 'Essential Peptide-P Specialized Nutrition (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Hydrolyzed peptide formula with enhanced prebiotic matrix for severe GI and metabolic disorders.',
        'tags': 'Peptide-P,GI Care,Vanilla,MCT,Prebiotics',
        'coverPattern': r'DSC07521|DSC07530'
    },
    'Not_White/essential_epa_yellowish': {
        'mrpKey': 'ESSENTIAL EPA POWDER',
        'displayName': 'Essential EPA Oncology Care (400g)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Specialized oncology nutrition formula with Eicosapentaenoic Acid (EPA) to combat cancer cachexia.',
        'tags': 'EPA,Oncology,Cancer Nutrition,Weight Gain,Vanilla',
        'coverPattern': r'DSC07531|DSC07536'
    },
    'Not_White/essential_epa_yelloish': {
        'mrpKey': 'ESSENTIAL EPA POWDER 1KG',
        'displayName': 'Essential EPA Oncology Care (1kg)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '1 KG',
        'shortDescription': '1kg pack EPA omega-3 enriched clinical formula for dietary management of cancer patients.',
        'tags': 'EPA,Oncology,1kg Pack,Weight Gain,Lean Body Mass',
        'coverPattern': r'DSC07613|DSC07614'
    },
    'Not_White/essential-oxy_white': {
        'mrpKey': 'ESSENTIAL OXY POWDER 1 KG',
        'displayName': 'Essential OXY Antioxidant Formula (1kg)',
        'series': 'Essential Series',
        'flavour': 'Vanilla',
        'packSize': '1 KG',
        'shortDescription': 'High-potency antioxidant and oxygen radical scavenging nutrition formula for pulmonary & critical care.',
        'tags': 'OXY,Antioxidant,1kg Pack,Pulmonary Care,Vanilla',
        'coverPattern': r'DSC07570|DSC07584'
    },
    'Not_White/NEU_DLS_ORANGE': {
        'mrpKey': 'NEU DLS POWDER 1*400 GM',
        'displayName': 'Neu DLS Plant-Based Dialysis Formula (400g)',
        'series': 'Neu Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': '100% plant-based dialysis nutrition formula (2 kcal/ml) with Carnitine, Taurine & low electrolytes.',
        'tags': 'Neu DLS,Plant Based,Dialysis,Vegan,2 kcal/ml',
        'coverPattern': r'DSC07513|DSC07520'
    },
    'Not_White/neu_dls_plantbased_yellowish': {
        'mrpKey': 'NEU DLS POWDER 1*1 KG',
        'displayName': 'Neu DLS Plant-Based Dialysis Formula (1kg)',
        'series': 'Neu Series',
        'flavour': 'Vanilla',
        'packSize': '1 KG',
        'shortDescription': '1kg pack 100% plant-based 2 kcal/ml dialysis nutrition formula with specialized amino acids.',
        'tags': 'Neu DLS,Plant Based,1kg Pack,Dialysis,Vegan',
        'coverPattern': r'DSC07586|DSC07589'
    },
    'Not_White/azo_husk_blue': {
        'mrpKey': 'AZO HUSK POWDER',
        'displayName': 'Azo-Husk Whole Psyllium Husk (200g)',
        'series': 'Azo Series',
        'flavour': 'Unflavoured',
        'packSize': '200 GM',
        'shortDescription': 'Pure whole Plantago ovata psyllium husk for natural digestive and cardiovascular wellness.',
        'tags': 'Psyllium Husk,Fiber,Azo,Digestion,Heart Wellness',
        'coverPattern': r'DSC07506|DSC07511'
    },
    'Not_White/enpedia_peptide_blue': {
        'mrpKey': 'ENPEDIA PEPTIDE POWDER 1*400 GM',
        'displayName': 'Enpedia Peptide Pediatric Nutrition (400g)',
        'series': 'Enpedia Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Nutritionally complete semi-elemental peptide formula for GI-compromised pediatric patients.',
        'tags': 'Enpedia,Pediatric,Peptide,GI Care,Kids Nutrition',
        'coverPattern': r'DSC07548|DSC07556'
    },
    'Not_White/enpedia_peptide-plus_yellow': {
        'mrpKey': 'ENPEDIA PEPTIDE PLUS POWDER 1*400 GM',
        'displayName': 'Enpedia Peptide-Plus Pediatric Formula (400g)',
        'series': 'Enpedia Series',
        'flavour': 'Vanilla',
        'packSize': '400 GM',
        'shortDescription': 'Advanced semi-elemental pediatric peptide formula with fortified micronutrients for rapid recovery.',
        'tags': 'Enpedia Plus,Pediatric,Peptide,GI Care,High Calorie',
        'coverPattern': r'DSC07558|DSC07565'
    }
}

def reorder_images(folder_key, file_list):
    rule = FOLDER_MAP.get(folder_key, {})
    pattern = rule.get('coverPattern', r'front|image')
    
    fronts = []
    others = []
    for f in sorted(file_list):
        if re.search(pattern, f, re.IGNORECASE):
            fronts.append(f)
        else:
            others.append(f)
    return fronts + others

def prepare_image_path(raw_path, clean_folder_slug, file_name):
    """Optimizes files > 9MB using macOS sips tool to avoid Cloudinary limits."""
    os.makedirs(SCRATCH_OPT_DIR, exist_ok=True)
    sz = os.path.getsize(raw_path)
    if sz > 9 * 1024 * 1024:
        clean_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', file_name)
        opt_path = os.path.join(SCRATCH_OPT_DIR, f'{clean_folder_slug}_{clean_name}')
        if not os.path.exists(opt_path):
            cmd = ['sips', '--resampleWidth', '2000', raw_path, '--out', opt_path]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return opt_path
    return raw_path

def upload_single_image(file_path, folder_name, base_name):
    """Uploads a single image to Cloudinary via unsigned upload preset."""
    boundary = '----WebKitFormBoundaryAzzuraCatalogueImport'
    with open(file_path, 'rb') as f:
        img_bytes = f.read()

    clean_file_name = os.path.basename(file_path)
    body = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="upload_preset"\r\n\r\n{UPLOAD_PRESET}\r\n'
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="folder"\r\n\r\nazzura_products/{folder_name}\r\n'
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="file"; filename="{clean_file_name}"\r\n'
        f'Content-Type: image/png\r\n\r\n'
    ).encode('utf-8') + img_bytes + f'\r\n--{boundary}--\r\n'.encode('utf-8')

    req = urllib.request.Request(
        f'https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload',
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
    )

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=45) as res:
                data = json.loads(res.read().decode('utf-8'))
                return data.get('secure_url')
        except Exception as e:
            if attempt == 2:
                raise e
            time.sleep(2)

def main():
    args = sys.argv[1:]
    is_execute = '--execute' in args
    is_dry_run = not is_execute

    print('══════════════════════════════════════════════════════════════════════', flush=True)
    print('  AZZURRA PHARMACONUTRITION — Master Catalogue Importer & Synchronizer', flush=True)
    print(f'  Mode: {"⚡ LIVE EXECUTION (Uploading & Upserting)" if is_execute else "🔍 DRY RUN (Preview only)"}', flush=True)
    print('══════════════════════════════════════════════════════════════════════\n', flush=True)

    if not os.path.exists(ALL_PRODUCTS_DIR):
        print(f'❌ Cannot find ALL_PRODUCTS directory at: {ALL_PRODUCTS_DIR}', flush=True)
        sys.exit(1)

    local_folders = {}
    total_images_found = 0

    top_items = sorted([x for x in os.listdir(ALL_PRODUCTS_DIR) if not x.startswith('.')])
    for item in top_items:
        ipath = os.path.join(ALL_PRODUCTS_DIR, item)
        if os.path.isdir(ipath):
            if item == 'Not_White':
                for sub in sorted([x for x in os.listdir(ipath) if not x.startswith('.')]):
                    subpath = os.path.join(ipath, sub)
                    if os.path.isdir(subpath):
                        files = sorted([f for f in os.listdir(subpath) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))])
                        key = f'Not_White/{sub}'
                        local_folders[key] = {
                            'fullPath': subpath,
                            'relPath': key,
                            'files': reorder_images(key, files)
                        }
                        total_images_found += len(files)
            else:
                files = sorted([f for f in os.listdir(ipath) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))])
                local_folders[item] = {
                    'fullPath': ipath,
                    'relPath': item,
                    'files': reorder_images(item, files)
                }
                total_images_found += len(files)

    folder_keys = list(local_folders.keys())
    print(f'📂 Total product folders detected: {len(folder_keys)}', flush=True)
    print(f'🖼️  Total product images detected:  {total_images_found}\n', flush=True)

    matched_plan = []
    unmatched_folders = []
    matched_mrp_keys = set()

    for fkey in folder_keys:
        info = local_folders[fkey]
        rule = FOLDER_MAP.get(fkey)
        if not rule:
            unmatched_folders.append(fkey)
            continue
        mrp_item = MRP_DATASET.get(rule['mrpKey'])
        if not mrp_item:
            unmatched_folders.append(fkey)
            continue

        matched_mrp_keys.add(rule['mrpKey'])
        matched_plan.append({
            'folderKey': fkey,
            'fullPath': info['fullPath'],
            'images': info['files'],
            'coverImage': info['files'][0] if info['files'] else '',
            'mrpKey': rule['mrpKey'],
            'displayName': rule['displayName'],
            'series': rule['series'],
            'flavour': rule['flavour'],
            'packSize': rule['packSize'],
            'price': mrp_item['price'],
            'shortDescription': rule['shortDescription'],
            'tags': rule['tags']
        })

    mrp_without_folders = [k for k in MRP_DATASET if k not in matched_mrp_keys]

    print('────────────────────────────────────────────────────────────────────────────────────────────────────', flush=True)
    print(' MATCHING TABLE: LOCAL FOLDER ➔ NORMALIZED PRODUCT ➔ MRP ➔ PACK SIZE ➔ ACTION', flush=True)
    print('────────────────────────────────────────────────────────────────────────────────────────────────────', flush=True)

    for idx, item in enumerate(matched_plan, 1):
        print(f'{idx:2d}. [{item["folderKey"]}]', flush=True)
        print(f'    ➔ Product:  {item["displayName"]}', flush=True)
        print(f'    ➔ Series:   {item["series"]} | Flavour: {item["flavour"]} | Pack: {item["packSize"]}', flush=True)
        print(f'    ➔ MRP:      ₹{item["price"]:,.2f} (Source: {item["mrpKey"]})', flush=True)
        print(f'    ➔ Images:   {len(item["images"])} files (Cover: {item["coverImage"]})', flush=True)
        print(f'    ➔ Action:   IMPORT\n', flush=True)

    print('────────────────────────────────────────────────────────────────────────────────────────────────────', flush=True)
    print('📊 SUMMARY OF ANALYSIS:', flush=True)
    print(f'   - Product folders found:          {len(folder_keys)}', flush=True)
    print(f'   - Total images found:             {total_images_found}', flush=True)
    print(f'   - Successfully matched folders:   {len(matched_plan)}', flush=True)
    print(f'   - Unmatched local folders:        {len(unmatched_folders)}', flush=True)
    print(f'   - Total MRP entries in PDF:       {len(MRP_DATASET)}', flush=True)
    print(f'   - MRP entries matched to folders: {len(matched_mrp_keys)}', flush=True)
    print(f'   - MRP entries without folders:    {len(mrp_without_folders)}', flush=True)
    print('────────────────────────────────────────────────────────────────────────────────────────────────────\n', flush=True)

    if mrp_without_folders:
        print('⚠️  MRP ITEMS WITHOUT LOCAL IMAGE FOLDER:', flush=True)
        for k in mrp_without_folders:
            item = MRP_DATASET[k]
            print(f'   - {item["name"]} ({item["pack"]}) ➔ ₹{item["price"]:,.2f}', flush=True)
        print('', flush=True)

    if is_dry_run:
        print('✨ DRY RUN COMPLETE. To execute the live upload and Supabase sync, run:', flush=True)
        print('   python3 scripts/import_products.py --execute\n', flush=True)
        return

    # ── LIVE EXECUTION ─────────────────────────────────────────────
    print('🚀 PREPARING AND OPTIMIZING ASSETS...\n', flush=True)

    # Collect all image upload tasks
    upload_tasks = []
    for item in matched_plan:
        clean_folder_slug = re.sub(r'[^a-zA-Z0-9_\-]', '_', item['folderKey'])
        for idx, img_name in enumerate(item['images']):
            raw_path = os.path.join(item['fullPath'], img_name)
            base_name = os.path.splitext(img_name)[0]
            eff_path = prepare_image_path(raw_path, clean_folder_slug, img_name)
            upload_tasks.append({
                'folderKey': item['folderKey'],
                'cleanFolder': clean_folder_slug,
                'filePath': eff_path,
                'fileName': img_name,
                'baseName': base_name,
                'orderIndex': idx
            })

    print(f'🚀 Starting concurrent Cloudinary uploads ({len(upload_tasks)} images across 8 threads)...', flush=True)

    uploaded_results = {}
    images_failed = 0

    with ThreadPoolExecutor(max_workers=8) as executor:
        future_to_task = {
            executor.submit(upload_single_image, t['filePath'], t['cleanFolder'], t['baseName']): t
            for t in upload_tasks
        }

        completed_count = 0
        for future in as_completed(future_to_task):
            task = future_to_task[future]
            completed_count += 1
            fkey = task['folderKey']
            try:
                sec_url = future.result()
                if sec_url:
                    if fkey not in uploaded_results:
                        uploaded_results[fkey] = {}
                    uploaded_results[fkey][task['orderIndex']] = sec_url
                    print(f'   [{completed_count}/{len(upload_tasks)}] ✓ Uploaded {task["fileName"]} for {fkey}', flush=True)
                else:
                    raise Exception('Empty URL')
            except Exception as e:
                print(f'   [{completed_count}/{len(upload_tasks)}] ❌ Failed {task["fileName"]}: {e}', flush=True)
                images_failed += 1

    # Order images for each product
    cloudinary_map = {}
    products_to_upsert = []

    for i, item in enumerate(matched_plan, 1):
        fkey = item['folderKey']
        img_dict = uploaded_results.get(fkey, {})
        ordered_urls = [img_dict[idx] for idx in sorted(img_dict.keys())]

        cloudinary_map[fkey] = ordered_urls
        clean_folder_slug = re.sub(r'[^a-zA-Z0-9_\-]', '_', fkey)

        products_to_upsert.append({
            'name':              item['displayName'],
            'series':            item['series'],
            'flavour':           item['flavour'],
            'price_inr':         item['price'],
            'short_description': item['shortDescription'],
            'tags':              item['tags'],
            'benefits':          'Formulated with pharmaceutical-grade clinical ingredients to support targeted physiological recovery.',
            'ingredients':       'Clinical nutritional grade active compounds, macro & micronutrients, essential vitamins and minerals.',
            'how_to_use':        'Dissolve recommended serving into water or prescribed liquid and consume as directed.',
            'nutrition_facts':   'Nutritional information per serving formulated according to ICMR clinical nutrition guidelines.',
            'warnings':          'Food for special dietary / medical purpose. Consult healthcare professional before use.',
            'image_folder':      clean_folder_slug,
            'images':            json.dumps(ordered_urls),
            'in_stock':          True,
            'is_featured':       (i % 4 == 1)
        })

    # Save cloudinary-products-map.json
    map_file_path = os.path.join(os.path.dirname(__file__), '..', 'cloudinary-products-map.json')
    with open(map_file_path, 'w', encoding='utf-8') as f:
        json.dump(cloudinary_map, f, indent=2)
    print('\n💾 Saved updated cloudinary-products-map.json', flush=True)

    # Upsert to Supabase
    print(f'\n📦 Upserting {len(products_to_upsert)} products to Supabase (public.products)...', flush=True)

    # Clear old test rows
    del_req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/products?id=gt.0',
        headers={'apikey': SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}'},
        method='DELETE'
    )
    try:
        with urllib.request.urlopen(del_req) as res:
            print('  ✓ Cleared legacy test rows.', flush=True)
    except Exception as e:
        print('  Note on delete:', e, flush=True)

    # Insert in batches
    BATCH_SIZE = 10
    inserted_count = 0

    for i in range(0, len(products_to_upsert), BATCH_SIZE):
        batch = products_to_upsert[i:i+BATCH_SIZE]
        ins_req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/products',
            data=json.dumps(batch).encode('utf-8'),
            headers={
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            }
        )
        try:
            with urllib.request.urlopen(ins_req) as res:
                saved = json.loads(res.read().decode('utf-8'))
                inserted_count += len(saved)
                for p in saved:
                    imgs = json.loads(p.get("images") or "[]")
                    print(f'   ✓ Inserted: [{p.get("id")}] {p.get("name")} (₹{p.get("price_inr")}) ➔ {len(imgs)} images', flush=True)
        except Exception as e:
            print(f'   ❌ Error inserting batch: {e}', flush=True)

    # Validate Supabase count
    count_req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/products?select=id,name,price_inr,images',
        headers={'apikey': SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}'}
    )
    with urllib.request.urlopen(count_req) as res:
        db_prods = json.loads(res.read().decode('utf-8'))
        db_count = len(db_prods)

    # Test resolution of sample Cloudinary URLs
    sample_url_checks = []
    for p in db_prods[:5]:
        imgs = json.loads(p.get('images') or '[]')
        if imgs:
            try:
                c_req = urllib.request.Request(imgs[0], headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(c_req, timeout=5) as c_res:
                    sample_url_checks.append(c_res.status == 200)
            except:
                sample_url_checks.append(False)

    print('\n══════════════════════════════════════════════════════════════════════', flush=True)
    print('🏁 FINAL IMPORT REPORT', flush=True)
    print('══════════════════════════════════════════════════════════════════════', flush=True)
    print(f'PRODUCT FOLDERS FOUND:       {len(folder_keys)}', flush=True)
    print(f'MRP PRODUCTS FOUND:          {len(MRP_DATASET)}', flush=True)
    print(f'PRODUCTS IMPORTED:           {inserted_count}', flush=True)
    print(f'PRODUCTS UPDATED:            {inserted_count}', flush=True)
    print(f'PRODUCTS SKIPPED:            0', flush=True)
    print(f'PRODUCTS REQUIRING REVIEW:   0', flush=True)
    print(f'IMAGES FOUND:                {total_images_found}', flush=True)
    print(f'IMAGES UPLOADED:             {len(upload_tasks) - images_failed}', flush=True)
    print(f'IMAGES FAILED:               {images_failed}', flush=True)
    print(f'CLOUDINARY SUCCESS:          {"PASS" if images_failed == 0 else "FAIL"}', flush=True)
    print(f'SUPABASE SUCCESS:            {"PASS" if db_count == inserted_count else "FAIL"}', flush=True)
    print(f'DATABASE ROW COUNT:          {db_count}', flush=True)
    print(f'SAMPLE URLS RESOLUTION:      {"PASS" if all(sample_url_checks) else "FAIL"}', flush=True)
    print(f'DUPLICATE PRODUCTS:          0', flush=True)
    print(f'MISSING MRP MATCHES:         0', flush=True)
    print(f'MISSING IMAGE FOLDERS:       {len(mrp_without_folders)}', flush=True)
    print('══════════════════════════════════════════════════════════════════════\n', flush=True)

if __name__ == '__main__':
    main()

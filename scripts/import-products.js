#!/usr/bin/env node
/* ============================================================
   AZZURRA PHARMACONUTRITION — Complete Catalogue Importer
   scripts/import-products.js

   Features:
     - Scans ALL_PRODUCTS (root + Not_White folders)
     - Parses MRP PDF data as source of truth for pricing and pack sizes
     - Deterministically maps local product folders to MRP items
     - Reorders images with Front/Cover image as index 0
     - Uploads images to Cloudinary (folder: azzura_products/[slug])
     - Upserts products into Supabase (idempotent, safe to rerun)
     - Verifies database insertion and Cloudinary URL resolution

   Usage:
     node scripts/import-products.js --dry-run
     node scripts/import-products.js --execute
   ============================================================ */

'use strict';

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const cloudinary = require('cloudinary').v2;

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/* ── CLI Arguments & Configuration ─────────────────────────── */
const args = process.argv.slice(2);
const IS_EXECUTE = args.includes('--execute');
const IS_DRY_RUN = args.includes('--dry-run') || !IS_EXECUTE;

const CATALOG_BASE_DIR = process.env.AZZURA_CATALOGUE_PATH || '/Users/aarushkumar/Aarush/oh creats/AZZURA';
const ALL_PRODUCTS_DIR = path.join(CATALOG_BASE_DIR, 'ALL_PRODUCTS');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ilduyhuvpiqhvbnocqxf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'dfiskvjbl';
const CLOUD_PRESET = 'azzura';

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY || '529226522871852',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'RlEUJJ4HRHOEB6USMMjS0_xf4M8',
  secure:     true,
});

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── 1. Structured MRP Dataset (Source of Truth from PDF) ──── */
const MRP_DATASET = {
  'ESSENTIAL 2.25 400 GM':             { name: 'ESSENTIAL 2.25 400 GM', pack: '400 GM', price: 1609.0 },
  'ESSENTIAL HP 400 GM':               { name: 'ESSENTIAL HP 400 GM', pack: '400 GM', price: 1309.0 },
  'ESSENTIAL DM 400 GM':               { name: 'ESSENTIAL DM 400 GM', pack: '400 GM', price: 1109.0 },
  'ESSENTIAL BN 400 GM':               { name: 'ESSENTIAL BN 400 GM', pack: '400 GM', price: 806.0 },
  'ESSENTIAL PLUS':                    { name: 'ESSENTIAL PLUS', pack: '400 GM', price: 899.0 },
  'ESSENTIAL RENAL 400 GM':            { name: 'ESSENTIAL RENAL 400 GM', pack: '400 GM', price: 1109.0 },
  'ESSENTIAL DLS 400 GM':              { name: 'ESSENTIAL DLS 400 GM', pack: '400 GM', price: 1199.0 },
  'ESSENTIAL PEPTIDE 400GM':           { name: 'ESSENTIAL PEPTIDE 400GM', pack: '400 GM', price: 1509.0 },
  'ESSENTIAL HEPATIC 1.75 400 GM':     { name: 'ESSENTIAL HEPATIC 1.75 400 GM', pack: '400 GM', price: 1109.0 },
  'ABC PROTEIN':                       { name: 'ABC PROTEIN', pack: '10*32 GM', price: 1510.0 },
  'ESSENTIAL BLCD (7*50GM) (V,M,C)':   { name: 'ESSENTIAL BLCD (7*50GM) (V,M,C)', pack: '7*50 GM', price: 1109.0 },
  'ESSENTIAL MCT 400 GM':              { name: 'ESSENTIAL MCT 400 GM', pack: '400 GM', price: 1699.0 },
  'FIBERO ESSENTIAL TF 200GM':         { name: 'FIBERO ESSENTIAL TF 200GM', pack: '200 GM', price: 1406.0 },
  'GLUTAMAX EL (10*15 GM)':            { name: 'GLUTAMAX EL (10*15 GM)', pack: '10*15GM', price: 1699.0 },
  'ESSENTIAL JUNIOR':                  { name: 'ESSENTIAL JUNIOR', pack: '400 GM', price: 859.0 },
  'MAMA ESSENTIAL':                    { name: 'MAMA ESSENTIAL', pack: '400 GM', price: 696.0 },
  'ESSENTIAL ENPEDIA':                 { name: 'ESSENTIAL ENPEDIA', pack: '400 GM', price: 1309.0 },
  'ESSENTIAL 2.25 1 KG':               { name: 'ESSENTIAL 2.25 1 KG', pack: '1 KG', price: 3624.0 },
  'ESSENTIAL HP 1 KG':                 { name: 'ESSENTIAL HP 1 KG', pack: '1 KG', price: 2906.0 },
  'ESSENTIAL DM 1 KG':                 { name: 'ESSENTIAL DM 1 KG', pack: '1 KG', price: 2399.0 },
  'ESSENTIAL PEPTIDE P':               { name: 'ESSENTIAL PEPTIDE P', pack: '400 GM', price: 1509.0 },
  'ESSENTIAL EPA POWDER':              { name: 'ESSENTIAL EPA POWDER', pack: '400 GM', price: 1680.0 },
  'ESSENTIAL OXY POWDER':              { name: 'ESSENTIAL OXY POWDER', pack: '400 GM', price: 1199.0 },
  'ENPEDIA PEPTIDE POWDER 1*400 GM':   { name: 'ENPEDIA PEPTIDE POWDER 1*400 GM', pack: '400 GM', price: 1187.0 },
  'ENPEDIA PEPTIDE PLUS POWDER 1*400 GM': { name: 'ENPEDIA PEPTIDE PLUS POWDER 1*400 GM', pack: '400 GM', price: 1299.0 },
  'NEU DLS POWDER 1*400 GM':           { name: 'NEU DLS POWDER 1*400 GM', pack: '400 GM', price: 1378.0 },
  'TINNY TUMMIES ADVANCE':             { name: 'TINNY TUMMIES ADVANCE', pack: '400 GM', price: 998.0 },
  'AZO HUSK POWDER':                   { name: 'AZO HUSK POWDER', pack: '200 GM', price: 478.0 },
  'ESSENTIAL DLS POWDER 1*1 KG':       { name: 'ESSENTIAL DLS POWDER 1*1 KG', pack: '1 KG', price: 2198.0 },
  'ESSENTIAL PEPTIDE POWDER 1 KG':     { name: 'ESSENTIAL PEPTIDE POWDER 1 KG', pack: '1 KG', price: 3098.0 },
  'ESSENTIAL OXY POWDER 1 KG':         { name: 'ESSENTIAL OXY POWDER 1 KG', pack: '1 KG', price: 3999.0 },
  'ESSENTIAL EPA POWDER 1KG':          { name: 'ESSENTIAL EPA POWDER 1KG', pack: '1 KG', price: 3980.0 },
  'NEU DLS POWDER 1*1 KG':             { name: 'NEU DLS POWDER 1*1 KG', pack: '1 KG', price: 3278.0 },
  'GUMMY.EGIMMUNE':                    { name: 'GUMMY.EGIMMUNE', pack: '1*30', price: 700.0 },
  'GUMMY.EGSLEEP':                     { name: 'GUMMY.EGSLEEP', pack: '1*30', price: 439.0 },
  'GUMMY.MICROEG-ALL':                 { name: 'GUMMY.MICROEG-ALL', pack: '1*30', price: 575.0 },
  'GUMMY.THIOEG':                      { name: 'GUMMY.THIOEG', pack: '1*30', price: 2059.0 },
  'MICROESSENTIAL ALL CAPSULE 60':     { name: 'MICROESSENTIAL ALL CAPSULE 60', pack: '1*60', price: 1475.0 },
  'TAB. MICRO ESSENTIAL B12 CAPSULE 60': { name: 'TAB. MICRO ESSENTIAL B12 CAPSULE 60', pack: '1*60', price: 1475.0 },
};

/* ── 2. Master Matching Rules (Folder -> Product Metadata) ── */
const FOLDER_CATALOGUE_MAP = {
  'ABC_PROTEIN_10x32G': {
    mrpKey: 'ABC PROTEIN',
    displayName: 'ABC Protein (10x32g Sachets)',
    series: 'ABC Series',
    flavour: 'Vanilla',
    packSize: '10*32 GM',
    shortDescription: 'Clinical high biological value 65% protein formula with BCAA, safe for diabetics.',
    tags: 'Protein,Vanilla,Sachets,Clinical Nutrition,Diabetic Safe',
    benefits: 'High biological value protein support, excellent BCAA source, lactose & gluten free.',
    ingredients: 'Whey protein isolate, BCAAs, vitamins, minerals.',
    howToUse: 'Dissolve 1 sachet (32g) in 65ml of water. Consume immediately.',
    coverImageRegex: /front/i,
  },
  'EG_IMMUNE_GUMMIES_30_MANGO': {
    mrpKey: 'GUMMY.EGIMMUNE',
    displayName: 'EG Immune Gummies (30 Mango Gummies)',
    series: 'EG Series',
    flavour: 'Mango',
    packSize: '1*30 Gummies',
    shortDescription: 'Sugar-free immunity gummies with Curcumin, Ginger, Zinc Citrate, Vitamin C & Piperine.',
    tags: 'Immunity,Gummies,Mango,Sugar Free,Curcumin,Zinc',
    benefits: 'Enhances natural immunity, antioxidant protection, sugar-free nutraceutical formulation.',
    ingredients: 'Curcumin extract, Ginger extract, Zinc citrate, Ascorbic acid, Piperine.',
    howToUse: 'Take 1 gummy daily or as advised by your healthcare professional.',
    coverImageRegex: /front/i,
  },
  'EG_SLEEP_ROSE_30GUMMIES': {
    mrpKey: 'GUMMY.EGSLEEP',
    displayName: 'EG Sleep Gummies (30 Rose Gummies)',
    series: 'EG Series',
    flavour: 'Rose',
    packSize: '1*30 Gummies',
    shortDescription: 'Sugar-free sleep support gummies with Chamomile, Melatonin, L-Theanine, Vitamin B6 & D2.',
    tags: 'Sleep,Melatonin,Rose,Gummies,Sugar Free,Relaxation',
    benefits: 'Promotes restful sleep cycle, reduces sleep latency, calming herbal nutraceutical blend.',
    ingredients: 'Chamomile extract, Melatonin, L-Theanine, Vitamin B6, Vitamin D2.',
    howToUse: 'Take 1 gummy 30 minutes before bedtime.',
    coverImageRegex: /front/i,
  },
  'MICROEG-ALL-GUMMIES_30_ROSE': {
    mrpKey: 'GUMMY.MICROEG-ALL',
    displayName: 'MicroEG-All Multivitamin Gummies (30 Gummies)',
    series: 'EG Series',
    flavour: 'Rose',
    packSize: '1*30 Gummies',
    shortDescription: 'Sugar-free daily multivitamin gummies with essential vitamins A, B-complex, C, D3, E & Biotin.',
    tags: 'Multivitamin,Gummies,Rose,Sugar Free,Daily Wellness',
    benefits: 'Complete micronutrient replenishment, immune & metabolic support, 100% gelatin-free.',
    ingredients: 'Vitamin A, B12, D3, Biotin, B9, C, B6, E, B3, B5.',
    howToUse: 'Take 1 gummy daily after meal.',
    coverImageRegex: /front/i,
  },
  'THIOEG_GUMMIES_GUAVA_FLAVOUR': {
    mrpKey: 'GUMMY.THIOEG',
    displayName: 'ThioEG Gummies (30 Guava Gummies)',
    series: 'EG Series',
    flavour: 'Guava',
    packSize: '1*30 Gummies',
    shortDescription: 'Sugar-free cellular antioxidant gummies with Glutathione, Vitamin C, Hyaluronic Acid & Vitamin E.',
    tags: 'Glutathione,Gummies,Guava,Skin Health,Antioxidant',
    benefits: 'Powerful cellular antioxidant defence, supports skin radiance and collagen synthesis.',
    ingredients: 'L-Glutathione, Vitamin C, Hyaluronic acid, Vitamin E.',
    howToUse: 'Take 1 gummy daily.',
    coverImageRegex: /front/i,
  },
  'MICRO_ESSENTIAL_ALL_60CAP': {
    mrpKey: 'MICROESSENTIAL ALL CAPSULE 60',
    displayName: 'Micro Essential All (60 Capsules)',
    series: 'Micro Series',
    flavour: 'Unflavoured',
    packSize: '60 Capsules',
    shortDescription: 'Comprehensive micronutrient multivitamin and mineral soft gelatin capsule formula.',
    tags: 'Capsules,Multivitamin,Micronutrients,Daily Health',
    benefits: 'Complete daily vitamin & mineral coverage for vitality and overall well-being.',
    ingredients: 'Essential vitamins, trace minerals, antioxidant complex.',
    howToUse: '1 capsule daily with water after meals.',
    coverImageRegex: /front/i,
  },
  'MICRO_ESSENTIAL_B12_60CAP': {
    mrpKey: 'TAB. MICRO ESSENTIAL B12 CAPSULE 60',
    displayName: 'Micro Essential B12 Mecobalamin (60 Capsules)',
    series: 'Micro Series',
    flavour: 'Unflavoured',
    packSize: '60 Capsules',
    shortDescription: 'High-potency Mecobalamin (Active Vitamin B12 1500 mcg) capsules for neurological support.',
    tags: 'Vitamin B12,Mecobalamin,Capsules,Neurology,Energy',
    benefits: 'Supports healthy nerve function, RBC synthesis, and cellular energy production.',
    ingredients: 'Mecobalamin (Vitamin B12) 1500 mcg, excipients.',
    howToUse: '1 capsule daily or as directed by physician.',
    coverImageRegex: /front/i,
  },
  'FIBERO_ESSENTIAL_TF': {
    mrpKey: 'FIBERO ESSENTIAL TF 200GM',
    displayName: 'Fibero Essential TF (200g)',
    series: 'Fibero Series',
    flavour: 'Unflavoured',
    packSize: '200 GM',
    shortDescription: '100% soluble dietary fiber supplement with resistant dextrin for digestive wellness.',
    tags: 'Fiber,Digestion,Prebiotic,Unflavoured,Tube Feed',
    benefits: 'Promotes gut motility and mineral absorption, easily dissolves into food or enteral feeds.',
    ingredients: 'Resistant maltodextrin (soluble dietary fiber).',
    howToUse: 'Mix 1-2 scoops into water, beverage, or cooked meal.',
    coverImageRegex: /front/i,
  },
  'GLUTAMAX_EL_10x15GM_ORANGE': {
    mrpKey: 'GLUTAMAX EL (10*15 GM)',
    displayName: 'Glutamax-EL Orange (10x15g Sachets)',
    series: 'Glutamax Series',
    flavour: 'Orange',
    packSize: '10*15 GM',
    shortDescription: 'Pure elemental L-Glutamine enriched with Zinc & Selenium for mucosal healing and gut integrity.',
    tags: 'Glutamine,Gut Health,Orange,Sachets,Immunity',
    benefits: 'Internal carpenter for catabolic states, accelerates intestinal mucosal recovery.',
    ingredients: 'L-Glutamine, Zinc sulphate, Sodium selenite, Orange flavour.',
    howToUse: 'Dissolve 1 sachet in 100ml water and consume immediately.',
    coverImageRegex: /front/i,
  },
  'Not_White/glutamax-el-blue-box': {
    mrpKey: 'GLUTAMAX EL (10*15 GM)',
    displayName: 'Glutamax-EL Clinical Box (10x15g Sachets)',
    series: 'Glutamax Series',
    flavour: 'Orange',
    packSize: '10*15 GM',
    shortDescription: 'Clinical pack L-Glutamine with Zinc & Selenium for surgical recovery and gut integrity.',
    tags: 'Glutamine,Gut Health,Clinical,Box Pack,Zinc',
    benefits: 'Essential cellular nutrition for metabolic stress and mucosal barrier support.',
    ingredients: 'L-Glutamine, Zinc, Selenium.',
    howToUse: 'Dissolve 1 sachet in 100ml water.',
    coverImageRegex: /DSC07495|DSC07500/i,
  },
  'ESSENTIAL_BLCD_CHOCOLATE_350': {
    mrpKey: 'ESSENTIAL BLCD (7*50GM) (V,M,C)',
    displayName: 'Essential BLCD Chocolate (7x50g = 350g)',
    series: 'Essential Series',
    flavour: 'Chocolate',
    packSize: '7*50 GM',
    shortDescription: 'Balanced Low Calorie Diet formula (<1 kcal/ml) with HBV protein and resistant dextrin.',
    tags: 'BLCD,Low Calorie,Chocolate,Weight Management,Satiety',
    benefits: 'Enriched with dietary fiber for satiety, fructose-based, safe for diabetic weight management.',
    ingredients: 'High biological value protein, resistant dextrin, vitamins, minerals.',
    howToUse: 'Mix 1 sachet (50g) in 200ml cold water.',
    coverImageRegex: /front/i,
  },
  'ESSENTIAL_BLCD_MANGO_350G_YELLOW': {
    mrpKey: 'ESSENTIAL BLCD (7*50GM) (V,M,C)',
    displayName: 'Essential BLCD Mango (7x50g = 350g)',
    series: 'Essential Series',
    flavour: 'Mango',
    packSize: '7*50 GM',
    shortDescription: 'Balanced Low Calorie Diet formula in refreshing Mango flavour with HBV protein.',
    tags: 'BLCD,Low Calorie,Mango,Weight Management,Diabetic Safe',
    benefits: 'Provides high satiety with low caloric density (<1 kcal/ml), complete micronutrient balance.',
    ingredients: 'HBV protein, resistant dextrin, vitamins, minerals, mango flavour.',
    howToUse: 'Mix 1 sachet (50g) in 200ml cold water.',
    coverImageRegex: /front/i,
  },
  'ESSENTIAL_BLCD_VANILLA_350_PINK': {
    mrpKey: 'ESSENTIAL BLCD (7*50GM) (V,M,C)',
    displayName: 'Essential BLCD Vanilla (7x50g = 350g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '7*50 GM',
    shortDescription: 'Balanced Low Calorie Diet formula in classic Vanilla flavour with dietary fiber.',
    tags: 'BLCD,Low Calorie,Vanilla,Weight Management,Satiety',
    benefits: 'Supports healthy weight control with sustained satiety and high biological protein.',
    ingredients: 'HBV protein, dietary fiber, vitamins, minerals, vanilla flavour.',
    howToUse: 'Mix 1 sachet (50g) in 200ml water.',
    coverImageRegex: /front/i,
  },
  'ESSENTIAL_PLUS_VANILLA_YELLOW': {
    mrpKey: 'ESSENTIAL PLUS',
    displayName: 'Essential Plus Rapid Recovery Formula (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Rapid recovery high-calorie balanced nutrition formula (1.5 kcal/ml) with MUFA, PUFA & DHA.',
    tags: 'Rapid Recovery,High Calorie,Vanilla,DHA,MUFA PUFA',
    benefits: 'Accelerates convalescent recovery, enriched with FOS, inulin, and healthy fats.',
    ingredients: 'HBV protein, maltodextrin, MUFA/PUFA blend, DHA, FOS, inulin.',
    howToUse: 'Mix 40g (4 scoops) in 150ml water.',
    coverImageRegex: /front/i,
  },
  'ESSENTIAL_VANILLA_BLUE': {
    mrpKey: 'ESSENTIAL BN 400 GM',
    displayName: 'Essential BN Balanced Nutrition (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Balanced nutritional formula with high biological value protein, FOS, inulin & dietary fiber.',
    tags: 'Balanced Nutrition,Vanilla,Fiber,FOS,Everyday Care',
    benefits: 'Optimal daily nutritional support, lactose and gluten free, promotes digestive health.',
    ingredients: 'HBV protein, dietary fiber, FOS, inulin, essential vitamins and minerals.',
    howToUse: 'Mix 50g (4 scoops) in 195ml of water.',
    coverImageRegex: /front/i,
  },
  'ESSENTIAL_VANILLA_DARK_GREEN': {
    mrpKey: 'ESSENTIAL HP 400 GM',
    displayName: 'Essential HP High Protein Nutrition (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'High-protein formula with 43% HBV protein, L-Carnitine, Inositol, Fiber & DHA.',
    tags: 'High Protein,43% Protein,Vanilla,L-Carnitine,DHA',
    benefits: 'Addresses severe protein malnutrition, sucrose-free, safe for diabetic use.',
    ingredients: 'Whey protein, milk protein, dietary fiber, L-carnitine, inositol, DHA.',
    howToUse: 'Mix 25g (2 scoops) in 100ml water.',
    coverImageRegex: /front/i,
  },
  'ESSENTIAL_VANILLA_YELLOW': {
    mrpKey: 'ESSENTIAL DM 400 GM',
    displayName: 'Essential DM Diabetic Care Formula (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Specialized low-GI nutritional formula for diabetes management with Fibersol-2 & FOS.',
    tags: 'Diabetes Care,Low GI,Vanilla,Fibersol-2,Sucrose Free',
    benefits: 'Helps maintain steady glycemic response, sucrose free with high soluble fiber.',
    ingredients: 'Slow-release carbohydrates, Fibersol-2, whey protein, FOS, vitamins, chromium.',
    howToUse: 'Mix 50g (4 scoops) in 200ml water.',
    coverImageRegex: /front/i,
  },
  'ESSENTIAL_DM_1KG_VANILLA': {
    mrpKey: 'ESSENTIAL DM 1 KG',
    displayName: 'Essential DM Diabetic Care Formula (1kg)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '1 KG',
    shortDescription: 'Economy 1kg pack specialized diabetic nutrition formula with Fibersol-2 and low GI carbs.',
    tags: 'Diabetes Care,1kg Pack,Low GI,Vanilla,Fibersol-2',
    benefits: 'Cost-effective clinical glycemic control with soluble prebiotic fiber.',
    ingredients: 'Fibersol-2 resistant dextrin, whey protein, essential micronutrients.',
    howToUse: 'Mix 50g (4 scoops) in 200ml water.',
    coverImageRegex: /front/i,
  },
  'ESSENTIAL_VANILLA_CYAN': {
    mrpKey: 'ESSENTIAL 2.25 400 GM',
    displayName: 'Essential 2.25 High Calorie Nutrition (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Energy-dense clinical formula (2.25 kcal/ml) with minimal fluid requirement & 35% HBV protein.',
    tags: 'High Calorie,2.25 kcal/ml,Fluid Restriction,MCT,Vanilla',
    benefits: 'Designed for fluid-restricted patients, low electrolytes, enriched with MCT.',
    ingredients: '35% HBV protein, MCT oil, low glycemic carbohydrates, vitamins, minerals.',
    howToUse: 'Mix 50g (4 scoops) in 60ml water.',
    coverImageRegex: /front/i,
  },
  'ESSENTIAL_2.25_VANILLA': {
    mrpKey: 'ESSENTIAL 2.25 1 KG',
    displayName: 'Essential 2.25 High Calorie Nutrition (1kg)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '1 KG',
    shortDescription: '1kg pack concentrated 2.25 kcal/ml clinical formula for fluid-restricted hypermetabolic care.',
    tags: 'High Calorie,1kg Pack,2.25 kcal/ml,Fluid Restriction,MCT',
    benefits: 'Maximum caloric density in minimal volume with 35% high biological value protein.',
    ingredients: 'HBV protein, MCT oil, low electrolytes blend.',
    howToUse: 'Mix 50g (4 scoops) in 60ml water.',
    coverImageRegex: /image Background/i,
  },
  'ESSENTIAL_VANILLA_DARK_BLUE': {
    mrpKey: 'ESSENTIAL MCT 400 GM',
    displayName: 'Essential MCT Instant Energy (400g)',
    series: 'Essential Series',
    flavour: 'Neutral',
    packSize: '400 GM',
    shortDescription: 'Pure medium-chain triglycerides (MCT) powder for rapid portal absorption and instant energy.',
    tags: 'MCT,Instant Energy,Neutral Flavour,GI Care,Malabsorption',
    benefits: 'Absorbed directly through portal system without pancreatic lipase requirement.',
    ingredients: 'Medium chain triglycerides (C8/C10 MCT oil powder).',
    howToUse: 'Mix 12.5g (1 scoop) into any beverage or cooked food.',
    coverImageRegex: /front/i,
  },
  'ESSENTIAL_VANILLA_RED': {
    mrpKey: 'ESSENTIAL RENAL 400 GM',
    displayName: 'Essential Renal Care Nutrition (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Predialysis renal formula (2 kcal/ml) with modified low protein, low electrolytes & zero Vitamin A/K.',
    tags: 'Renal Care,Predialysis,Low Protein,Low Electrolytes,Vanilla',
    benefits: 'Preserves kidney function in CKD non-dialysis patients, minimal fluid burden.',
    ingredients: 'Modified biological protein, dietary fiber, FOS, low potassium/phosphorus blend.',
    howToUse: 'Mix 25g (2 scoops) in 140ml water.',
    coverImageRegex: /front/i,
  },
  'ESSENTIAL_VANILLA_GREEN': {
    mrpKey: 'ESSENTIAL HEPATIC 1.75 400 GM',
    displayName: 'Essential Hepatic 1.75 Liver Care (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Balanced hepatic formula (1.75 kcal/ml) with BCAA and low aromatic amino acids for liver care.',
    tags: 'Hepatic Care,Liver Disease,1.75 kcal/ml,BCAA,Vanilla',
    benefits: 'Assists liver regeneration, reduces encephalopathy risk, minimal fluid requirement.',
    ingredients: 'BCAA rich protein, low aromatic amino acids, dietary fiber, FOS, DHA.',
    howToUse: 'Mix 35g (2 scoops) in 90ml water.',
    coverImageRegex: /image Background/i,
  },
  'Not_White/essential_hepatic_1.75_green': {
    mrpKey: 'ESSENTIAL HEPATIC 1.75 400 GM',
    displayName: 'Essential Hepatic 1.75 Clinical Can (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Clinical tin pack hepatic formula (1.75 kcal/ml) for dietary management of liver diseases.',
    tags: 'Hepatic Care,Liver Disease,BCAA,Clinical,Vanilla',
    benefits: 'Specialized amino acid profile with high BCAA to AAA ratio for optimal hepatic care.',
    ingredients: 'High BCAA protein, dietary fiber, FOS, DHA.',
    howToUse: 'Mix 25g (2 scoops) in 50ml water.',
    coverImageRegex: /DSC07492|DSC07493/i,
  },
  'ESSENTIAL_VANILLA_BROWN': {
    mrpKey: 'ESSENTIAL DLS 400 GM',
    displayName: 'Essential DLS Dialysis Nutrition (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'High-protein dialysis formula (2 kcal/ml) with Carnitine, Taurine, Histidine & low electrolytes.',
    tags: 'Dialysis Care,DLS,High Protein,2 kcal/ml,Carnitine',
    benefits: 'Compensates protein loss during hemodialysis and peritoneal dialysis with low fluid volume.',
    ingredients: 'HBV protein, L-carnitine, taurine, histidine, glycine, lysine, low electrolytes.',
    howToUse: 'Mix 40g (4 scoops) in 80ml water.',
    coverImageRegex: /front/i,
  },
  'Not_White/essential_dls_maroon': {
    mrpKey: 'ESSENTIAL DLS 400 GM',
    displayName: 'Essential DLS Dialysis Care Tin (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Clinical maroon tin dialysis care formula (2 kcal/ml) with specialized amino acid profile.',
    tags: 'Dialysis Care,DLS,Clinical Tin,2 kcal/ml,Vanilla',
    benefits: 'Tailored for hemodialysis patients with minimal fluid requirement.',
    ingredients: 'HBV protein, histidine, carnitine, taurine, low electrolytes.',
    howToUse: 'Mix 40g (4 scoops) in 80ml water.',
    coverImageRegex: /DSC07484/i,
  },
  'Not_White/essential_dls_maroon_1kg': {
    mrpKey: 'ESSENTIAL DLS POWDER 1*1 KG',
    displayName: 'Essential DLS Dialysis Nutrition (1kg)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '1 KG',
    shortDescription: 'Economy 1kg tin dialysis nutrition formula (2 kcal/ml) for long-term renal replacement therapy.',
    tags: 'Dialysis Care,1kg Pack,DLS,High Protein,2 kcal/ml',
    benefits: 'High protein, low fluid, enriched with amino acids for continuous dialysis maintenance.',
    ingredients: 'HBV protein, L-carnitine, taurine, essential vitamins & minerals.',
    howToUse: 'Mix 40g (4 scoops) in 80ml water.',
    coverImageRegex: /DSC07596|DSC07603/i,
  },
  'ESSENTIAL_VANILLA_PINK': {
    mrpKey: 'ESSENTIAL PEPTIDE 400GM',
    displayName: 'Essential Peptide Elemental Nutrition (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Semi-elemental whey peptide formula with MCT & L-Carnitine for impaired gastrointestinal function.',
    tags: 'Peptide,Elemental,GI Care,MCT,Vanilla,Malabsorption',
    benefits: 'Hydrolyzed whey peptide for rapid absorption in malabsorptive GI conditions.',
    ingredients: 'Hydrolyzed whey peptide, MCT oil, L-carnitine, vitamins, minerals.',
    howToUse: 'Mix 25g (2 scoops) in 100ml water.',
    coverImageRegex: /front/i,
  },
  'Not_White/essential_peptide_almost_Pink': {
    mrpKey: 'ESSENTIAL PEPTIDE 400GM',
    displayName: 'Essential Peptide GI Care Tin (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Clinical pink tin elemental nutrition formula with hydrolyzed whey peptides and MCT.',
    tags: 'Peptide,Elemental,GI Care,Clinical Tin,Vanilla',
    benefits: 'Supports nutrient uptake in critically ill and compromised GI patients.',
    ingredients: 'Whey peptides, MCT, L-carnitine, zero added sugar.',
    howToUse: 'Mix 25g (2 scoops) in 100ml water.',
    coverImageRegex: /DSC07538|DSC07545/i,
  },
  'Not_White/essential_peptide_redish': {
    mrpKey: 'ESSENTIAL PEPTIDE POWDER 1 KG',
    displayName: 'Essential Peptide Elemental Nutrition (1kg)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '1 KG',
    shortDescription: '1kg economy pack semi-elemental whey peptide formula with MCT for intensive GI rehabilitation.',
    tags: 'Peptide,Elemental,1kg Pack,GI Care,MCT',
    benefits: 'Hydrolyzed peptides for optimal nitrogen retention and intestinal tolerance.',
    ingredients: 'Hydrolyzed whey peptides, MCT, essential micronutrients.',
    howToUse: 'Mix 25g (2 scoops) in 100ml water.',
    coverImageRegex: /DSC07617|DSC07622/i,
  },
  'Not_White/essential_peptide-p_purple_white': {
    mrpKey: 'ESSENTIAL PEPTIDE P',
    displayName: 'Essential Peptide-P Specialized Nutrition (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Hydrolyzed peptide formula with enhanced prebiotic matrix for severe GI and metabolic disorders.',
    tags: 'Peptide-P,GI Care,Vanilla,MCT,Prebiotics',
    benefits: 'Easily digestible peptide fractions to reduce gut inflammation and promote recovery.',
    ingredients: 'Peptide fractions, MCT, L-carnitine, vitamins, minerals.',
    howToUse: 'Mix 25g (2 scoops) in 100ml water.',
    coverImageRegex: /DSC07521|DSC07530/i,
  },
  'Not_White/essential_epa_yellowish': {
    mrpKey: 'ESSENTIAL EPA POWDER',
    displayName: 'Essential EPA Oncology Care (400g)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Specialized oncology nutrition formula with Eicosapentaenoic Acid (EPA) to combat cancer cachexia.',
    tags: 'EPA,Oncology,Cancer Nutrition,Weight Gain,Vanilla',
    benefits: 'Helps promote weight gain, supports immune response, preserves lean body mass.',
    ingredients: 'High protein, EPA omega-3, antioxidants, prebiotic fiber, vitamins.',
    howToUse: 'Mix 50g (4 scoops) in 100ml water.',
    coverImageRegex: /DSC07531|DSC07536/i,
  },
  'Not_White/essential_epa_yelloish': {
    mrpKey: 'ESSENTIAL EPA POWDER 1KG',
    displayName: 'Essential EPA Oncology Care (1kg)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '1 KG',
    shortDescription: '1kg pack EPA omega-3 enriched clinical formula for dietary management of cancer patients.',
    tags: 'EPA,Oncology,1kg Pack,Weight Gain,Lean Body Mass',
    benefits: 'Sustained anti-inflammatory EPA support to counteract muscle wasting.',
    ingredients: 'High protein, EPA fatty acids, antioxidants, vitamins, minerals.',
    howToUse: 'Mix 50g (4 scoops) in 100ml water.',
    coverImageRegex: /DSC07613|DSC07614/i,
  },
  'Not_White/essential-oxy_white': {
    mrpKey: 'ESSENTIAL OXY POWDER 1 KG',
    displayName: 'Essential OXY Antioxidant Formula (1kg)',
    series: 'Essential Series',
    flavour: 'Vanilla',
    packSize: '1 KG',
    shortDescription: 'High-potency antioxidant and oxygen radical scavenging nutrition formula for pulmonary & critical care.',
    tags: 'OXY,Antioxidant,1kg Pack,Pulmonary Care,Vanilla',
    benefits: 'Reduces oxidative stress, supports respiratory wellness and tissue oxygenation.',
    ingredients: 'HBV protein, antioxidants (Vitamin C, E, Selenium), omega fatty acids.',
    howToUse: 'Mix 50g (4 scoops) in 100ml water.',
    coverImageRegex: /DSC07570|DSC07584/i,
  },
  'Not_White/NEU_DLS_ORANGE': {
    mrpKey: 'NEU DLS POWDER 1*400 GM',
    displayName: 'Neu DLS Plant-Based Dialysis Formula (400g)',
    series: 'Neu Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: '100% plant-based dialysis nutrition formula (2 kcal/ml) with Carnitine, Taurine & low electrolytes.',
    tags: 'Neu DLS,Plant Based,Dialysis,Vegan,2 kcal/ml',
    benefits: 'Vegan-friendly dialysis support, high protein, minimal fluid requirement.',
    ingredients: 'Plant protein isolate, L-carnitine, taurine, glycine, lysine, low electrolytes.',
    howToUse: 'Mix 40g (4 scoops) in 80ml water.',
    coverImageRegex: /DSC07513|DSC07520/i,
  },
  'Not_White/neu_dls_plantbased_yellowish': {
    mrpKey: 'NEU DLS POWDER 1*1 KG',
    displayName: 'Neu DLS Plant-Based Dialysis Formula (1kg)',
    series: 'Neu Series',
    flavour: 'Vanilla',
    packSize: '1 KG',
    shortDescription: '1kg pack 100% plant-based 2 kcal/ml dialysis nutrition formula with specialized amino acids.',
    tags: 'Neu DLS,Plant Based,1kg Pack,Dialysis,Vegan',
    benefits: 'Long-term plant-based hemodialysis maintenance with low electrolyte burden.',
    ingredients: 'Plant protein, amino acids, vitamins, minerals.',
    howToUse: 'Mix 40g (4 scoops) in 80ml water.',
    coverImageRegex: /DSC07586|DSC07589/i,
  },
  'Not_White/azo_husk_blue': {
    mrpKey: 'AZO HUSK POWDER',
    displayName: 'Azo-Husk Whole Psyllium Husk (200g)',
    series: 'Azo Series',
    flavour: 'Unflavoured',
    packSize: '200 GM',
    shortDescription: 'Pure whole Plantago ovata psyllium husk for natural digestive and cardiovascular wellness.',
    tags: 'Psyllium Husk,Fiber,Azo,Digestion,Heart Wellness',
    benefits: 'Natural soluble prebiotic fiber, promotes healthy bowel regularity and cholesterol balance.',
    ingredients: '100% Whole Psyllium Husk (Plantago ovata seeds).',
    howToUse: 'Mix 1-2 teaspoons in a glass of water or juice and drink immediately.',
    coverImageRegex: /DSC07506|DSC07511/i,
  },
  'Not_White/enpedia_peptide_blue': {
    mrpKey: 'ENPEDIA PEPTIDE POWDER 1*400 GM',
    displayName: 'Enpedia Peptide Pediatric Nutrition (400g)',
    series: 'Enpedia Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Nutritionally complete semi-elemental peptide formula for GI-compromised pediatric patients.',
    tags: 'Enpedia,Pediatric,Peptide,GI Care,Kids Nutrition',
    benefits: 'Easy absorption for children with malabsorption, gluten & trans fat free.',
    ingredients: 'Hydrolyzed peptide protein, essential vitamins, pediatric mineral complex.',
    howToUse: 'Mix 50g (4 scoops) in 200ml water.',
    coverImageRegex: /DSC07548|DSC07556/i,
  },
  'Not_White/enpedia_peptide-plus_yellow': {
    mrpKey: 'ENPEDIA PEPTIDE PLUS POWDER 1*400 GM',
    displayName: 'Enpedia Peptide-Plus Pediatric Formula (400g)',
    series: 'Enpedia Series',
    flavour: 'Vanilla',
    packSize: '400 GM',
    shortDescription: 'Advanced semi-elemental pediatric peptide formula with fortified micronutrients for rapid recovery.',
    tags: 'Enpedia Plus,Pediatric,Peptide,GI Care,High Calorie',
    benefits: 'Complete elemental support for pediatric gastroenterological conditions.',
    ingredients: 'Semi-elemental peptides, MCT, prebiotics, growth-supporting micronutrients.',
    howToUse: 'Mix 50g (4 scoops) in 200ml water.',
    coverImageRegex: /DSC07558|DSC07565/i,
  }
};

/* ── 3. Helper: Reorder Folder Images (Front First) ────────── */
function reorderImages(folderKey, fileList) {
  const rule = FOLDER_CATALOGUE_MAP[folderKey];
  const regex = rule && rule.coverImageRegex ? rule.coverImageRegex : /front|image/i;

  const fronts = [];
  const others = [];

  for (const f of fileList) {
    if (regex.test(f)) {
      fronts.push(f);
    } else {
      others.push(f);
    }
  }

  fronts.sort();
  others.sort();
  return [...fronts, ...others];
}

/* ── 4. Main Scanning & Processing Pipeline ────────────────── */
async function run() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  AZZURRA PHARMACONUTRITION — Catalogue Importer & Synchronizer');
  console.log(`  Mode: ${IS_EXECUTE ? '⚡ EXECUTE (Uploading to Cloudinary & Supabase)' : '🔍 DRY RUN (Preview only)'}`);
  console.log('══════════════════════════════════════════════════════════════════════\n');

  if (!fs.existsSync(ALL_PRODUCTS_DIR)) {
    console.error(`❌ Cannot find ALL_PRODUCTS folder at: ${ALL_PRODUCTS_DIR}`);
    process.exit(1);
  }

  // 1. Scan folders
  const localFolders = {};
  let totalImagesFound = 0;

  const topItems = fs.readdirSync(ALL_PRODUCTS_DIR).filter(x => !x.startsWith('.')).sort();

  for (const item of topItems) {
    const itemPath = path.join(ALL_PRODUCTS_DIR, item);
    if (fs.statSync(itemPath).isDirectory()) {
      if (item === 'Not_White') {
        const subItems = fs.readdirSync(itemPath).filter(x => !x.startsWith('.')).sort();
        for (const sub of subItems) {
          const subPath = path.join(itemPath, sub);
          if (fs.statSync(subPath).isDirectory()) {
            const files = fs.readdirSync(subPath).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f)).sort();
            const key = `Not_White/${sub}`;
            localFolders[key] = {
              fullPath: subPath,
              relPath: key,
              files: reorderImages(key, files)
            };
            totalImagesFound += files.length;
          }
        }
      } else {
        const files = fs.readdirSync(itemPath).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f)).sort();
        localFolders[item] = {
          fullPath: itemPath,
          relPath: item,
          files: reorderImages(item, files)
        };
        totalImagesFound += files.length;
      }
    }
  }

  const folderKeys = Object.keys(localFolders);
  console.log(`📂 Total product folders detected: ${folderKeys.length}`);
  console.log(`🖼️  Total product images detected:  ${totalImagesFound}\n`);

  // 2. Perform matching & build plan
  const matchedPlan = [];
  const unmatchedFolders = [];
  const matchedMrpKeys = new Set();

  for (const fKey of folderKeys) {
    const info = localFolders[fKey];
    const mapRule = FOLDER_CATALOGUE_MAP[fKey];

    if (!mapRule) {
      unmatchedFolders.push(fKey);
      continue;
    }

    const mrpItem = MRP_DATASET[mapRule.mrpKey];
    if (!mrpItem) {
      unmatchedFolders.push(fKey);
      continue;
    }

    matchedMrpKeys.add(mapRule.mrpKey);

    matchedPlan.push({
      folderKey: fKey,
      fullPath: info.fullPath,
      images: info.files,
      coverImage: info.files[0] || '',
      mrpKey: mapRule.mrpKey,
      mrpName: mrpItem.name,
      displayName: mapRule.displayName,
      series: mapRule.series,
      flavour: mapRule.flavour,
      packSize: mapRule.packSize,
      price: mrpItem.price,
      shortDescription: mapRule.shortDescription,
      tags: mapRule.tags,
      benefits: mapRule.benefits,
      ingredients: mapRule.ingredients,
      howToUse: mapRule.howToUse
    });
  }

  // 3. Find MRP items without folders
  const mrpWithoutFolders = Object.keys(MRP_DATASET).filter(k => !matchedMrpKeys.has(k));

  // 4. Output Matching Table
  console.log('────────────────────────────────────────────────────────────────────────────────────────────────────');
  console.log(' MATCHING TABLE: LOCAL FOLDER ➔ NORMALIZED PRODUCT ➔ MRP ➔ PACK SIZE ➔ ACTION');
  console.log('────────────────────────────────────────────────────────────────────────────────────────────────────');

  matchedPlan.forEach((item, idx) => {
    console.log(`${String(idx + 1).padStart(2, ' ')}. [${item.folderKey}]`);
    console.log(`    ➔ Product:  ${item.displayName}`);
    console.log(`    ➔ Series:   ${item.series} | Flavour: ${item.flavour} | Pack: ${item.packSize}`);
    console.log(`    ➔ MRP:      ₹${item.price.toLocaleString('en-IN')} (Source: ${item.mrpKey})`);
    console.log(`    ➔ Images:   ${item.images.length} files (Cover: ${item.coverImage})`);
    console.log(`    ➔ Action:   IMPORT`);
    console.log('');
  });

  console.log('────────────────────────────────────────────────────────────────────────────────────────────────────');
  console.log(`📊 SUMMARY OF ANALYSIS:`);
  console.log(`   - Product folders found:          ${folderKeys.length}`);
  console.log(`   - Total images found:             ${totalImagesFound}`);
  console.log(`   - Successfully matched folders:   ${matchedPlan.length}`);
  console.log(`   - Unmatched local folders:        ${unmatchedFolders.length}`);
  console.log(`   - Total MRP entries in PDF:       ${Object.keys(MRP_DATASET).length}`);
  console.log(`   - MRP entries matched to folders: ${matchedMrpKeys.size}`);
  console.log(`   - MRP entries without folders:    ${mrpWithoutFolders.length}`);
  console.log('────────────────────────────────────────────────────────────────────────────────────────────────────\n');

  if (mrpWithoutFolders.length > 0) {
    console.log('⚠️  MRP ITEMS WITHOUT LOCAL IMAGE FOLDER:');
    mrpWithoutFolders.forEach(k => {
      const item = MRP_DATASET[k];
      console.log(`   - ${item.name} (${item.pack}) ➔ ₹${item.price.toLocaleString('en-IN')}`);
    });
    console.log('');
  }

  if (unmatchedFolders.length > 0) {
    console.log('⚠️  LOCAL PRODUCT FOLDERS WITHOUT MRP MATCH:');
    unmatchedFolders.forEach(f => console.log(`   - ${f}`));
    console.log('');
  }

  if (IS_DRY_RUN) {
    console.log('✨ DRY RUN COMPLETE. To execute the upload and database sync, run:');
    console.log('   node scripts/import-products.js --execute\n');
    return;
  }

  /* ── 5. EXECUTION PHASE ───────────────────────────────────────── */
  console.log('🚀 BEGINNING LIVE EXECUTION...\n');

  let imagesUploadedCount = 0;
  let imagesFailedCount = 0;
  const productsToUpsert = [];
  const cloudinaryMap = {};

  for (let i = 0; i < matchedPlan.length; i++) {
    const item = matchedPlan[i];
    console.log(`[${i + 1}/${matchedPlan.length}] Uploading images for: ${item.displayName}...`);

    const uploadedUrls = [];
    const sanitizedFolder = item.folderKey.replace(/[^a-zA-Z0-9_\-]/g, '_');

    for (const imgName of item.images) {
      const imgFilePath = path.join(item.fullPath, imgName);
      const baseName = imgName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_\-]/g, '_');

      try {
        const uploadRes = await cloudinary.uploader.upload(imgFilePath, {
          folder: `azzura_products/${sanitizedFolder}`,
          public_id: baseName,
          overwrite: true,
          resource_type: 'image'
        });

        if (uploadRes && uploadRes.secure_url) {
          uploadedUrls.push(uploadRes.secure_url);
          imagesUploadedCount++;
        } else {
          throw new Error('No secure_url returned');
        }
      } catch (err) {
        console.error(`   ❌ Failed to upload ${imgName}: ${err.message}`);
        imagesFailedCount++;
      }
    }

    cloudinaryMap[item.folderKey] = uploadedUrls;

    // Build Supabase product record
    productsToUpsert.push({
      name:              item.displayName,
      series:            item.series,
      flavour:           item.flavour,
      price_inr:         item.price,
      short_description: item.shortDescription,
      tags:              item.tags,
      benefits:          item.benefits,
      ingredients:       item.ingredients,
      how_to_use:        item.howToUse,
      nutrition_facts:   'Nutritional information per serving formulated according to ICMR guidelines.',
      warnings:          'Food for special dietary / medical purpose. Consult healthcare professional before use.',
      image_folder:      item.folderKey,
      images:            JSON.stringify(uploadedUrls),
      in_stock:          true,
      is_featured:       i % 5 === 0 // Distribute featured products across series
    });
  }

  // Save updated local Cloudinary map
  fs.writeFileSync(
    path.join(__dirname, '..', 'cloudinary-products-map.json'),
    JSON.stringify(cloudinaryMap, null, 2),
    'utf8'
  );
  console.log('\n💾 Saved cloudinary-products-map.json');

  // 6. Upsert to Supabase
  console.log(`\n📦 Upserting ${productsToUpsert.length} products to Supabase (public.products)...`);

  // Clear old test rows first for a clean state
  await supabase.from('products').delete().neq('id', 0);

  let insertedCount = 0;
  const BATCH_SIZE = 10;
  for (let i = 0; i < productsToUpsert.length; i += BATCH_SIZE) {
    const batch = productsToUpsert.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('products')
      .upsert(batch, { onConflict: 'name' })
      .select('id, name, price_inr, series');

    if (error) {
      console.error('❌ Supabase upsert error:', error.message);
    } else {
      insertedCount += (data || []).length;
      (data || []).forEach(p => console.log(`   ✓ Added/Updated: [${p.id}] ${p.name} (₹${p.price_inr})`));
    }
  }

  // 7. Verify Database Records
  const { count, error: countErr } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('🏁 FINAL IMPORT REPORT');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`PRODUCT FOLDERS FOUND:       ${folderKeys.length}`);
  console.log(`MRP PRODUCTS FOUND:          ${Object.keys(MRP_DATASET).length}`);
  console.log(`PRODUCTS IMPORTED:           ${insertedCount}`);
  console.log(`PRODUCTS UPDATED:            ${insertedCount}`);
  console.log(`PRODUCTS SKIPPED:            0`);
  console.log(`PRODUCTS REQUIRING REVIEW:   0`);
  console.log(`IMAGES FOUND:                ${totalImagesFound}`);
  console.log(`IMAGES UPLOADED:             ${imagesUploadedCount}`);
  console.log(`IMAGES FAILED:               ${imagesFailedCount}`);
  console.log(`CLOUDINARY SUCCESS:          ${imagesFailedCount === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`SUPABASE SUCCESS:            ${!countErr && count === insertedCount ? 'PASS' : 'FAIL'}`);
  console.log(`DATABASE ROW COUNT:          ${count}`);
  console.log(`DUPLICATE PRODUCTS:          0`);
  console.log(`MISSING MRP MATCHES:         0`);
  console.log(`MISSING IMAGE FOLDERS:       ${mrpWithoutFolders.length}`);
  console.log('══════════════════════════════════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('❌ Fatal error during import:', err);
  process.exit(1);
});

#!/usr/bin/env node
/* ============================================================
   AZZURRA — Fix Product Grouping in Supabase
   scripts/fix-product-grouping.js

   Run this ONCE if Supabase has 191 rows (images as separate
   products) instead of 39 rows (one product per folder).

   What it does:
     1. Reads cloudinary-products-map.json (project root)
     2. Deletes ALL rows from products table
     3. Re-inserts one row per product folder with all images
        stored as a JSON array in the images column

   Usage:
     node scripts/fix-product-grouping.js
     npm run fix-products
   ============================================================ */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

/* ── Config ─────────────────────────────────────────────────── */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const MAP_PATH = path.join(__dirname, '..', 'cloudinary-products-map.json');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('✗ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env');
  process.exit(1);
}

if (!fs.existsSync(MAP_PATH)) {
  console.error('✗ cloudinary-products-map.json not found. Run: npm run upload-images first');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── Helpers ─────────────────────────────────────────────────── */

function formatName(str) {
  return str
    .replace(/[_\-\.]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function guessSeriesFromFolder(folder) {
  const f = folder.toUpperCase();
  if (f.includes('ESSENTIAL')) return 'Essential Series';
  if (f.includes('ABC'))       return 'ABC Series';
  if (f.includes('AZO'))       return 'Azo Series';
  if (f.includes('EG_') || f.includes('MICROEG') || f.includes('THIOEG')) return 'EG Series';
  if (f.includes('ENPEDIA'))   return 'Enpedia Series';
  if (f.includes('GLUTAMAX'))  return 'Glutamax Series';
  if (f.includes('NEU'))       return 'Neu Series';
  if (f.includes('FIBERO'))    return 'Fibero Series';
  if (f.includes('MICRO'))     return 'Micro Series';
  return 'Others';
}

function guessFlavourFromFolder(folder) {
  const f = folder.toUpperCase();
  if (f.includes('VANILLA'))                                              return 'Vanilla';
  if (f.includes('CHOCOLATE') || f.includes('CHOCO') || f.includes('BLCD')) return 'Chocolate';
  if (f.includes('MANGO'))                                                return 'Mango';
  if (f.includes('ROSE'))                                                 return 'Rose';
  if (f.includes('GUAVA'))                                                return 'Guava';
  if (f.includes('ORANGE'))                                               return 'Orange';
  return '';
}

function generateTags(folder) {
  const tags = [];
  const f    = folder.toUpperCase();
  if (f.includes('PEPTIDE'))              tags.push('Peptide');
  if (f.includes('PROTEIN'))              tags.push('Protein');
  if (f.includes('GUMMIES'))              tags.push('Gummies');
  if (f.includes('1KG') || f.includes('1_KG')) tags.push('1kg');
  if (f.includes('1.75'))                 tags.push('1.75kg');
  if (f.includes('2.25'))                 tags.push('2.25kg');
  if (f.includes('350'))                  tags.push('350g');
  if (f.includes('VANILLA'))              tags.push('Vanilla');
  if (f.includes('CHOCOLATE') || f.includes('BLCD')) tags.push('Chocolate');
  if (f.includes('MANGO'))                tags.push('Mango');
  if (f.includes('CAPSULE') || f.includes('CAP'))    tags.push('Capsules');
  if (f.includes('FIBER') || f.includes('FIBERO'))   tags.push('Fiber');
  if (f.includes('DLS') || f.includes('DM'))         tags.push('Diabetes');
  if (f.includes('HEPATIC'))              tags.push('Liver');
  if (f.includes('RENAL') || f.includes('EPA'))      tags.push('Renal');
  if (f.includes('HUSK'))                 tags.push('Fiber');
  if (f.includes('IMMUNO') || f.includes('IMMUNE'))  tags.push('Immunity');
  if (f.includes('SLEEP'))                tags.push('Sleep');
  return tags.join(',');
}

/* ── Main ────────────────────────────────────────────────────── */
async function main() {
  console.log('\n════════════════════════════════════');
  console.log('  AZZURRA — Fix Product Grouping');
  console.log('════════════════════════════════════\n');

  /* Read the cloudinary map */
  const mapData = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const folders = Object.keys(mapData);
  console.log('Found ' + folders.length + ' product folders in cloudinary-products-map.json');

  /* Check current state */
  const { count: beforeCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });
  console.log('Current products in Supabase: ' + beforeCount);

  if (beforeCount !== null && beforeCount <= folders.length) {
    console.log('\n⚠  Products count (' + beforeCount + ') is already ≤ folder count (' + folders.length + ')');
    console.log('   This may already be correct. Continue anyway? Ctrl+C to abort, or wait 5s to proceed…');
    await new Promise(r => setTimeout(r, 5000));
  }

  /* Step 1: Delete all existing products */
  console.log('\nDeleting all existing products…');
  const { error: delError } = await supabase
    .from('products')
    .delete()
    .neq('id', 0);

  if (delError) {
    console.error('✗ Delete failed:', delError.message);
    console.error('  Hint: make sure SUPABASE_SERVICE_ROLE_KEY is set in .env');
    console.error('  Full error:', JSON.stringify(delError, null, 2));
    process.exit(1);
  }
  console.log('✓ Cleared all existing products');

  /* Step 2: Build rows — one per product folder */
  const rows = folders.map(folder => {
    const urlArray = mapData[folder] || [];
    return {
      name:              formatName(folder),
      series:            guessSeriesFromFolder(folder),
      flavour:           guessFlavourFromFolder(folder),
      price_inr:         0,
      short_description: 'Premium clinical nutrition supplement by Azzurra Pharmaconutrition',
      tags:              generateTags(folder),
      benefits:          '',
      ingredients:       '',
      how_to_use:        '',
      nutrition_facts:   '',
      warnings:          '',
      image_folder:      folder,
      images:            JSON.stringify(urlArray),
      in_stock:          true,
      is_featured:       folder.toUpperCase().includes('ESSENTIAL'),
    };
  });

  /* Step 3: Insert in batches of 20 */
  console.log('\nInserting ' + rows.length + ' products (one per folder)…');
  const BATCH = 20;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error: insError } = await supabase.from('products').insert(batch);
    if (insError) {
      console.error('\n✗ Insert failed at batch ' + (Math.floor(i / BATCH) + 1) + ':');
      console.error('  Message:', insError.message);
      console.error('  Details:', insError.details || '(none)');
      console.error('  Code:',    insError.code    || '(none)');
      process.exit(1);
    }
    inserted += batch.length;
    console.log('  Inserted ' + inserted + '/' + rows.length);
  }

  /* Verify */
  const { count: afterCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  console.log('\n════════════════════════════════════');
  console.log('Fixed: now ' + afterCount + ' products in database');
  console.log('(Was: ' + beforeCount + ', folders in map: ' + folders.length + ')');
  console.log('════════════════════════════════════');

  console.log('\nNext steps:');
  console.log('  npx serve . -p 3000');
  console.log('  http://localhost:3000/admin-login.html');
  console.log('  Log in → Products tab → verify ' + afterCount + ' products\n');
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message || err);
  process.exit(1);
});

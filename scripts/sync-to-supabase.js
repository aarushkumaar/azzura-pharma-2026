#!/usr/bin/env node
/* ============================================================
   AZZURRA — SYNC PRODUCTS TO SUPABASE
   scripts/sync-to-supabase.js

   Usage:
     node scripts/sync-to-supabase.js
     npm run sync-products

   Reads cloudinary-products-map.json from the project root and
   inserts all products into the Supabase products table.

   Run AFTER: npm run upload-images
   ============================================================ */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

/* ── Config ──────────────────────────────────────────────────── */
const SUPABASE_URL = process.env.SUPABASE_URL;

// Use the service role key for server-side scripts so RLS doesn't block
// DELETE or INSERT. The service role key is in .env and NEVER goes in HTML.
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const MAP_PATH = path.join(__dirname, '..', 'cloudinary-products-map.json');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('✗ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env');
  process.exit(1);
}

if (!fs.existsSync(MAP_PATH)) {
  console.error('✗ cloudinary-products-map.json not found at: ' + MAP_PATH);
  console.error('  Run: npm run upload-images first');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);


/* ── Helpers ──────────────────────────────────────────────────── */

function formatName(str) {
  return str
    .replace(/[_\-\.]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function guessSeriesFromName(folder) {
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

function guessFlavourFromName(folder) {
  const f = folder.toUpperCase();
  if (f.includes('VANILLA'))                                    return 'Vanilla';
  if (f.includes('CHOCOLATE') || f.includes('CHOCO') || f.includes('BLCD')) return 'Chocolate';
  if (f.includes('MANGO'))                                      return 'Mango';
  if (f.includes('ROSE'))                                       return 'Rose';
  if (f.includes('GUAVA'))                                      return 'Guava';
  if (f.includes('ORANGE'))                                     return 'Orange';
  if (f.includes('BLUE') && !f.includes('DARK_BLUE'))          return 'Unflavoured';
  return '';
}

function generateTags(folder) {
  const tags = [];
  const f    = folder.toUpperCase();
  if (f.includes('PEPTIDE'))               tags.push('Peptide');
  if (f.includes('PROTEIN'))               tags.push('Protein');
  if (f.includes('GUMMIES'))               tags.push('Gummies');
  if (f.includes('1KG') || f.includes('1_KG')) tags.push('1kg');
  if (f.includes('1.75'))                  tags.push('1.75kg');
  if (f.includes('2.25'))                  tags.push('2.25kg');
  if (f.includes('350'))                   tags.push('350g');
  if (f.includes('VANILLA'))               tags.push('Vanilla');
  if (f.includes('CHOCOLATE') || f.includes('BLCD')) tags.push('Chocolate');
  if (f.includes('MANGO'))                 tags.push('Mango');
  if (f.includes('CAPSULE') || f.includes('CAP'))    tags.push('Capsules');
  if (f.includes('FIBER') || f.includes('FIBERO'))   tags.push('Fiber');
  if (f.includes('DLS') || f.includes('DM'))         tags.push('Diabetes');
  if (f.includes('HEPATIC'))               tags.push('Liver');
  if (f.includes('RENAL') || f.includes('EPA'))      tags.push('Renal');
  return tags.join(',');
}

/* ── Main ─────────────────────────────────────────────────────── */
async function main() {
  console.log('\n════════════════════════════════════');
  console.log('  AZZURRA — Sync Products to Supabase');
  console.log('════════════════════════════════════\n');

  /* Read map */
  const mapData = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const productFolders = Object.keys(mapData);
  console.log('Found ' + productFolders.length + ' products in cloudinary-products-map.json');

  /* Delete all existing products */
  console.log('\nClearing existing products…');
  const { error: delError } = await supabase
    .from('products')
    .delete()
    .neq('id', 0);

  if (delError) {
    console.error('✗ Failed to clear products:', delError.message);
    console.error('  Full error:', JSON.stringify(delError, null, 2));
    process.exit(1);
  }
  console.log('Cleared existing products');

  /* Build rows */
  const rows = productFolders.map(folder => {
    const urlArray = mapData[folder] || [];
    return {
      name:              formatName(folder),
      series:            guessSeriesFromName(folder),
      flavour:           guessFlavourFromName(folder),
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

  console.log('Inserting ' + rows.length + ' products…');

  /* Insert in batches of 20 to avoid request size limits */
  const BATCH = 20;
  let   totalInserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { data, error } = await supabase.from('products').insert(batch);

    if (error) {
      console.error('\n✗ Insert failed at batch ' + (Math.floor(i / BATCH) + 1) + ':');
      console.error('  Message:', error.message);
      console.error('  Details:', error.details || '(none)');
      console.error('  Hint:',    error.hint    || '(none)');
      console.error('  Code:',    error.code    || '(none)');
      console.error('\nFull error:', JSON.stringify(error, null, 2));
      process.exit(1);
    }

    totalInserted += batch.length;
    console.log('  Inserted batch ' + (Math.floor(i / BATCH) + 1) + ' (' + totalInserted + '/' + rows.length + ')');
  }

  console.log('✓ Synced ' + totalInserted + ' products to Supabase');

  /* Verify */
  const { count, error: countError } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.warn('⚠ Could not verify count:', countError.message);
  } else {
    console.log('Verification: ' + count + ' products now in database');
  }

  console.log('\n════════════════════════════════════');
  console.log('Sync complete!');
  console.log('\nNext steps:');
  console.log('  npx serve . -p 3000');
  console.log('  Open: http://localhost:3000/productss.html');
  console.log('  Open: http://localhost:3000/admin-login.html');
  console.log('════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message || err);
  process.exit(1);
});

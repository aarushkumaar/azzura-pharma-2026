#!/usr/bin/env node
/**
 * scripts/seed-products.js
 *
 * Seeds the Supabase `products` table from cloudinary-products-map.json.
 * Reads every series/product in the map and inserts them via upsert
 * (conflicts on `name` are ignored, so running twice is safe).
 *
 * Usage:
 *   npm run seed-products
 *   # or directly:
 *   node scripts/seed-products.js
 *
 * Requires .env with:
 *   SUPABASE_URL=https://...
 *   SUPABASE_ANON_KEY=eyJ...
 */

'use strict';

const path    = require('path');
const fs      = require('fs');

// Load .env from project root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a raw folder key like "ESSENTIAL_BLCD_CHOCOLATE_350" or
 * "GLUTAMAX_EL" into a readable title like "Essential Blcd Chocolate 350"
 */
function toTitle(key) {
  return key
    .replace(/[_\-]+/g, ' ')        // underscores/hyphens → spaces
    .toLowerCase()
    .replace(/\b\w/g, function(c) { return c.toUpperCase(); }); // Title Case
}

/**
 * Convert a series key like "ESENTIAL_SERIES" to a clean series name
 * like "Essential" (strips the trailing _SERIES if present).
 */
function toSeriesName(seriesKey) {
  return toTitle(seriesKey.replace(/_SERIES$/i, '').replace(/^ESENTIAL/, 'ESSENTIAL'));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Read the map file
  const mapPath = path.join(__dirname, '..', 'cloudinary-products-map.json');
  if (!fs.existsSync(mapPath)) {
    console.error('ERROR: cloudinary-products-map.json not found at', mapPath);
    process.exit(1);
  }

  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

  const products = [];

  // Iterate: series → products
  for (const seriesKey of Object.keys(map)) {
    const seriesProducts = map[seriesKey];
    const seriesName     = toSeriesName(seriesKey);
    let   isFirstInSeries = true;

    for (const productKey of Object.keys(seriesProducts)) {
      const urls = seriesProducts[productKey]; // array of Cloudinary URLs

      const product = {
        name:              toTitle(productKey),
        series:            seriesName,
        flavour:           '',
        price_inr:         0,
        short_description: 'Clinical nutrition \u2014 ' + seriesName + ' Series',
        tags:              '',
        benefits:          '',
        ingredients:       '',
        how_to_use:        '',
        nutrition_facts:   '',
        warnings:          '',
        image_folder:      seriesKey + '/' + productKey,
        images:            JSON.stringify(urls),
        in_stock:          true,
        is_featured:       isFirstInSeries, // first product per series is featured
      };

      products.push(product);
      isFirstInSeries = false;
    }
  }

  console.log('Found ' + products.length + ' products in cloudinary-products-map.json');
  console.log('Inserting into Supabase (upsert on name \u2014 duplicates skipped)...\n');

  let inserted = 0;
  let skipped  = 0;

  // Insert in batches of 20 to avoid request size limits
  const BATCH = 20;
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);

    const { data, error } = await sb
      .from('products')
      .upsert(batch, {
        onConflict:        'name',   // skip if name already exists
        ignoreDuplicates:  true,
      })
      .select('id, name');

    if (error) {
      console.error('ERROR inserting batch:', error.message);
      console.error('Batch was:', batch.map(function(p) { return p.name; }).join(', '));
      continue;
    }

    const batchInserted = data ? data.length : 0;
    const batchSkipped  = batch.length - batchInserted;
    inserted += batchInserted;
    skipped  += batchSkipped;

    (data || []).forEach(function(p) {
      console.log('  Inserted: ' + p.name + ' (id=' + p.id + ')');
    });

    if (batchSkipped > 0) {
      console.log('  Skipped (already exist): ' + batchSkipped + ' product(s)');
    }
  }

  console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  console.log('Seed complete!');
  console.log('  Inserted: ' + inserted);
  console.log('  Skipped (duplicates): ' + skipped);
  console.log('  Total in map: ' + products.length);
  console.log('\nNext step: open admin.html \u2192 Products section to set prices and details.');
}

main().catch(function(err) {
  console.error('Fatal error:', err);
  process.exit(1);
});

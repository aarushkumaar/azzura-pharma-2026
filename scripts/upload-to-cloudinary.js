#!/usr/bin/env node
/* ============================================================
   AZZURRA — CLOUDINARY BATCH UPLOAD SCRIPT
   scripts/upload-to-cloudinary.js

   Usage:
     node scripts/upload-to-cloudinary.js
     npm run upload-images

   Source folder (flat — no series sub-folders):
     C:\Users\aarus\AARUSH\PHOTOS\azzura\
       ABC_PROTEIN_10x32G\
         FRONT.png
         Text.png
         ...
       ESSENTIAL_BLCD_CHOCOLATE_350\
         ...

   For each product folder:
     1. Builds publicId BEFORE any upload (fixes the previous "undefined" bug)
     2. Converts image to WebP in memory via Sharp
     3. Uploads to Cloudinary under:
        azzura_products/<PRODUCT_FOLDER>/<basename>

   Outputs (project root):
     cloudinary-products-map.json   — { productFolder: [url, …] }
     cloudinary-upload-manifest.json — flat array of all uploads
     assets/js/products-data.js     — PRODUCTS array for the shop page
   ============================================================ */

'use strict';

/* STEP 0 — load env FIRST, before anything else */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs         = require('fs');
const path       = require('path');
const sharp      = require('sharp');
const cloudinary = require('cloudinary').v2;

/* ── Constants ──────────────────────────────────────────────── */
const CLOUD_NAME  = 'dfiskvjbl';
const SOURCE_DIR  = 'C:\\Users\\aarus\\AARUSH\\PHOTOS\\azzura';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const IMAGE_EXTS   = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const BATCH_SIZE   = 5;

/* ── Step 0 — Verify Cloudinary connection ──────────────────── */
async function verifyConnection() {
  try {
    await cloudinary.api.ping();
    console.log('✓ Cloudinary connected: ' + CLOUD_NAME);
  } catch (err) {
    console.error('✗ Cloudinary connection failed:', err.message || err);
    console.error('  Check CLOUDINARY_URL in .env');
    process.exit(1);
  }
}

/* ── Step 1 — Scan local folder ─────────────────────────────── */
function scanFolder(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    console.error('✗ Source folder not found: ' + sourceDir);
    console.error('  Update SOURCE_DIR at the top of this script if the path changed.');
    process.exit(1);
  }

  const allImages = [];
  const entries   = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const productFolder = entry.name;
    const productPath   = path.join(sourceDir, productFolder);
    const files         = fs.readdirSync(productPath, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile()) continue;
      if (file.name.startsWith('.') || file.name.startsWith('_')) continue;

      const ext = path.extname(file.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;

      const parsed = path.parse(file.name);
      allImages.push({
        absolutePath:  path.join(productPath, file.name),
        productFolder: productFolder,
        baseName:      parsed.name,
        ext:           ext,
      });
    }
  }

  return allImages;
}

/* ── Step 2 — Build publicId BEFORE any upload ───────────────── */

/**
 * Build a safe Cloudinary public_id from productFolder + baseName.
 * This function is defined before uploadOne so publicId is never undefined.
 */
function buildPublicId(productFolder, baseName) {
  const cleanFolder = productFolder
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '');

  const cleanBase = baseName
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '');

  return 'azzura_products/' + cleanFolder + '/' + cleanBase;
}

/* ── Step 3 — Upload logic ───────────────────────────────────── */

async function uploadOne(img) {
  /* Convert to WebP in memory.
     .rotate()  — reads EXIF orientation and physically rotates the image so
                  the output is always the "correct" orientation, then strips
                  the EXIF tag.  Without this, browsers that ignore EXIF show
                  rotated images.
     .flatten() — composites transparency onto white so PNG/WebP files with
                  transparent backgrounds don't render as black in some contexts.
  */
  let buffer;
  try {
    buffer = await sharp(img.absolutePath)
      .rotate()                          // normalize EXIF orientation
      .flatten({ background: '#FFFFFF' }) // fill transparent areas with white
      .webp({ quality: 85 })
      .toBuffer();
  } catch (sharpErr) {
    console.warn('  Sharp failed, using original: ' + img.baseName);
    buffer = fs.readFileSync(img.absolutePath);
  }

  /* Upload via upload_stream wrapped in a Promise */
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      public_id:    img.publicId,   /* built in Step 2 — never undefined here */
      resource_type: 'image',
      format:        'webp',
      overwrite:     true,
      invalidate:    true,
      upload_preset: 'azzura',
    };

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(new Error(img.publicId + ' — ' + (error.message || JSON.stringify(error))));
        } else {
          resolve({
            productFolder: img.productFolder,
            baseName:      img.baseName,
            publicId:      result.public_id,
            secureUrl:     result.secure_url,
          });
        }
      }
    );

    stream.end(buffer);
  });
}

async function uploadBatch(batch) {
  return Promise.allSettled(batch.map(img => uploadOne(img)));
}

/* ── Cloudinary URL builder ──────────────────────────────────── */
/**
 * Always build the URL manually so f_auto,q_auto is included.
 * DO NOT use result.secureUrl directly.
 */
function buildUrl(publicId) {
  return 'https://res.cloudinary.com/' + CLOUD_NAME +
    '/image/upload/f_auto,q_auto/' + publicId;
}

/* ── Step 4 — Output file generators ────────────────────────── */

function writeMapJson(productsMap) {
  const p = path.join(PROJECT_ROOT, 'cloudinary-products-map.json');
  fs.writeFileSync(p, JSON.stringify(productsMap, null, 2), 'utf8');
  console.log('  cloudinary-products-map.json');
  return p;
}

function writeManifest(manifest) {
  const p = path.join(PROJECT_ROOT, 'cloudinary-upload-manifest.json');
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('  cloudinary-upload-manifest.json');
  return p;
}

function slugify(str) {
  return str.toLowerCase()
    .replace(/[_\-\.]+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/\-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim() || 'product';
}

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

function writeProductsDataJs(productsMap) {
  const productKeys = Object.keys(productsMap);
  const products = productKeys.map(folder => {
    const urls = productsMap[folder];
    const id   = slugify(folder);
    return {
      id,
      name:             formatName(folder),
      series:           guessSeriesFromFolder(folder),
      seriesKey:        folder,
      images:           urls,
      imagePath:        urls[0] || '',
      price_inr:        0,
      shortDescription: 'Clinical nutrition supplement by Azzurra Pharmaconutrition',
      tags:             [],
      category:         guessSeriesFromFolder(folder),
      inStock:          true,
      isFeatured:       folder.toUpperCase().includes('ESSENTIAL'),
      detailPage:       'product-detail.html?id=' + id,
    };
  });

  const js = `// AUTO-GENERATED by scripts/upload-to-cloudinary.js
// Total products: ${products.length}
// Do not edit manually — re-run the upload script to regenerate.

var PRODUCTS = ${JSON.stringify(products, null, 2)};
`;

  const p = path.join(PROJECT_ROOT, 'assets', 'js', 'products-data.js');
  fs.writeFileSync(p, js, 'utf8');
  console.log('  assets/js/products-data.js');
  return p;
}

/* ── MAIN ────────────────────────────────────────────────────── */
async function main() {
  console.log('\n════════════════════════════════════');
  console.log('  AZZURRA — Cloudinary Batch Upload');
  console.log('  Cloud: ' + CLOUD_NAME);
  console.log('  Source: ' + SOURCE_DIR);
  console.log('════════════════════════════════════\n');

  /* Verify .env has CLOUDINARY_URL */
  if (!process.env.CLOUDINARY_URL) {
    console.error('✗ CLOUDINARY_URL is not set in .env');
    console.error('  Add: CLOUDINARY_URL=cloudinary://529226522871852:RlEUJJ4HRHOEB6USMMjS0_xf4M8@dfiskvjbl');
    process.exit(1);
  }

  /* STEP 0 — Verify Cloudinary */
  await verifyConnection();

  /* STEP 1 — Scan */
  console.log('\n[1/4] Scanning: ' + SOURCE_DIR);
  const allImages = scanFolder(SOURCE_DIR);

  /* Group by folder to show counts */
  const folderCounts = {};
  allImages.forEach(img => {
    folderCounts[img.productFolder] = (folderCounts[img.productFolder] || 0) + 1;
  });
  const folderNames = Object.keys(folderCounts);
  console.log('Found ' + allImages.length + ' images across ' + folderNames.length + ' product folders:\n');
  folderNames.forEach(f => console.log('  ' + f + ' (' + folderCounts[f] + ' image' + (folderCounts[f] !== 1 ? 's' : '') + ')'));

  /* STEP 2 — Build ALL publicIds BEFORE any upload starts */
  console.log('\n[2/4] Building public IDs…');
  allImages.forEach(img => {
    img.publicId = buildPublicId(img.productFolder, img.baseName);
  });

  /* Verify no publicId is undefined */
  const bad = allImages.filter(img => !img.publicId);
  if (bad.length) {
    console.warn('  ⚠ ' + bad.length + ' image(s) have an undefined publicId — removing them:');
    bad.forEach(img => console.warn('    ' + img.absolutePath));
  }
  const toUpload = allImages.filter(img => !!img.publicId);
  console.log('Sample public_id: ' + (toUpload[0] ? toUpload[0].publicId : '(none)'));

  /* STEP 3 — Upload in batches */
  console.log('\n[3/4] Uploading in batches of ' + BATCH_SIZE + '…\n');
  const succeeded = [];
  const failed    = [];
  let   done      = 0;
  const total     = toUpload.length;

  for (let i = 0; i < toUpload.length; i += BATCH_SIZE) {
    const batch   = toUpload.slice(i, i + BATCH_SIZE);
    const results = await uploadBatch(batch);

    results.forEach((r, idx) => {
      done++;
      const img = batch[idx];
      if (r.status === 'fulfilled') {
        console.log('✓ [' + done + '/' + total + '] ' + img.publicId);
        succeeded.push(r.value);
      } else {
        console.log('✗ [' + done + '/' + total + '] FAILED: ' + r.reason.message);
        failed.push({ img, reason: r.reason.message });
      }
    });
  }

  /* STEP 4 — Generate output files */
  console.log('\n[4/4] Writing output files…');

  /* Build products map: { productFolder: [url, ...] } */
  const productsMap = {};
  succeeded.forEach(result => {
    const url = buildUrl(result.publicId);
    if (!productsMap[result.productFolder]) productsMap[result.productFolder] = [];
    productsMap[result.productFolder].push(url);
  });

  /* Flat manifest */
  const manifest = succeeded.map(result => ({
    productFolder: result.productFolder,
    baseName:      result.baseName,
    publicId:      result.publicId,
    url:           buildUrl(result.publicId),
  }));

  writeMapJson(productsMap);
  writeManifest(manifest);
  writeProductsDataJs(productsMap);

  /* STEP 5 — Summary */
  console.log('\n════════════════════════════════════');
  console.log('Upload Complete');
  console.log('✓ Succeeded: ' + succeeded.length + ' / ' + total);
  console.log('✗ Failed:    ' + failed.length    + ' / ' + total);
  console.log('');
  console.log('Output files written:');
  console.log('  cloudinary-products-map.json');
  console.log('  cloudinary-upload-manifest.json');
  console.log('  assets/js/products-data.js');
  console.log('════════════════════════════════════');

  if (failed.length > 0) {
    console.log('\nFailed uploads — check these folders manually:');
    failed.forEach(f => console.log('  ' + f.img.absolutePath + '\n    Reason: ' + f.reason));
  }

  console.log('\nNext steps:');
  console.log('  npm run sync-products   — sync products to Supabase');
  console.log('  npx serve . -p 3000    — start local server');

  if (failed.length > 0) process.exit(1);
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message || err);
  process.exit(1);
});

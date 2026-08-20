'use strict';
// ── MUST be first — load env before anything else ────────────────────────────
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

/**
 * scripts/upload-new-images.js
 *
 * Bulletproof Cloudinary uploader for Azzurra product images.
 *
 * Usage:  node scripts/upload-new-images.js
 *
 * What it does:
 *   1. Pings Cloudinary to verify credentials
 *   2. Scans assets/images/ (series → product → files)
 *   3. Converts each image to WebP with Sharp (falls back to original on error)
 *   4. Uploads to Cloudinary as:
 *        azzurra/products/<SERIES>/<PRODUCT>/<basename>
 *      — public_id is always built as a string and logged BEFORE every upload
 *   5. Writes cloudinary-upload-manifest.json
 *   6. Writes cloudinary-products-map.json (used by admin Import button)
 *   7. Writes assets/js/products-data.js
 */

const cloudinary = require('cloudinary').v2;
const sharp      = require('sharp');
const fs         = require('fs');
const path       = require('path');

// ── 1. CLOUDINARY CONFIG ──────────────────────────────────────────────────────
// Use CLOUDINARY_URL from .env (format: cloudinary://KEY:SECRET@CLOUD_NAME)
// If not set, fall back to individual env vars
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });
} else {
  cloudinary.config({
    cloud_name: 'dfiskvjbl',
    api_key:    '529226522871852',
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const cfg = cloudinary.config();
console.log('');
console.log('════════════════════════════════════════════════════════════');
console.log(' Azzurra Cloudinary Uploader');
console.log('════════════════════════════════════════════════════════════');
console.log('  Cloud name :', cfg.cloud_name  || '⚠️  NOT SET');
console.log('  API key    :', cfg.api_key      || '⚠️  NOT SET');
console.log('  API secret :', cfg.api_secret
  ? cfg.api_secret.slice(0, 4) + '****' + cfg.api_secret.slice(-2)
  : '⚠️  NOT SET');
console.log('════════════════════════════════════════════════════════════');

// ── 2. VERIFY CLOUDINARY CONNECTION ──────────────────────────────────────────
async function verifyCloudinary() {
  try {
    const pong = await cloudinary.api.ping();
    console.log('✓ Cloudinary ping OK:', pong.status);
  } catch (err) {
    console.error('✗ Cloudinary ping FAILED:', err.message);
    console.error('  Check cloud_name / api_key / api_secret in .env');
    process.exit(1);
  }
}

// ── 3. PATHS ──────────────────────────────────────────────────────────────────
const ROOT         = path.join(__dirname, '..');
const IMAGES_DIR   = path.join(ROOT, 'assets', 'images');
const MANIFEST_PATH   = path.join(ROOT, 'cloudinary-upload-manifest.json');
const MAP_PATH        = path.join(ROOT, 'cloudinary-products-map.json');
const PRODUCTS_JS_PATH = path.join(ROOT, 'assets', 'js', 'products-data.js');

const CLOUD_NAME = cfg.cloud_name || 'dfiskvjbl';

const IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp',
  '.JPG', '.JPEG', '.PNG', '.WEBP',
]);

// ── 4. SCAN LOCAL IMAGES ─────────────────────────────────────────────────────
function scanImages(imagesDir) {
  if (!fs.existsSync(imagesDir)) {
    console.error('✗ Images directory not found:', imagesDir);
    process.exit(1);
  }

  /** @type {Array<{absolutePath,relativePath,seriesFolder,productFolder,baseName,ext}>} */
  const images = [];

  const seriesDirs = fs.readdirSync(imagesDir)
    .filter(name => !name.startsWith('.'))
    .filter(name => fs.statSync(path.join(imagesDir, name)).isDirectory())
    .sort();

  for (const seriesFolder of seriesDirs) {
    const seriesPath = path.join(imagesDir, seriesFolder);

    const productDirs = fs.readdirSync(seriesPath)
      .filter(name => !name.startsWith('.'))
      .filter(name => fs.statSync(path.join(seriesPath, name)).isDirectory())
      .sort();

    for (const productFolder of productDirs) {
      const productPath = path.join(seriesPath, productFolder);

      const files = fs.readdirSync(productPath)
        .filter(name => !name.startsWith('.'))
        .filter(name => IMAGE_EXTS.has(path.extname(name)))
        .sort();

      for (const filename of files) {
        const parsed = path.parse(filename);
        const baseName = parsed.name;   // filename WITHOUT extension
        const ext      = parsed.ext;    // extension WITH dot

        images.push({
          absolutePath: path.join(productPath, filename),
          relativePath: path.join(seriesFolder, productFolder, filename),
          seriesFolder,
          productFolder,
          baseName,
          ext,
        });
      }
    }
  }

  return images;
}

function logScanSummary(images) {
  // Group by series/product for summary
  const folders = {};
  for (const img of images) {
    const key = `${img.seriesFolder}/${img.productFolder}`;
    if (!folders[key]) folders[key] = 0;
    folders[key]++;
  }
  const folderCount = Object.keys(folders).length;
  console.log('');
  console.log(`Scan complete: found ${images.length} images across ${folderCount} product folders`);
  for (const [folder, count] of Object.entries(folders)) {
    console.log(`  ${folder}  (${count} image${count !== 1 ? 's' : ''})`);
  }
  console.log('');
}

// ── 5. BUILD PUBLIC_ID ───────────────────────────────────────────────────────
// Cloudinary public_id rules:
//   - Forward slashes create virtual folders
//   - No leading slash, no trailing slash
//   - Spaces are valid but replaced with hyphens to be safe
//   - Do NOT use both `folder` option AND a path-based public_id — use only public_id
function buildPublicId(image) {
  // Sanitise each segment: trim whitespace, replace spaces/special chars with -
  function sanitise(str) {
    return String(str || '')
      .trim()
      .replace(/\s+/g, '-')        // spaces → hyphens
      .replace(/[^\w\-]/g, '-')    // non-word chars → hyphens
      .replace(/-{2,}/g, '-')      // collapse multiple hyphens
      .replace(/^-|-$/g, '');      // trim leading/trailing hyphens
  }

  const series  = sanitise(image.seriesFolder);
  const product = sanitise(image.productFolder);
  const base    = sanitise(image.baseName);

  if (!series || !product || !base) {
    throw new Error(
      `Could not build public_id — one segment is empty.\n` +
      `  seriesFolder: "${image.seriesFolder}" → "${series}"\n` +
      `  productFolder: "${image.productFolder}" → "${product}"\n` +
      `  baseName: "${image.baseName}" → "${base}"`
    );
  }

  // Final public_id format: azzurra/products/SERIES/PRODUCT/BASENAME
  return `azzurra/products/${series}/${product}/${base}`;
}

// ── 6. CONVERT + UPLOAD ONE IMAGE ────────────────────────────────────────────
async function uploadImage(image) {
  // Step A: Build public_id FIRST — log before any I/O
  const publicId = buildPublicId(image);
  console.log(`  publicId: ${publicId}`);

  // Step B: Convert to WebP with Sharp (fall back to original buffer on error)
  let buffer;
  try {
    buffer = await sharp(image.absolutePath)
      .webp({ quality: 85 })
      .toBuffer();
  } catch (sharpErr) {
    console.warn(`  ⚠️  Sharp failed (${sharpErr.message}), using original file`);
    buffer = fs.readFileSync(image.absolutePath);
  }

  // Step C: Upload to Cloudinary via upload_stream
  // upload_stream signature (Cloudinary v2): (options, callback) → stream
  // The public_id includes the full path — do NOT also set `folder`
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id:     publicId,   // ← always a string, logged above
        resource_type: 'image',
        format:        'webp',
        overwrite:     true,
        quality:       'auto:good',
        // NO `folder` key — would conflict with path-based public_id
      },
      (error, result) => {
        if (error) reject(error);
        else       resolve(result);
      }
    );
    stream.end(buffer);
  });

  return result;
}

// ── 7. BATCH PROCESSOR (5 concurrent) ────────────────────────────────────────
async function processBatch(items, batchSize, processFn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch       = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(processFn));
    results.push(...batchResults);
    const done = Math.min(i + batchSize, items.length);
    console.log(`  Progress: ${done}/${items.length}`);
  }
  return results;
}

// ── 8. GENERATE OUTPUT FILES ──────────────────────────────────────────────────

// cloudinary-upload-manifest.json — flat array of every uploaded image
function writeManifest(uploadedImages) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(uploadedImages, null, 2), 'utf8');
  console.log(`  Written: ${MANIFEST_PATH}`);
}

// cloudinary-products-map.json — nested: { SERIES: { PRODUCT: [url, ...] } }
// URL format: https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto/<publicId>
function writeProductsMap(uploadedImages) {
  const map = {};
  for (const img of uploadedImages) {
    const url = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${img.publicId}`;
    if (!map[img.series])           map[img.series] = {};
    if (!map[img.series][img.product]) map[img.series][img.product] = [];
    map[img.series][img.product].push(url);
  }
  fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2), 'utf8');
  console.log(`  Written: ${MAP_PATH}`);
  return map;
}

// Helpers for products-data.js
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[\s_\.]+/g, '-')
    .replace(/[^\w\-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '') || 'product';
}

function formatName(str) {
  return String(str || '')
    .replace(/[_\-\.]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// assets/js/products-data.js — PRODUCTS array for static fallback
function writeProductsDataJs(map) {
  const products = [];
  for (const [seriesKey, productsObj] of Object.entries(map)) {
    for (const [productKey, urls] of Object.entries(productsObj)) {
      products.push({
        id:               slugify(productKey),
        name:             formatName(productKey),
        series:           formatName(seriesKey),
        seriesKey,
        productKey,
        images:           urls,
        imagePath:        urls[0] || '',
        image_url:        urls[0] || '',
        price_inr:        0,
        price:            0,
        shortDescription: `Clinical nutrition — ${formatName(seriesKey)}`,
        short_description:`Clinical nutrition — ${formatName(seriesKey)}`,
        tags:             [],
        need_tags:        [],
        category:         slugify(seriesKey),
        inStock:          true,
        in_stock:         true,
        isFeatured:       false,
        is_featured:      false,
        detailPage:       `product-detail.html?id=${slugify(productKey)}`,
        rating:           0,
        review_count:     0,
        stock_quantity:   99,
        compare_price:    null,
        is_new_release:   false,
      });
    }
  }

  const js =
    `// AUTO-GENERATED by scripts/upload-new-images.js — do NOT edit manually.\n` +
    `// Re-run: npm run upload-new-images\n\n` +
    `var PRODUCTS = ${JSON.stringify(products, null, 2)};\n\n` +
    `if (typeof module !== 'undefined') module.exports = { PRODUCTS };\n`;

  fs.writeFileSync(PRODUCTS_JS_PATH, js, 'utf8');
  console.log(`  Written: ${PRODUCTS_JS_PATH}`);
}

// ── 9. MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  // Verify Cloudinary creds before doing any file work
  await verifyCloudinary();

  // Scan
  console.log(`\nScanning: ${IMAGES_DIR}`);
  const images = scanImages(IMAGES_DIR);
  if (images.length === 0) {
    console.error('✗ No images found. Check the directory path and extensions.');
    process.exit(1);
  }
  logScanSummary(images);

  // Upload
  console.log(`\nUploading ${images.length} images (batch size: 5)…\n`);

  const uploadedImages = [];
  const failures       = [];

  let index = 0;
  const allSettled = await processBatch(images, 5, async (image) => {
    index++;
    const label = `[${index}/${images.length}] ${image.seriesFolder}/${image.productFolder}/${image.baseName}`;
    console.log(`\n→ ${label}`);
    try {
      const result = await uploadImage(image);
      const entry = {
        series:       image.seriesFolder,
        product:      image.productFolder,
        baseName:     image.baseName,
        publicId:     result.public_id,
        cloudinaryUrl:result.secure_url,
        webpUrl:      `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${result.public_id}`,
      };
      uploadedImages.push(entry);
      console.log(`  ✓ ${label}`);
      return entry;
    } catch (err) {
      const msg = `✗ FAILED: ${image.absolutePath}\n  Error: ${err.message}`;
      console.error(`  ${msg}`);
      failures.push({ file: image.absolutePath, error: err.message });
      throw err;
    }
  });

  // Write outputs
  console.log('\n\nWriting output files…');
  writeManifest(uploadedImages);
  const map = writeProductsMap(uploadedImages);
  writeProductsDataJs(map);

  // Summary
  const succeeded = uploadedImages.length;
  const failed    = failures.length;
  const total     = images.length;

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log(' Upload Complete');
  console.log(`  ✓ Succeeded : ${succeeded}`);
  console.log(`  ✗ Failed    : ${failed}`);
  console.log(`  Total       : ${total}`);
  console.log('');
  console.log('  Files written:');
  console.log('    cloudinary-upload-manifest.json');
  console.log('    cloudinary-products-map.json');
  console.log('    assets/js/products-data.js');

  if (failed > 0) {
    console.log('');
    console.log(`  Failed files (retry manually):`);
    for (const f of failures) {
      console.log(`    ✗ ${f.file}`);
      console.log(`      → ${f.error}`);
    }
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Next step:  npm run sync-products');
  console.log('');
}

main().catch(err => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});

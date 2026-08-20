/**
 * Azzurra — Upload site section images to Cloudinary
 * via remote URL fetch (no API secret needed for fetch-mode, just needs cloud name + preset)
 *
 * Run: node scripts/upload-site-images-fetch.js
 * Requires: CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET env vars
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const FormData = require('form-data');

const CLOUD_NAME   = 'dfiskvjbl';
const API_KEY      = process.env.CLOUDINARY_API_KEY;
const API_SECRET   = process.env.CLOUDINARY_API_SECRET;

if (!API_KEY || !API_SECRET) {
  console.error('ERROR: Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET env vars first.');
  process.exit(1);
}

const SITE_DIR = path.join(__dirname, '..', 'assets', 'images', 'site');

// Map local filename → Cloudinary public_id
const images = [
  { file: 'vaccine.jpg',           publicId: 'azzurra/site/vaccine'            },
  { file: 'medical-shield.jpg',    publicId: 'azzurra/site/medical-shield'     },
  { file: 'laboratory.jpg',        publicId: 'azzurra/site/laboratory'         },
  { file: 'hospital-corridor.jpg', publicId: 'azzurra/site/hospital-corridor'  },
  { file: 'hero-banner.jpg',       publicId: 'azzurra/site/hero-banner'        },
];

const crypto = require('crypto');

function sign(params, secret) {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(sorted + secret).digest('hex');
}

function uploadFile(filePath, publicId) {
  return new Promise((resolve, reject) => {
    const timestamp  = Math.floor(Date.now() / 1000).toString();
    const params     = { public_id: publicId, timestamp, overwrite: 'true' };
    const signature  = sign(params, API_SECRET);

    const form = new FormData();
    form.append('file',      fs.createReadStream(filePath));
    form.append('public_id', publicId);
    form.append('timestamp', timestamp);
    form.append('api_key',   API_KEY);
    form.append('signature', signature);
    form.append('overwrite', 'true');

    const req = https.request({
      hostname: 'api.cloudinary.com',
      path:     `/v1_1/${CLOUD_NAME}/image/upload`,
      method:   'POST',
      headers:  form.getHeaders(),
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(data)); }
      });
    });

    req.on('error', reject);
    form.pipe(req);
  });
}

async function main() {
  for (const img of images) {
    const filePath = path.join(SITE_DIR, img.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠  Skipping ${img.file} — file not found at ${filePath}`);
      continue;
    }
    try {
      const result = await uploadFile(filePath, img.publicId);
      if (result.secure_url) {
        console.log(`✔ ${img.file} → ${result.secure_url}`);
      } else {
        console.error(`✘ ${img.file}:`, JSON.stringify(result));
      }
    } catch (err) {
      console.error(`✘ ${img.file}:`, err.message);
    }
  }
}

main();

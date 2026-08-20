const express = require('express');
const path = require('path');

const rootDir = __dirname;

// ---- MAIN SITE SERVER (Port 5500) ----
const mainApp = express();
mainApp.use(express.static(rootDir));

const mainPort = 5500;
mainApp.listen(mainPort, () => {
  console.log(`\x1b[36m==================================================\x1b[0m`);
  console.log(`\x1b[32m✔ MAIN SITE is running locally at:\x1b[0m`);
  console.log(`\x1b[36m  👉 http://localhost:${mainPort}\x1b[0m`);
  console.log(`\x1b[36m==================================================\x1b[0m`);
});

// ---- ADMIN SITE SERVER (Port 5501) ----
const adminApp = express();

// Redirect root to /admin/index.html
adminApp.get('/', (req, res) => {
  res.redirect('/admin/index.html');
});

// Serve static files from root so that relative parent directory files (like ../assets/...) are accessible
adminApp.use(express.static(rootDir));

const adminPort = 5501;
adminApp.listen(adminPort, () => {
  console.log(`\x1b[35m==================================================\x1b[0m`);
  console.log(`\x1b[35m✔ ADMIN PORTAL is running separately at:\x1b[0m`);
  console.log(`\x1b[35m  👉 http://localhost:${adminPort}\x1b[0m`);
  console.log(`\x1b[35m==================================================\x1b[0m`);
});

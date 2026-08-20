const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = fs.readdirSync(root).filter(f => f.endsWith('.html'));

files.forEach(f => {
  const filePath = path.join(root, f);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // 1. Nav Logo
  content = content.replace(
    /<div class="logo-text">AZZURRA<\/div>\s*<div class="logo-tagline">NURTURING HUMAN LIVES<\/div>/g,
    '<img src="assets/images/logo.png" alt="Azzurra Logo" style="height:40px; width:auto; display:block;">'
  );

  // 2. Footer Logo
  content = content.replace(
    /<div class="footer__logo-name">AZZURRA<\/div>\s*<div class="footer__logo-tag">Nurturing Human Lives<\/div>/g,
    '<img src="assets/images/logo.png" alt="Azzurra Logo" style="height:50px; width:auto; display:block; margin-bottom:12px;">'
  );

  // 3. Auth Logo
  content = content.replace(
    /<span class="auth-logo-name">AZZURRA<\/span>\s*<span class="auth-logo-tag">My Account<\/span>/g,
    '<img src="assets/images/logo.png" alt="Azzurra Logo" style="height:50px; width:auto; margin:0 auto; display:block;">'
  );

  // 4. Admin Login Logo
  content = content.replace(
    /<span class="logo-text">AZZURRA<\/span>\s*<span class="portal-badge">Admin Portal<\/span>/g,
    '<img src="assets/images/logo.png" alt="Azzurra Logo" style="height:45px; width:auto; display:inline-block; vertical-align:middle; margin-right:10px;">\n        <span class="portal-badge" style="vertical-align:middle;">Admin Portal</span>'
  );

  // 5. Admin Sidebar Logo
  content = content.replace(
    /<span class="sidebar-brand-name">AZZURRA<\/span>\s*<span class="sidebar-brand-tag">Admin Portal<\/span>/g,
    '<img src="assets/images/logo.png" alt="Azzurra Logo" style="height:45px; width:auto; display:block; margin-bottom:8px;">\n        <span class="sidebar-brand-tag">Admin Portal</span>'
  );

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated logo in ${f}`);
  }
});

// Remove Leadership section from about.html
const aboutPath = path.join(root, 'about.html');
if (fs.existsSync(aboutPath)) {
  let aboutContent = fs.readFileSync(aboutPath, 'utf8');
  const leadershipRegex = /<!-- ========================================================\s*LEADERSHIP\s*======================================================== -->[\s\S]*?<\/section>/;
  if (leadershipRegex.test(aboutContent)) {
    aboutContent = aboutContent.replace(leadershipRegex, '');
    fs.writeFileSync(aboutPath, aboutContent);
    console.log(`Removed Leadership section from about.html`);
  }
}

console.log("Replacement complete.");

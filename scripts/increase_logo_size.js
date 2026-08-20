const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = fs.readdirSync(root).filter(f => f.endsWith('.html'));

files.forEach(f => {
  const filePath = path.join(root, f);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Increase Nav Logo height from 40px to 60px
  content = content.replace(
    /<img src="assets\/images\/logo\.png" alt="Azzurra Logo" style="height:40px;/g,
    '<img src="assets/images/logo.png" alt="Azzurra Logo" style="height:60px;'
  );

  // Increase Footer/Auth Logo height from 50px to 75px
  content = content.replace(
    /<img src="assets\/images\/logo\.png" alt="Azzurra Logo" style="height:50px;/g,
    '<img src="assets/images/logo.png" alt="Azzurra Logo" style="height:75px;'
  );

  // Increase Admin Logo height from 45px to 65px
  content = content.replace(
    /<img src="assets\/images\/logo\.png" alt="Azzurra Logo" style="height:45px;/g,
    '<img src="assets/images/logo.png" alt="Azzurra Logo" style="height:65px;'
  );

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Increased logo size in ${f}`);
  }
});
console.log("Done.");

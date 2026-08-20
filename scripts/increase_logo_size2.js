const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = fs.readdirSync(root).filter(f => f.endsWith('.html'));

// Update HTML files
files.forEach(f => {
  const filePath = path.join(root, f);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Nav Logo: 60px -> 90px
  content = content.replace(
    /style="height:60px;/g,
    'style="height:90px;'
  );

  // Footer/Auth Logo: 75px -> 110px
  content = content.replace(
    /style="height:75px;/g,
    'style="height:110px;'
  );

  // Admin Logo: 65px -> 90px
  content = content.replace(
    /style="height:65px;/g,
    'style="height:90px;'
  );

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Increased logo size in ${f}`);
  }
});

// Update CSS file
const cssPath = path.join(root, 'assets', 'css', 'style.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');
let originalCss = cssContent;

// Replace 68px with 100px for padding-top and height
cssContent = cssContent.replace(/padding-top: 68px;/g, 'padding-top: 100px;');
cssContent = cssContent.replace(/height: 68px;/g, 'height: 100px;');

if (cssContent !== originalCss) {
  fs.writeFileSync(cssPath, cssContent);
  console.log(`Updated navbar height in style.css`);
}

console.log("Done.");

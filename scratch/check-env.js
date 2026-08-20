const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  console.log('.env exists!');
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const parts = line.split('=');
    if (parts[0]) {
      console.log(`  - Key: ${parts[0].trim()}`);
    }
  }
} else {
  console.log('.env does not exist.');
}

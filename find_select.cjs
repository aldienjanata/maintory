const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');
let lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<select') && lines[i].includes('status')) {
    console.log(i + ': ' + lines[i]);
  }
}

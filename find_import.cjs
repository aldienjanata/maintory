const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');
let lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('importExcel') || lines[i].includes('ImportExcel') || lines[i].includes('handleImport')) {
    console.log(i + ': ' + lines[i]);
  }
}

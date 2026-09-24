const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

let count = 0;
let lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('handleEditSave')) {
    console.log(`Line ${i+1}: ${lines[i]}`);
    count++;
  }
}
if (count === 0) console.log("Not found.");

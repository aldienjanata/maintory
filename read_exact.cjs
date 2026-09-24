const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');
let lines = content.split('\n');
// Lines are 0-indexed in split, show lines 729-735
for (let i = 729; i <= 735; i++) {
  console.log(i+1 + ': ' + JSON.stringify(lines[i]));
}

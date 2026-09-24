const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');
let lines = content.split('\n');
for (let i = 730; i <= 760; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');
// Find downloadWorkbook call (not import)
let idx = content.indexOf('downloadWorkbook(wb');
let start = Math.max(0, idx - 300);
console.log(JSON.stringify(content.substring(start, idx + 200)));

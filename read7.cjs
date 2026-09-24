const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');
let idx = content.indexOf('downloadWorkbook');
let start = Math.max(0, idx - 200);
console.log(JSON.stringify(content.substring(start, idx + 200)));

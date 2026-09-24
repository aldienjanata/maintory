const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');
let idx = content.indexOf('{/* HISTORY MODAL */}');
console.log(content.substring(idx, idx + 2500));

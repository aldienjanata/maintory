const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

let idx = content.indexOf('Riwayat Scan: <span');
let start = Math.max(0, idx - 400);
console.log(content.substring(start, idx + 2000));

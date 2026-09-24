const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

let idx = content.indexOf('Riwayat Scan sheet');
console.log(content.substring(idx, idx + 1000));

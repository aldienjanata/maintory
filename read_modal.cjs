const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Find the modal rendering logic
let idx = content.indexOf('Berdasarkan Tanggal');
let start = Math.max(0, idx - 400);
console.log(content.substring(start, idx + 800));

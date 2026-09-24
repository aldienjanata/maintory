const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Find exact toolbar string
let idx = content.indexOf('Hapus by tanggal');
let start = Math.max(0, idx - 300);
console.log(JSON.stringify(content.substring(start, idx + 150)));

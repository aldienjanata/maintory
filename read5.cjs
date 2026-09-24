const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Find exact existing block by searching key pattern
let idx = content.indexOf("from('barcode_scans').select('*').eq('barcode', barcode).maybeSingle()");
let start = Math.max(0, idx - 20);
let end = Math.min(content.length, idx + 1500);
console.log(JSON.stringify(content.substring(start, end)));

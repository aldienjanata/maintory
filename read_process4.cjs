const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');
let idx = content.indexOf('const newCount = (existing.scan_count || 1) + 1');
console.log(content.substring(idx - 100, idx + 2000));

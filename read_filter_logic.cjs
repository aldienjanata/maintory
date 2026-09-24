const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Find filter logic
let filterLogicIdx = content.indexOf('const filtered = scans.filter');
console.log(content.substring(filterLogicIdx, filterLogicIdx + 600));

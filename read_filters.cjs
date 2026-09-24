const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Find filter states
let filterIdx = content.indexOf('// Filters');
console.log(content.substring(filterIdx, filterIdx + 400));

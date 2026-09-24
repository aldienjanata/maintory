const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Find filter UI
let filterUIIdx = content.indexOf('{showFilters && (');
console.log(content.substring(filterUIIdx, filterUIIdx + 1500));

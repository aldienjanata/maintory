const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Find selectMode and bulk edit related UI
let idx = content.indexOf('selectMode');
console.log('selectMode idx:', idx);

// Find existing bulk action buttons area
let bulkIdx = content.indexOf('handleDeleteBulk');
let start = Math.max(0, bulkIdx - 200);
console.log(content.substring(start, bulkIdx + 300));

const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Find handleDeleteBulk
let bulkIdx = content.indexOf('const handleDeleteBulk');
console.log(content.substring(bulkIdx, bulkIdx + 400));
console.log('\n\n---\n');
// Find selectMode toggle button
let selIdx = content.indexOf("setSelectMode(");
let selStart = Math.max(0, selIdx - 100);
console.log(content.substring(selStart, selIdx + 300));

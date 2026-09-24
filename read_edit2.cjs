const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

let idx = content.indexOf('handleEditSave');
let start = Math.max(0, idx - 50);
console.log(content.substring(start, idx + 800));

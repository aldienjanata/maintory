const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Find the toolbar area with Pilih, Export buttons to understand structure
let idx = content.indexOf("btn btn-secondary btn-sm\" onClick={() => setSelectMode(!selectMode)}");
let start = Math.max(0, idx - 100);
console.log(content.substring(start, idx + 800));

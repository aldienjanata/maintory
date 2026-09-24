const fs = require('fs');
let file = 'src/pages/scanner/BarcodeScanner.jsx';
let content = fs.readFileSync(file, 'utf8');

// Find the pagination/page state section
let idx = content.indexOf('PAGE_SIZE');
let start = Math.max(0, idx - 500);
console.log(content.substring(start, idx + 1000));

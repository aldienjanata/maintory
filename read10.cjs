const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Find the select for bulkOntKondisi
let idx = content.indexOf('bulkOntKondisi} onChange=');
let start = Math.max(0, idx - 50);
console.log(content.substring(start, idx + 300));

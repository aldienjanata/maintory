const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');
let idx = content.indexOf('Catatan (Opsional)');
let start = Math.max(0, idx - 400);
console.log(content.substring(start, idx + 1000));

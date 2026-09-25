const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');
let idx = content.indexOf('const handleSaveSingle');
let endIdx = content.indexOf('const handleSaveBulk', idx);
console.log(content.substring(idx, endIdx));

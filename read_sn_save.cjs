const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');
let idx = content.indexOf('const handleSave = async');
let start = Math.max(0, idx - 100);
console.log(content.substring(start, idx + 2000));

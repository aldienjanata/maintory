const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');
let idx = content.indexOf('const handleSave = async');
console.log(content.substring(idx, idx + 2500));

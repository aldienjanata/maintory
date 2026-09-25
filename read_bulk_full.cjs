const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');

let idx = content.indexOf('const handleSaveBulk = async');
let endIdx = content.indexOf('const handleDelete = async', idx);
console.log(content.substring(idx, endIdx));

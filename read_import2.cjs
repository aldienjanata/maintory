const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');

// I need to find handleImportExcel and modify its skip logic to allow recycling
let idx = content.indexOf('const handleImportExcel = async');
let endIdx = content.indexOf('const handleDelete = async', idx);
console.log(content.substring(idx, endIdx));

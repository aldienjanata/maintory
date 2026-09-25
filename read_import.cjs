const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');
let idx = content.indexOf('const handleImportExcel = async (e)');
let endIdx = content.indexOf('const fetchHistory = async', idx);
console.log(content.substring(idx, endIdx));

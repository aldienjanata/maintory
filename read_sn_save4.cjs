const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');
let idx = content.indexOf('} else {');
let idx2 = content.indexOf('const { data: newSn, error } = await supabase.from(\'serial_numbers\')', idx);
console.log(content.substring(idx2 - 100, idx2 + 1000));

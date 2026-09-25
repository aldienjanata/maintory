const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');

let lines = content.split('\n');
let start = -1;
let end = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const handleImportExcel = async')) start = i;
  if (start !== -1 && i > start && lines[i].includes('const fetchHistory = async')) {
    end = i;
    break;
  }
}
if (start !== -1 && end !== -1) {
  for (let i = start; i < end; i++) {
    console.log(lines[i]);
  }
} else {
  console.log('Not found');
}

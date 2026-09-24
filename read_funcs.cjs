const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');
let lines = content.split('\n');

let start = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const handleBulkEditNote =')) {
    start = i;
    break;
  }
}
for (let i = start; i < start + 30; i++) {
  console.log(lines[i]);
}
console.log('---');
start = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const handleSaveEdit =')) {
    start = i;
    break;
  }
}
for (let i = start; i < start + 25; i++) {
  console.log(lines[i]);
}

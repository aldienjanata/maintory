const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');
let lines = content.split('\n');
for (let i = 402; i < 500; i++) {
  console.log(lines[i]);
}

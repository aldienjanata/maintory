const fs = require('fs');
let content = fs.readFileSync('src/pages/inventory/SerialNumber.jsx', 'utf8');
let lines = content.split('\n');
for(let i=0; i<lines.length; i++) {
  if (lines[i].includes('async () => {') && lines[i].includes('save') || lines[i].includes('Save')) {
    console.log(i + ': ' + lines[i]);
  }
}

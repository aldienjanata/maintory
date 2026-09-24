const fs = require('fs');
let file = 'src/pages/scanner/BarcodeScanner.jsx';
let content = fs.readFileSync(file, 'utf8');
// Print state declarations area
let idx = content.indexOf('export default function');
console.log(content.substring(idx, idx + 4000));

const fs = require('fs');
let file = 'src/pages/scanner/BarcodeScanner.jsx';
let content = fs.readFileSync(file, 'utf8');
let idx = content.indexOf('const handleScan = (e)');
console.log(content.substring(idx, idx + 600));

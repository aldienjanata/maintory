const fs = require('fs');
let file = 'src/pages/scanner/BarcodeScanner.jsx';
let content = fs.readFileSync(file, 'utf8');

let startIndex = content.indexOf('const processBarcode = useCallback(async (barcode) => {');
let endIndex = content.indexOf('// ===== CAMERA =====');
console.log(content.substring(startIndex, endIndex));

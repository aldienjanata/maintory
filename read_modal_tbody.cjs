const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

let idx = content.indexOf('<tbody>');
// Need to find the second tbody, since the first one is tempScans
let idx2 = content.indexOf('<tbody>', idx + 1);
let idx3 = content.indexOf('<tbody>', idx2 + 1);
// There are multiple tbodys. Let's search near "historyData.map"
let idxMap = content.indexOf('historyData.map');
console.log(content.substring(idxMap - 200, idxMap + 1500));

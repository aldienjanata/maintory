const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');
const modal = fs.readFileSync('modal_jsx.txt', 'utf8');

const marker = "      {/* MODAL EXPORT */}";
if (content.includes(marker)) {
  content = content.replace(marker, modal + marker);
  console.log('History modal injected!');
} else {
  console.log('Marker not found!');
}

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Saved.');

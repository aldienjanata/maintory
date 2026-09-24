const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

const oldStyle = `<div className="modal" style={{ maxWidth: '700px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>`;
const newStyle = `<div className="modal" style={{ maxWidth: '1000px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>`;

if (content.includes(oldStyle)) {
  content = content.replace(oldStyle, newStyle);
  console.log('Replaced');
} else {
  console.log('Not found');
}

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);

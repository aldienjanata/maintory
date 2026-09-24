const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');
let idx = content.indexOf('<th style={{ padding: ''8px 6px'', textAlign: ''left'', color: ''var(--text-secondary)'', fontWeight: 600, whiteSpace: ''nowrap'' }}>Waktu Scan</th>');
let start = Math.max(0, idx - 200);
console.log(content.substring(start, idx + 800));

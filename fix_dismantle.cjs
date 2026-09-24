const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Replace the filter option
const oldFilter = `<option value="Rusak">Rusak</option></select></div>`;
const newFilter = `<option value="Rusak">Rusak</option><option value="Dismantle">Dismantle</option></select></div>`;
content = content.replace(oldFilter, newFilter);

// Fix history modal styling for Dismantle
const oldHistStyle = `background: h.ont_kondisi === 'Aman' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: h.ont_kondisi === 'Aman' ? 'var(--success)' : 'var(--danger)'`;
const newHistStyle = `background: h.ont_kondisi === 'Aman' ? 'rgba(34,197,94,0.15)' : (h.ont_kondisi === 'Dismantle' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'), color: h.ont_kondisi === 'Aman' ? 'var(--success)' : (h.ont_kondisi === 'Dismantle' ? 'var(--warning)' : 'var(--danger)')`;
content = content.replace(oldHistStyle, newHistStyle);

// Fix main table styling for Dismantle
const oldMainStyle = `background: s.ont_kondisi === 'Aman' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: s.ont_kondisi === 'Aman' ? 'var(--success)' : 'var(--danger)'`;
const newMainStyle = `background: s.ont_kondisi === 'Aman' ? 'rgba(34,197,94,0.1)' : (s.ont_kondisi === 'Dismantle' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)'), color: s.ont_kondisi === 'Aman' ? 'var(--success)' : (s.ont_kondisi === 'Dismantle' ? 'var(--warning)' : 'var(--danger)')`;
content = content.replace(oldMainStyle, newMainStyle);

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Fixed dismantle display');

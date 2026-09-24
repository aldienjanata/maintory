const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

const oldTb = `                </>\r\n)}\r\n                {can(role, 'scanner.export')`;
const newTb = `                </>\r\n)}\r\n                {can(role, 'scanner.edit') && (\r\n                  <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkEditNote(true)} title="Edit catatan massal" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Edit2 size={13} /> <span className="hide-on-mobile">Bulk Edit</span></button>\r\n                )}\r\n                {can(role, 'scanner.export')`;
content = content.replace(oldTb, newTb);
console.log('Toolbar replaced:', content.includes('showBulkEditNote'));

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Saved.');

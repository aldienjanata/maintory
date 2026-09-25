const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');
const badPrefix = "<button className=\"btn btn-secondary btn-sm\" onClick={() => setShowBulkEditNote(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Edit2 size={13} /><span className=\"hide-on-mobile\" style={{marginLeft:'4px'}}>Bulk Edit</span></button>\r\n                ";
if (content.startsWith(badPrefix)) {
  content = content.substring(badPrefix.length);
  fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
  console.log('Fixed top of file');
} else if (content.startsWith("<button className=")) {
  let lines = content.split('\n');
  lines.shift();
  lines.shift();
  fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', lines.join('\n'));
  console.log('Fixed top of file (fallback)');
}

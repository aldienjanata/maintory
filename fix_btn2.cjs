const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Use exact escaped characters
const marker = "</button>\r\n                </>\r\n)}\r\n                {can(role, 'scanner.export')";
const replacement = "</button>\r\n                </>\r\n)}\r\n                <button className=\"btn btn-secondary btn-sm\" onClick={() => setShowBulkEditNote(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Edit2 size={13} /><span className=\"hide-on-mobile\" style={{marginLeft:'4px'}}>Bulk Edit</span></button>\r\n                {can(role, 'scanner.export')";

if (content.includes(marker)) {
  content = content.replace(marker, replacement);
  console.log('Bulk Edit button added!');
} else {
  console.log('Still not found. Trying index-based approach...');
  // Find by index
  let idx = content.indexOf("'scanner.export') && <button className=\"btn btn-secondary btn-sm\" onClick={() => setShowExportModal");
  let before = content.substring(0, idx);
  let after = content.substring(idx);
  // Insert button before can(role, 'scanner.export')
  let insertPoint = before.lastIndexOf("{can(role, 'scanner.export')");
  let beforeInsert = content.substring(0, insertPoint);
  let afterInsert = content.substring(insertPoint);
  content = beforeInsert + "<button className=\"btn btn-secondary btn-sm\" onClick={() => setShowBulkEditNote(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Edit2 size={13} /><span className=\"hide-on-mobile\" style={{marginLeft:'4px'}}>Bulk Edit</span></button>\r\n                " + afterInsert;
  console.log('Inserted by index. Check:', content.includes('showBulkEditNote'));
}

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Saved.');

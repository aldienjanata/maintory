const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');
let lines = content.split('\n');

// Insert new button at line 735 (0-indexed: 734), before the export button
const bulkEditBtn = "                <button className=\"btn btn-secondary btn-sm\" onClick={() => setShowBulkEditNote(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Edit2 size={13} /><span className=\"hide-on-mobile\" style={{marginLeft:'4px'}}>Bulk Edit</span></button>\r";

// Insert at index 734 (before line 735 which is export button)
lines.splice(734, 0, bulkEditBtn);

content = lines.join('\n');
fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Inserted! Line 735 now:', JSON.stringify(lines[735]));
console.log('Line 736 now:', JSON.stringify(lines[736]));

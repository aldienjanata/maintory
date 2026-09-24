const fs = require('fs');
let file = 'src/pages/scanner/BarcodeScanner.jsx';
let content = fs.readFileSync(file, 'utf8');

// Replace in Export
content = content.replace(
    "users[s.scanned_by] || '-'",
    "users[s.updated_by || s.scanned_by] || '-'"
);

// Replace in UI table
content = content.replace(
    "<td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{users[s.scanned_by] || '-'}</td>",
    "<td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{users[s.updated_by || s.scanned_by] || '-'}</td>"
);

fs.writeFileSync(file, content);
console.log('Fixed scanned_by in BarcodeScanner.jsx');

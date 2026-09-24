const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Add bulk edit button directly after the calendar button (delete by date)
const oldSection = `<button className="btn btn-secondary btn-sm" onClick={() => setShowDeleteByDate(true)} title="Hapus by tanggal"><Calendar size={13} /></button>\r\n                </>\r\n)}\r\n                {can(role, 'scanner.export')`;
const newSection = `<button className="btn btn-secondary btn-sm" onClick={() => setShowDeleteByDate(true)} title="Hapus by tanggal"><Calendar size={13} /></button>\r\n                </>\r\n)}\r\n                <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkEditNote(true)} title="Edit catatan massal" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Edit2 size={13} /> <span className="hide-on-mobile">Bulk Edit</span></button>\r\n                {can(role, 'scanner.export')`;

if (content.includes(oldSection)) {
  content = content.replace(oldSection, newSection);
  console.log('Button added!');
} else {
  // Try LF
  const oldSectionLF = `<button className="btn btn-secondary btn-sm" onClick={() => setShowDeleteByDate(true)} title="Hapus by tanggal"><Calendar size={13} /></button>\n                </>\n)}\n                {can(role, 'scanner.export')`;
  if (content.includes(oldSectionLF)) {
    content = content.replace(oldSectionLF, newSection.replace(/\r\n/g, '\n'));
    console.log('Button added with LF!');
  } else {
    // Try with space around )}
    let idx = content.indexOf("setShowDeleteByDate(true)} title=\"Hapus by tanggal\"");
    let snippet = content.substring(idx, idx + 200);
    console.log('Snippet:', JSON.stringify(snippet));
  }
}

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);

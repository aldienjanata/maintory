const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');
const modal = fs.readFileSync('bulk_edit_modal.txt', 'utf8');

// Inject modal before HISTORY MODAL
const marker = "      {/* HISTORY MODAL */}";
if (content.includes(marker)) {
  content = content.replace(marker, modal + marker);
  console.log('Bulk edit modal injected!');
} else {
  console.log('Marker not found!');
}

// Now add bulk edit button to toolbar - after the delete by date button
const oldToolbar = `{can(role, 'scanner.delete') && (<>
                  <button className={\`btn btn-sm \${selectMode ? 'btn-primary' : 'btn-secondary'}\`} onClick={() => { setSelectMode(!selectMode); setSelected(new Set()) }}><CheckSquare size={13} /> <span className="hide-on-mobile">{selectMode ? 'Batal' : 'Pilih'}</span></button>
                  {selectMode && selected.size > 0 && <button className="btn btn-danger btn-sm" onClick={handleDeleteSelected}><Trash2 size={13} /> ({selected.size})</button>}
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowDeleteByDate(true)} title="Hapus by tanggal"><Calendar size={13} /></button>
                </>)}`;
const newToolbar = `{can(role, 'scanner.delete') && (<>
                  <button className={\`btn btn-sm \${selectMode ? 'btn-primary' : 'btn-secondary'}\`} onClick={() => { setSelectMode(!selectMode); setSelected(new Set()) }}><CheckSquare size={13} /> <span className="hide-on-mobile">{selectMode ? 'Batal' : 'Pilih'}</span></button>
                  {selectMode && selected.size > 0 && <button className="btn btn-danger btn-sm" onClick={handleDeleteSelected}><Trash2 size={13} /> ({selected.size})</button>}
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowDeleteByDate(true)} title="Hapus by tanggal"><Calendar size={13} /></button>
                </>)}
                {can(role, 'scanner.edit') && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkEditNote(true)} title="Edit catatan massal" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Edit2 size={13} /> <span className="hide-on-mobile">Bulk Edit</span></button>
                )}`;
content = content.replace(oldToolbar, newToolbar);
console.log('Toolbar button added:', content.includes('Bulk Edit'));

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Saved.');

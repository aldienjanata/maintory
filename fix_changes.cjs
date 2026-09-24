const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

const oldRow = `<td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                              {h.action === 'bulk_edit' ? 'Edit Massal' : h.action === 'edit' ? 'Edit Manual' : 'Scan'}
                            </span>
                          </td>`;

const newRow = `<td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-secondary)', display: 'inline-block' }}>
                              {h.action === 'bulk_edit' ? 'Edit Massal' : h.action === 'edit' ? 'Edit Manual' : 'Scan'}
                            </span>
                            {i > 0 && h.action !== 'scan' && (() => {
                              const prev = historyData[i-1];
                              const changes = [];
                              if (h.note !== prev.note) changes.push('Catatan');
                              if (h.ont_kondisi !== prev.ont_kondisi) changes.push('Kondisi');
                              if (h.ont_asal !== prev.ont_asal || h.ont_asal_detail !== prev.ont_asal_detail) changes.push('Asal');
                              if (h.ont_tujuan !== prev.ont_tujuan || h.ont_tujuan_detail !== prev.ont_tujuan_detail) changes.push('Tujuan');
                              if (h.category !== prev.category) changes.push('Kategori');
                              if (changes.length === 0) return null;
                              return <div style={{ fontSize: '9px', color: 'var(--accent)', marginTop: '4px' }}>Ubah: {changes.join(', ')}</div>
                            })()}
                          </td>`;

if (content.includes(oldRow)) {
  content = content.replace(oldRow, newRow);
  console.log("Replaced exact");
} else {
  const oldRowLF = oldRow.replace(/\r\n/g, '\n');
  if (content.includes(oldRowLF)) {
    content = content.replace(oldRowLF, newRow.replace(/\r\n/g, '\n'));
    console.log("Replaced LF");
  } else {
    console.log("Not found!");
  }
}

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);

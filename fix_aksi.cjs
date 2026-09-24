const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Modal table header
const oldHead = `<th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>#</th>`;
const newHead = `<th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>#</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>Aksi</th>`;
content = content.replace(oldHead, newHead);

// Modal table row
const oldRow = `<td style={{ padding: '8px 6px', color: 'var(--text-muted)' }}>{i + 1}</td>`;
const newRow = `<td style={{ padding: '8px 6px', color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                              {h.action === 'bulk_edit' ? 'Edit Massal' : h.action === 'edit' ? 'Edit Manual' : 'Scan'}
                            </span>
                          </td>`;
content = content.replace(oldRow, newRow);

// Excel headers
const oldExcelHdrs = `const histHdrs = ['No', 'Barcode / SN', 'Waktu Scan', 'Kategori', 'Catatan', 'Kondisi ONT', 'Asal ONT', 'Tujuan ONT', 'Oleh']`;
const newExcelHdrs = `const histHdrs = ['No', 'Aksi', 'Barcode / SN', 'Waktu Scan', 'Kategori', 'Catatan', 'Kondisi ONT', 'Asal ONT', 'Tujuan ONT', 'Oleh']`;
content = content.replace(oldExcelHdrs, newExcelHdrs);

// Excel widths
const oldWidths = `setColumnWidths(ws2, [6, 25, 20, 12, 30, 14, 25, 25, 18])`;
const newWidths = `setColumnWidths(ws2, [6, 15, 25, 20, 12, 30, 14, 25, 25, 18])`;
content = content.replace(oldWidths, newWidths);

// Excel row
const oldExcelRow = `const row = ws2.addRow([i + 1, h.barcode, format(new Date(h.scanned_at), 'dd/MM/yyyy HH:mm:ss'), h.category || 'umum', h.note || '', h.ont_kondisi || '', asal, tujuan, h.scanner?.full_name || '-'])`;
const newExcelRow = `const actionName = h.action === 'bulk_edit' ? 'Edit Massal' : h.action === 'edit' ? 'Edit Manual' : 'Scan'
          const row = ws2.addRow([i + 1, actionName, h.barcode, format(new Date(h.scanned_at), 'dd/MM/yyyy HH:mm:ss'), h.category || 'umum', h.note || '', h.ont_kondisi || '', asal, tujuan, h.scanner?.full_name || '-'])`;
content = content.replace(oldExcelRow, newExcelRow);

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Done!');

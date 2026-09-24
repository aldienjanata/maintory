const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// ============================================================
// FIX 1: Add History button in the table row action buttons
// (next to edit and delete buttons)
// ============================================================
const oldEditBtn = `{can(role, 'scanner.edit') && <button className="btn-icon" onClick={() => handleEdit(s)}><Edit2 size={13} /></button>}
                          {can(role, 'scanner.delete') && <button className="btn-icon text-danger" onClick={() => handleDeleteSingle(s)}><Trash2 size={13} /></button>}`;

const newEditBtn = `<button className="btn-icon" onClick={() => fetchHistory(s)} title="Lihat Riwayat"><History size={13} /></button>
                          {can(role, 'scanner.edit') && <button className="btn-icon" onClick={() => handleEdit(s)}><Edit2 size={13} /></button>}
                          {can(role, 'scanner.delete') && <button className="btn-icon text-danger" onClick={() => handleDeleteSingle(s)}><Trash2 size={13} /></button>}`;

content = content.replace(oldEditBtn, newEditBtn);
console.log('Added history button to table row:', content.includes(newEditBtn));

// ============================================================
// FIX 2: Add scan_count indicator in the barcode column to visually flag re-scanned
// Already shown in scan_count column, but add a badge in barcode cell for re-scans
// ============================================================
// Already existing: scan_count > 1 shows warning color in scan count cell

// ============================================================
// FIX 3: Add History icon import
// ============================================================
// Check existing imports from lucide-react
const oldLucideImport = content.match(/import \{[^}]+\} from 'lucide-react'/)[0];
if (!oldLucideImport.includes('History')) {
  const newLucideImport = oldLucideImport.replace(/\}$/, ', History }');
  content = content.replace(oldLucideImport, newLucideImport);
  console.log('Added History icon import');
}

// ============================================================
// FIX 4: Add History Modal JSX before the Export Modal
// ============================================================
const beforeExportModal = `      {/* MODAL EXPORT */}`;

const historyModal = `      {/* HISTORY MODAL */}
      {historyItem && createPortal(
        <div className="modal-overlay" onClick={() => setHistoryItem(null)}>
          <div className="modal" style={{ maxWidth: '700px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={16} />
                Riwayat Scan: <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{historyItem.barcode}</span>
              </h3>
              <button className="btn-icon" onClick={() => setHistoryItem(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Memuat riwayat...</div>
              ) : historyData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  <History size={36} style={{ opacity: 0.2, display: 'block', margin: '0 auto 10px' }} />
                  <div>Belum ada riwayat scan</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>#</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>Waktu Scan</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>Kategori</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>Catatan</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>Kondisi ONT</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>Asal / Tujuan</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>Oleh</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.map((h, i) => (
                        <tr key={h.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-primary)' }}>
                          <td style={{ padding: '8px 6px', color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                            {(() => { try { return format(new Date(h.scanned_at), 'dd MMM yyyy HH:mm:ss') } catch { return '-' } })()}
                          </td>
                          <td style={{ padding: '8px 6px' }}>
                            <span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: '4px' }}>{h.category || 'umum'}</span>
                          </td>
                          <td style={{ padding: '8px 6px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{h.note || '-'}</td>
                          <td style={{ padding: '8px 6px' }}>
                            {h.ont_kondisi ? (
                              <span style={{ fontSize: '10px', padding: '2px 6px', background: h.ont_kondisi === 'Aman' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: h.ont_kondisi === 'Aman' ? 'var(--success)' : 'var(--danger)', borderRadius: '4px' }}>{h.ont_kondisi}</span>
                            ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                          </td>
                          <td style={{ padding: '8px 6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {h.ont_asal ? <div>Dari: {h.ont_asal}{h.ont_asal_detail ? ` (${h.ont_asal_detail})` : ''}</div> : null}
                            {h.ont_tujuan ? <div>Ke: {h.ont_tujuan}{h.ont_tujuan_detail ? ` (${h.ont_tujuan_detail})` : ''}</div> : null}
                            {!h.ont_asal && !h.ont_tujuan && <span style={{ color: 'var(--text-muted)' }}>-</span>}
                          </td>
                          <td style={{ padding: '8px 6px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{h.scanner?.full_name || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL EXPORT */}`;

content = content.replace(beforeExportModal, historyModal);
console.log('Added history modal:', content.includes('HISTORY MODAL'));

// ============================================================
// FIX 5: Add history sheet to Excel export
// ============================================================
const oldExportBuf = `      const buf = await wb.xlsx.writeBuffer()`;
const newExportBuf = `      // ---- Riwayat Scan sheet ----
      const { data: histRows } = await supabase
        .from('barcode_scan_history')
        .select('*, scanner:users!barcode_scan_history_scanned_by_fkey(full_name)')
        .order('scanned_at', { ascending: true })
      if (histRows && histRows.length > 0) {
        const ws2 = wb.addWorksheet('Riwayat Scan')
        const histHdrs = ['No', 'Barcode / SN', 'Waktu Scan', 'Kategori', 'Catatan', 'Kondisi ONT', 'Asal ONT', 'Tujuan ONT', 'Oleh']
        applyHeaderStyle(ws2, histHdrs, '065F46')
        setColumnWidths(ws2, [6, 25, 20, 12, 30, 14, 25, 25, 18])
        histRows.forEach((h, i) => {
          const d = new Date(h.scanned_at)
          ws2.addRow([
            i + 1, h.barcode,
            format(d, 'dd/MM/yyyy HH:mm:ss'),
            h.category || 'umum', h.note || '',
            h.ont_kondisi || '',
            h.ont_asal ? h.ont_asal + (h.ont_asal_detail ? \` (\${h.ont_asal_detail})\` : '') : '',
            h.ont_tujuan ? h.ont_tujuan + (h.ont_tujuan_detail ? \` (\${h.ont_tujuan_detail})\` : '') : '',
            h.scanner?.full_name || '-'
          ])
        })
      }

      const buf = await wb.xlsx.writeBuffer()`;

content = content.replace(oldExportBuf, newExportBuf);
console.log('Added history export sheet:', content.includes('Riwayat Scan sheet'));

// ============================================================
// FIX 6: Fix delete counter bug - when handleDeleteSingle is called from
// main table (not camera), we need to also remove from `scans` state immediately
// ============================================================
const oldDeleteSingle = `  const handleDeleteSingle = (s) => {
    requestConfirm('Hapus Data', \`Hapus "\${s.barcode}"? Tidak bisa dibatalkan.\`, async () => {
      await supabase.from('barcode_scans').delete().eq('id', s.id)
      toast.success('Dihapus'); fetchScans()
    })
  }`;

const newDeleteSingle = `  const handleDeleteSingle = (s) => {
    requestConfirm('Hapus Data', \`Hapus "\${s.barcode}"? Tidak bisa dibatalkan.\`, async () => {
      const { error } = await supabase.from('barcode_scans').delete().eq('id', s.id)
      if (!error) {
        toast.success('Dihapus')
        setScans(prev => prev.filter(item => item.id !== s.id))
      } else {
        toast.error('Gagal hapus: ' + error.message)
      }
    })
  }`;

content = content.replace(oldDeleteSingle, newDeleteSingle);
console.log('Fixed handleDeleteSingle:', content.includes('setScans(prev => prev.filter(item => item.id !== s.id))'));

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('All done, saved BarcodeScanner.jsx');

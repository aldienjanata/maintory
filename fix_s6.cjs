const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// 1. Add History icon import
const importMatch = content.match(/import \{[^}]+\} from 'lucide-react'/);
if (importMatch && !importMatch[0].includes('History')) {
  content = content.replace(importMatch[0], importMatch[0].replace('}', ', History }'));
  console.log('Added History import');
}

// 2. Add history button next to edit button in desktop table
const oldEditBtn = `{can(role, 'scanner.edit') && <button className="btn-icon" onClick={() => handleEdit(s)}><Edit2 size={13} /></button>}
                          {can(role, 'scanner.delete') && <button className="btn-icon text-danger" onClick={() => handleDeleteSingle(s)}><Trash2 size={13} /></button>}`;
const newEditBtn = `<button className="btn-icon" onClick={() => fetchHistory(s)} title="Lihat Riwayat"><History size={13} /></button>
                          {can(role, 'scanner.edit') && <button className="btn-icon" onClick={() => handleEdit(s)}><Edit2 size={13} /></button>}
                          {can(role, 'scanner.delete') && <button className="btn-icon text-danger" onClick={() => handleDeleteSingle(s)}><Trash2 size={13} /></button>}`;
content = content.replace(oldEditBtn, newEditBtn);
console.log('History button added:', content.includes('fetchHistory(s)'));

// 3. Fix handleDeleteSingle - use immediate state update instead of fetchScans
const oldDel = `    requestConfirm('Hapus Data', \`Hapus "\${s.barcode}"? Tidak bisa dibatalkan.\`, async () => {
      await supabase.from('barcode_scans').delete().eq('id', s.id)
      toast.success('Dihapus'); fetchScans()
    })`;
const newDel = `    requestConfirm('Hapus Data', \`Hapus "\${s.barcode}"? Tidak bisa dibatalkan.\`, async () => {
      const { error } = await supabase.from('barcode_scans').delete().eq('id', s.id)
      if (!error) { toast.success('Dihapus'); setScans(prev => prev.filter(item => item.id !== s.id)) }
      else toast.error('Gagal hapus: ' + error.message)
    })`;
content = content.replace(oldDel, newDel);
console.log('Fixed delete counter:', content.includes("setScans(prev => prev.filter(item => item.id !== s.id))"));

// 4. Add history export sheet before "const buf = await wb.xlsx.writeBuffer()"
const oldBuf = `      const buf = await wb.xlsx.writeBuffer()`;
const newBuf = `      // ---- Riwayat Scan sheet ----
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
          const asal = h.ont_asal ? h.ont_asal + (h.ont_asal_detail ? ' (' + h.ont_asal_detail + ')' : '') : ''
          const tujuan = h.ont_tujuan ? h.ont_tujuan + (h.ont_tujuan_detail ? ' (' + h.ont_tujuan_detail + ')' : '') : ''
          ws2.addRow([
            i + 1, h.barcode,
            format(new Date(h.scanned_at), 'dd/MM/yyyy HH:mm:ss'),
            h.category || 'umum', h.note || '',
            h.ont_kondisi || '', asal, tujuan,
            h.scanner?.full_name || '-'
          ])
        })
      }
      const buf = await wb.xlsx.writeBuffer()`;
content = content.replace(oldBuf, newBuf);
console.log('Added history export sheet:', content.includes('Riwayat Scan sheet'));

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Saved.');

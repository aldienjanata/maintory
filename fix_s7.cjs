const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// 1. Add history button - using character-by-character match
const oldEditSection = `{can(role, 'scanner.edit') && <button className="btn-icon" onClick={() => handleEdit(s)}><Edit2 size={13} /></button>}\r\n                          {can(role, 'scanner.delete') && <button className="btn-icon text-danger" onClick={() => handleDeleteSingle(s)}><Trash2 size={13} /></button>}`;
const newEditSection = `<button className="btn-icon" onClick={() => fetchHistory(s)} title="Lihat Riwayat"><History size={13} /></button>\r\n                          {can(role, 'scanner.edit') && <button className="btn-icon" onClick={() => handleEdit(s)}><Edit2 size={13} /></button>}\r\n                          {can(role, 'scanner.delete') && <button className="btn-icon text-danger" onClick={() => handleDeleteSingle(s)}><Trash2 size={13} /></button>}`;
content = content.replace(oldEditSection, newEditSection);
console.log('History btn added:', content.includes('fetchHistory(s)'));

// 2. Fix handleDeleteSingle
const oldDel = "await supabase.from('barcode_scans').delete().eq('id', s.id)\r\n      toast.success('Dihapus'); fetchScans()";
const newDel = "const { error } = await supabase.from('barcode_scans').delete().eq('id', s.id)\r\n      if (!error) { toast.success('Dihapus'); setScans(prev => prev.filter(item => item.id !== s.id)) }\r\n      else toast.error('Gagal hapus: ' + error.message)";
content = content.replace(oldDel, newDel);
console.log('Delete fix:', content.includes("setScans(prev => prev.filter"));

// 3. Find the export buffer location
let bufIdx = content.indexOf("wb.xlsx.writeBuffer()");
console.log('Buffer idx found:', bufIdx);
if (bufIdx > -1) {
  let prelude = "\r\n      // ---- Riwayat Scan sheet ----\r\n      const { data: histRows } = await supabase\r\n        .from('barcode_scan_history')\r\n        .select('*, scanner:users!barcode_scan_history_scanned_by_fkey(full_name)')\r\n        .order('scanned_at', { ascending: true })\r\n      if (histRows && histRows.length > 0) {\r\n        const ws2 = wb.addWorksheet('Riwayat Scan')\r\n        const histHdrs = ['No', 'Barcode / SN', 'Waktu Scan', 'Kategori', 'Catatan', 'Kondisi ONT', 'Asal ONT', 'Tujuan ONT', 'Oleh']\r\n        applyHeaderStyle(ws2, histHdrs, '065F46')\r\n        setColumnWidths(ws2, [6, 25, 20, 12, 30, 14, 25, 25, 18])\r\n        histRows.forEach((h, i) => {\r\n          const asal = h.ont_asal ? h.ont_asal + (h.ont_asal_detail ? ' (' + h.ont_asal_detail + ')' : '') : ''\r\n          const tujuan = h.ont_tujuan ? h.ont_tujuan + (h.ont_tujuan_detail ? ' (' + h.ont_tujuan_detail + ')' : '') : ''\r\n          ws2.addRow([i + 1, h.barcode, format(new Date(h.scanned_at), 'dd/MM/yyyy HH:mm:ss'), h.category || 'umum', h.note || '', h.ont_kondisi || '', asal, tujuan, h.scanner?.full_name || '-'])\r\n        })\r\n      }\r\n      ";
  content = content.substring(0, bufIdx) + prelude + "wb.xlsx.writeBuffer()" + content.substring(bufIdx + "wb.xlsx.writeBuffer()".length);
  console.log('Export sheet added:', content.includes('Riwayat Scan sheet'));
}

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Saved.');

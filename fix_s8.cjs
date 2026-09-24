const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Insert history sheet BEFORE applyDataRowStyles + downloadWorkbook
const target = "      applyDataRowStyles(ws)\r\n      await downloadWorkbook(wb, filename)";
const replacement = "      applyDataRowStyles(ws)\r\n\r\n      // ---- Riwayat Scan sheet ----\r\n      const { data: histRows } = await supabase\r\n        .from('barcode_scan_history')\r\n        .select('*, scanner:users!barcode_scan_history_scanned_by_fkey(full_name)')\r\n        .order('scanned_at', { ascending: true })\r\n      if (histRows && histRows.length > 0) {\r\n        const ws2 = wb.addWorksheet('Riwayat Scan')\r\n        const histHdrs = ['No', 'Barcode / SN', 'Waktu Scan', 'Kategori', 'Catatan', 'Kondisi ONT', 'Asal ONT', 'Tujuan ONT', 'Oleh']\r\n        applyHeaderStyle(ws2, histHdrs, '065F46')\r\n        setColumnWidths(ws2, [6, 25, 20, 12, 30, 14, 25, 25, 18])\r\n        histRows.forEach((h, i) => {\r\n          const asal = h.ont_asal ? h.ont_asal + (h.ont_asal_detail ? ' (' + h.ont_asal_detail + ')' : '') : ''\r\n          const tujuan = h.ont_tujuan ? h.ont_tujuan + (h.ont_tujuan_detail ? ' (' + h.ont_tujuan_detail + ')' : '') : ''\r\n          const row = ws2.addRow([i + 1, h.barcode, format(new Date(h.scanned_at), 'dd/MM/yyyy HH:mm:ss'), h.category || 'umum', h.note || '', h.ont_kondisi || '', asal, tujuan, h.scanner?.full_name || '-'])\r\n          applyDataRowStyles(ws2, row, i)\r\n        })\r\n      }\r\n\r\n      await downloadWorkbook(wb, filename)";

if (content.includes(target)) {
  content = content.replace(target, replacement);
  console.log('History export sheet added!');
} else {
  console.log('Target not found. Trying LF...');
  const targetLF = "      applyDataRowStyles(ws)\n      await downloadWorkbook(wb, filename)";
  if (content.includes(targetLF)) {
    content = content.replace(targetLF, replacement.replace(/\r\n/g, '\n'));
    console.log('Added with LF!');
  } else {
    console.log('NOT FOUND');
  }
}

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Saved.');

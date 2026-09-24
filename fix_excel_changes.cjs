const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

const oldExcelHdrs = `const histHdrs = ['No', 'Aksi', 'Barcode / SN', 'Waktu Scan', 'Kategori', 'Catatan', 'Kondisi ONT', 'Asal ONT', 'Tujuan ONT', 'Oleh']`;
const newExcelHdrs = `const histHdrs = ['No', 'Aksi', 'Info Perubahan', 'Barcode / SN', 'Waktu Scan', 'Kategori', 'Catatan', 'Kondisi ONT', 'Asal ONT', 'Tujuan ONT', 'Oleh']`;
content = content.replace(oldExcelHdrs, newExcelHdrs);

const oldWidths = `setColumnWidths(ws2, [6, 15, 25, 20, 12, 30, 14, 25, 25, 18])`;
const newWidths = `setColumnWidths(ws2, [6, 15, 20, 25, 20, 12, 30, 14, 25, 25, 18])`;
content = content.replace(oldWidths, newWidths);

const oldExcelRow = `const actionName = h.action === 'bulk_edit' ? 'Edit Massal' : h.action === 'edit' ? 'Edit Manual' : 'Scan'
          const row = ws2.addRow([i + 1, actionName, h.barcode, format(new Date(h.scanned_at), 'dd/MM/yyyy HH:mm:ss'), h.category || 'umum', h.note || '', h.ont_kondisi || '', asal, tujuan, h.scanner?.full_name || '-'])`;
const newExcelRow = `const actionName = h.action === 'bulk_edit' ? 'Edit Massal' : h.action === 'edit' ? 'Edit Manual' : 'Scan'
          let infoUbah = '-'
          if (i > 0 && h.action !== 'scan') {
            const prev = histRows[i-1]
            const changes = []
            if (h.note !== prev.note) changes.push('Catatan')
            if (h.ont_kondisi !== prev.ont_kondisi) changes.push('Kondisi')
            if (h.ont_asal !== prev.ont_asal || h.ont_asal_detail !== prev.ont_asal_detail) changes.push('Asal')
            if (h.ont_tujuan !== prev.ont_tujuan || h.ont_tujuan_detail !== prev.ont_tujuan_detail) changes.push('Tujuan')
            if (h.category !== prev.category) changes.push('Kategori')
            if (changes.length > 0) infoUbah = 'Ubah: ' + changes.join(', ')
          }
          const row = ws2.addRow([i + 1, actionName, infoUbah, h.barcode, format(new Date(h.scanned_at), 'dd/MM/yyyy HH:mm:ss'), h.category || 'umum', h.note || '', h.ont_kondisi || '', asal, tujuan, h.scanner?.full_name || '-'])`;

if (content.includes(oldExcelRow)) {
  content = content.replace(oldExcelRow, newExcelRow);
  console.log('Replaced excel exact');
} else {
  content = content.replace(oldExcelRow.replace(/\r\n/g, '\n'), newExcelRow.replace(/\r\n/g, '\n'));
  console.log('Replaced excel LF');
}

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);

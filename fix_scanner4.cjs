const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Find update block by simpler markers
let updateIdx = content.indexOf("if (!error) { toast.success(`");
let updateEnd = content.indexOf('return false }', updateIdx) + 'return false }'.length;

let updateBlock = content.substring(updateIdx, updateEnd);
console.log('Found update block:', JSON.stringify(updateBlock.substring(0, 100)));

// Check which block this is - update or insert
let insertIdx = content.indexOf("if (!error) { toast.success(`", updateIdx + 1);
let insertEnd = content.indexOf('return false }', insertIdx) + 'return false }'.length;

let insertBlock = content.substring(insertIdx, insertEnd);
console.log('Found insert block:', JSON.stringify(insertBlock.substring(0, 100)));

// Do targeted replacement for update block
const newUpdateIf = `if (!error) {
        await supabase.from('barcode_scan_history').insert({
          barcode_scan_id: existing.id, barcode, scanned_by: profile.id,
          scanned_at: payload.last_scan, category: bulk.category,
          note: bulk.note.trim() || existing.note || null,
          ont_kondisi: ontFields.ont_kondisi, ont_asal: ontFields.ont_asal,
          ont_asal_detail: ontFields.ont_asal_detail, ont_tujuan: ontFields.ont_tujuan,
          ont_tujuan_detail: ontFields.ont_tujuan_detail, action: 'scan'
        })
        toast.success(` + '`' + '?? Diperbarui: "' + '${barcode}"' + ' (' + '${newCount}x)' + '`' + `, { duration: 2000 })
        return updated
      }
      return false }`;

const newInsertIf = `if (!error) {
        await supabase.from('barcode_scan_history').insert({
          barcode_scan_id: inserted.id, barcode, scanned_by: profile.id,
          scanned_at: now, category: bulk.category, note: bulk.note.trim() || null,
          ont_kondisi: ontFields.ont_kondisi, ont_asal: ontFields.ont_asal,
          ont_asal_detail: ontFields.ont_asal_detail, ont_tujuan: ontFields.ont_tujuan,
          ont_tujuan_detail: ontFields.ont_tujuan_detail, action: 'scan'
        })
        toast.success(` + '`' + '? Tersimpan: "' + '${barcode}"' + '`' + `, { duration: 2000 })
        return inserted
      }
      return false }`;

content = content.replace(updateBlock, newUpdateIf);
content = content.replace(insertBlock, newInsertIf);

const checkResult = content.includes('barcode_scan_history');
console.log('History inserts added:', checkResult);

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Saved.');

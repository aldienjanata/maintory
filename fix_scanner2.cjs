const fs = require('fs');

let file = 'src/pages/scanner/BarcodeScanner.jsx';
let content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');
console.log('Total lines:', lines.length);

// ============================================================
// FIX 1: processBarcode - insert history log for every scan event
// ============================================================
// Find the existing block that does: if (existing) { ... update ... } else { ... insert ... }
// We'll modify to also insert into barcode_scan_history

// EXISTING UPDATE block:
const oldUpdateBlock = `      const { data: existing } = await supabase.from('barcode_scans').select('*').eq('barcode', barcode).maybeSingle()
    if (existing) {
      const newCount = (existing.scan_count || 1) + 1
      const payload = {
        last_scan: new Date().toISOString(), 
        scan_count: newCount, 
        updated_by: profile.id,
        note: bulk.note.trim() || existing.note,
        category: bulk.category,
        ...ontFields
      }
      const { error, data: updated } = await supabase.from('barcode_scans').update(payload).eq('id', existing.id).select().single()
      if (!error) { toast.success(\`?? Diperbarui: "\${barcode}" (\${newCount}x)\`, { duration: 2000 }); return updated }
      if (error) { toast.error('Gagal update: ' + error.message); return false }
    } else {
      const now = new Date().toISOString()
      const payload = {
        barcode, note: bulk.note.trim() || null, category: bulk.category,
        scanned_by: profile.id, first_scan: now, last_scan: now, scan_count: 1,
        ...ontFields
      }
      const { error, data: inserted } = await supabase.from('barcode_scans').insert(payload).select().single()
      if (!error) { toast.success(\`? Tersimpan: "\${barcode}"\`, { duration: 2000 }); return inserted }
      if (error) { toast.error('Gagal simpan: ' + error.message); return false }
    }`;

const newUpdateBlock = `      const { data: existing } = await supabase.from('barcode_scans').select('*').eq('barcode', barcode).maybeSingle()
    if (existing) {
      const newCount = (existing.scan_count || 1) + 1
      const payload = {
        last_scan: new Date().toISOString(), 
        scan_count: newCount, 
        updated_by: profile.id,
        note: bulk.note.trim() || existing.note,
        category: bulk.category,
        ...ontFields
      }
      const { error, data: updated } = await supabase.from('barcode_scans').update(payload).eq('id', existing.id).select().single()
      if (!error) {
        // Log history for re-scan
        const now = new Date().toISOString()
        await supabase.from('barcode_scan_history').insert({
          barcode_scan_id: existing.id,
          barcode,
          scanned_by: profile.id,
          scanned_at: now,
          category: bulk.category,
          note: bulk.note.trim() || existing.note || null,
          ont_kondisi: ontFields.ont_kondisi,
          ont_asal: ontFields.ont_asal,
          ont_asal_detail: ontFields.ont_asal_detail,
          ont_tujuan: ontFields.ont_tujuan,
          ont_tujuan_detail: ontFields.ont_tujuan_detail,
          action: 'scan'
        })
        toast.success(\`?? Diperbarui: "\${barcode}" (\${newCount}x)\`, { duration: 2000 }); return updated
      }
      if (error) { toast.error('Gagal update: ' + error.message); return false }
    } else {
      const now = new Date().toISOString()
      const payload = {
        barcode, note: bulk.note.trim() || null, category: bulk.category,
        scanned_by: profile.id, first_scan: now, last_scan: now, scan_count: 1,
        ...ontFields
      }
      const { error, data: inserted } = await supabase.from('barcode_scans').insert(payload).select().single()
      if (!error) {
        // Log history for first scan
        await supabase.from('barcode_scan_history').insert({
          barcode_scan_id: inserted.id,
          barcode,
          scanned_by: profile.id,
          scanned_at: now,
          category: bulk.category,
          note: bulk.note.trim() || null,
          ont_kondisi: ontFields.ont_kondisi,
          ont_asal: ontFields.ont_asal,
          ont_asal_detail: ontFields.ont_asal_detail,
          ont_tujuan: ontFields.ont_tujuan,
          ont_tujuan_detail: ontFields.ont_tujuan_detail,
          action: 'scan'
        })
        toast.success(\`? Tersimpan: "\${barcode}"\`, { duration: 2000 }); return inserted
      }
      if (error) { toast.error('Gagal simpan: ' + error.message); return false }
    }`;

if (!content.includes(oldUpdateBlock)) {
  console.error('ERROR: Could not find old update block!');
  process.exit(1);
}
content = content.replace(oldUpdateBlock, newUpdateBlock);
console.log('Fixed: processBarcode now logs history');

// ============================================================
// FIX 2: Add history state + fetch function near fetchScans
// ============================================================
const oldFetchScans = `  const fetchScans = async () => {
    setLoading(true)
    const { data } = await supabase.from('barcode_scans').select('*').order('last_scan', { ascending: false })
    setScans(data || [])
    setLoading(false)
  }`;

const newFetchScans = `  const fetchScans = async () => {
    setLoading(true)
    const { data } = await supabase.from('barcode_scans').select('*').order('last_scan', { ascending: false })
    setScans(data || [])
    setLoading(false)
  }

  // History modal
  const [historyItem, setHistoryItem] = useState(null)
  const [historyData, setHistoryData] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchHistory = async (item) => {
    setHistoryItem(item)
    setHistoryLoading(true)
    const { data } = await supabase
      .from('barcode_scan_history')
      .select('*, scanner:users!barcode_scan_history_scanned_by_fkey(full_name)')
      .eq('barcode', item.barcode)
      .order('scanned_at', { ascending: true })
    setHistoryData(data || [])
    setHistoryLoading(false)
  }`;

if (!content.includes(oldFetchScans)) {
  console.error('ERROR: Could not find fetchScans!');
  process.exit(1);
}
content = content.replace(oldFetchScans, newFetchScans);
console.log('Fixed: added history state + fetchHistory');

// ============================================================
// FIX 3: handleExport - add a second sheet for history
// ============================================================
const oldExportEnd = `        ws.addRow(rowData)
      })

      const buf = await wb.xlsx.writeBuffer()`;

const newExportEnd = `        ws.addRow(rowData)
      })

      // ---- Sheet 2: Riwayat Scan ----
      const { data: histRows } = await supabase
        .from('barcode_scan_history')
        .select('*, scanner:users!barcode_scan_history_scanned_by_fkey(full_name)')
        .order('scanned_at', { ascending: true })

      if (histRows && histRows.length > 0) {
        const ws2 = wb.addWorksheet('Riwayat Scan')
        const histHeaders = ['No', 'Barcode / SN', 'Waktu Scan', 'Kategori', 'Catatan', 'Kondisi ONT', 'Asal ONT', 'Tujuan ONT', 'Oleh', 'Aksi']
        applyHeaderStyle(ws2, histHeaders, '065F46')
        setColumnWidths(ws2, [6, 25, 20, 12, 30, 14, 25, 25, 18, 10])
        histRows.forEach((h, i) => {
          const d = new Date(h.scanned_at)
          ws2.addRow([
            i + 1,
            h.barcode,
            format(d, 'dd/MM/yyyy HH:mm:ss'),
            h.category || 'umum',
            h.note || '',
            h.ont_kondisi || '',
            h.ont_asal ? \`\${h.ont_asal}\${h.ont_asal_detail ? \` (\${h.ont_asal_detail})\` : ''}\` : '',
            h.ont_tujuan ? \`\${h.ont_tujuan}\${h.ont_tujuan_detail ? \` (\${h.ont_tujuan_detail})\` : ''}\` : '',
            h.scanner?.full_name || '-',
            h.action || 'scan'
          ])
        })
      }

      const buf = await wb.xlsx.writeBuffer()`;

if (!content.includes(oldExportEnd)) {
  console.error('ERROR: Could not find export end block!');
  process.exit(1);
}
content = content.replace(oldExportEnd, newExportEnd);
console.log('Fixed: export now includes history sheet');

fs.writeFileSync(file, content);
console.log('Done writing BarcodeScanner.jsx');

const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Strategy: use regex to find and replace the two blocks separately

// 1. Replace the UPDATE block (when existing)
content = content.replace(
  /const \{ error, data: updated \} = await supabase\.from\('barcode_scans'\)\.update\(payload\)\.eq\('id', existing\.id\)\.select\(\)\.single\(\)\r?\n      if \(!error\) \{ toast\.success\(`?? Diperbarui: ".*?"\`, \{ duration: 2000 \}\); return updated \}\r?\n      if \(error\) \{ toast\.error\('Gagal update: ' \+ error\.message\); return false \}/,
  `const { error, data: updated } = await supabase.from('barcode_scans').update(payload).eq('id', existing.id).select().single()
      if (!error) {
        await supabase.from('barcode_scan_history').insert({
          barcode_scan_id: existing.id,
          barcode,
          scanned_by: profile.id,
          scanned_at: payload.last_scan,
          category: bulk.category,
          note: bulk.note.trim() || existing.note || null,
          ont_kondisi: ontFields.ont_kondisi,
          ont_asal: ontFields.ont_asal,
          ont_asal_detail: ontFields.ont_asal_detail,
          ont_tujuan: ontFields.ont_tujuan,
          ont_tujuan_detail: ontFields.ont_tujuan_detail,
          action: 'scan'
        })
        toast.success(\`?? Diperbarui: "\${barcode}" (\${newCount}x)\`, { duration: 2000 })
        return updated
      }
      if (error) { toast.error('Gagal update: ' + error.message); return false }`
);

// 2. Replace the INSERT block (new scan)
content = content.replace(
  /const \{ error, data: inserted \} = await supabase\.from\('barcode_scans'\)\.insert\(payload\)\.select\(\)\.single\(\)\r?\n      if \(!error\) \{ toast\.success\(`? Tersimpan: ".*?"\`, \{ duration: 2000 \}\); return inserted \}\r?\n      if \(error\) \{ toast\.error\('Gagal simpan: ' \+ error\.message\); return false \}/,
  `const { error, data: inserted } = await supabase.from('barcode_scans').insert(payload).select().single()
      if (!error) {
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
        toast.success(\`? Tersimpan: "\${barcode}"\`, { duration: 2000 })
        return inserted
      }
      if (error) { toast.error('Gagal simpan: ' + error.message); return false }`
);

// Check if insertions happened
let checkUpdate = content.includes("barcode_scan_history");
console.log('History inserts added:', checkUpdate);

// 3. Add history state and fetchHistory function after fetchScans
const fetchScansEnd = `  const fetchUsers = async () => {`;
content = content.replace(
  fetchScansEnd,
  `  // Scan History Modal
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
  }

  const fetchUsers = async () => {`
);
console.log('fetchHistory added');

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Saved BarcodeScanner.jsx');

const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// 1. Add states for bulk edit modal
const statesSearch = "  const [showExportModal, setShowExportModal] = useState(false)";
const statesReplace = `  const [showExportModal, setShowExportModal] = useState(false)
  const [showBulkEditNote, setShowBulkEditNote] = useState(false)
  const [bulkEditNote, setBulkEditNote] = useState('')
  const [bulkEditMode, setBulkEditMode] = useState('selected') // 'selected' | 'date'
  const [bulkEditDateFrom, setBulkEditDateFrom] = useState('')
  const [bulkEditDateTo, setBulkEditDateTo] = useState('')
  const [bulkEditSaving, setBulkEditSaving] = useState(false)`;
content = content.replace(statesSearch, statesReplace);
console.log('States added:', content.includes('showBulkEditNote'));

// 2. Add handleBulkEditNote function (after handleDeleteByDate)
const funcSearch = `  const handleDeleteSingle = (s) => {`;
const funcReplace = `  const handleBulkEditNote = async () => {
    if (!bulkEditNote.trim()) { toast.error('Isi catatan baru'); return }
    setBulkEditSaving(true)
    try {
      if (bulkEditMode === 'selected') {
        if (selected.size === 0) { toast.error('Pilih data dulu'); setBulkEditSaving(false); return }
        const { error } = await supabase.from('barcode_scans').update({ note: bulkEditNote.trim() }).in('id', [...selected])
        if (error) throw error
        toast.success('Catatan diupdate untuk ' + selected.size + ' data')
        setScans(prev => prev.map(s => selected.has(s.id) ? { ...s, note: bulkEditNote.trim() } : s))
        setSelected(new Set())
        setSelectMode(false)
      } else {
        if (!bulkEditDateFrom) { toast.error('Pilih tanggal dari'); setBulkEditSaving(false); return }
        let query = supabase.from('barcode_scans').update({ note: bulkEditNote.trim() })
          .gte('first_scan', bulkEditDateFrom + 'T00:00:00')
        if (bulkEditDateTo) query = query.lte('first_scan', bulkEditDateTo + 'T23:59:59')
        const { error } = await query
        if (error) throw error
        toast.success('Catatan berhasil diupdate')
        fetchScans()
      }
      setShowBulkEditNote(false)
      setBulkEditNote('')
      setBulkEditDateFrom('')
      setBulkEditDateTo('')
    } catch (e) {
      toast.error('Gagal: ' + e.message)
    }
    setBulkEditSaving(false)
  }

  const handleDeleteSingle = (s) => {`;
content = content.replace(funcSearch, funcReplace);
console.log('Function added:', content.includes('handleBulkEditNote'));

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Saved step 1.');

const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

const oldBulk = `  const handleBulkEditNote = async () => {
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
  }`;

const newBulk = `  const handleBulkEditNote = async () => {
    if (!bulkEditNote.trim()) { toast.error('Isi catatan baru'); return }
    setBulkEditSaving(true)
    try {
      const now = new Date().toISOString()
      if (bulkEditMode === 'selected') {
        if (selected.size === 0) { toast.error('Pilih data dulu'); setBulkEditSaving(false); return }
        const { error } = await supabase.from('barcode_scans').update({ note: bulkEditNote.trim() }).in('id', [...selected])
        if (error) throw error
        const historyPayloads = scans.filter(s => selected.has(s.id)).map(s => ({
          barcode_scan_id: s.id, barcode: s.barcode, scanned_by: profile.id, scanned_at: now,
          category: s.category, note: bulkEditNote.trim(), ont_kondisi: s.ont_kondisi,
          ont_asal: s.ont_asal, ont_asal_detail: s.ont_asal_detail, ont_tujuan: s.ont_tujuan,
          ont_tujuan_detail: s.ont_tujuan_detail, action: 'bulk_edit'
        }))
        if (historyPayloads.length > 0) await supabase.from('barcode_scan_history').insert(historyPayloads)
        toast.success('Catatan diupdate untuk ' + selected.size + ' data')
        setScans(prev => prev.map(s => selected.has(s.id) ? { ...s, note: bulkEditNote.trim() } : s))
        setSelected(new Set())
        setSelectMode(false)
      } else {
        if (!bulkEditDateFrom) { toast.error('Pilih tanggal dari'); setBulkEditSaving(false); return }
        const matchingItems = scans.filter(s => s.first_scan >= bulkEditDateFrom + 'T00:00:00' && (!bulkEditDateTo || s.first_scan <= bulkEditDateTo + 'T23:59:59'))
        let query = supabase.from('barcode_scans').update({ note: bulkEditNote.trim() })
          .gte('first_scan', bulkEditDateFrom + 'T00:00:00')
        if (bulkEditDateTo) query = query.lte('first_scan', bulkEditDateTo + 'T23:59:59')
        const { error } = await query
        if (error) throw error
        const historyPayloads = matchingItems.map(s => ({
          barcode_scan_id: s.id, barcode: s.barcode, scanned_by: profile.id, scanned_at: now,
          category: s.category, note: bulkEditNote.trim(), ont_kondisi: s.ont_kondisi,
          ont_asal: s.ont_asal, ont_asal_detail: s.ont_asal_detail, ont_tujuan: s.ont_tujuan,
          ont_tujuan_detail: s.ont_tujuan_detail, action: 'bulk_edit'
        }))
        if (historyPayloads.length > 0) await supabase.from('barcode_scan_history').insert(historyPayloads)
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
  }`;

if (content.includes(oldBulk)) {
  content = content.replace(oldBulk, newBulk);
} else {
  const oldBulkLF = oldBulk.replace(/\r\n/g, '\n');
  content = content.replace(oldBulkLF, newBulk.replace(/\r\n/g, '\n'));
}

const oldSaveEdit = `    const { error } = await supabase.from('barcode_scans').update(payload).eq('id', editItem.id)
    if (!error) { toast.success('Diupdate'); setEditItem(null); fetchScans() }`;
const newSaveEdit = `    const { error } = await supabase.from('barcode_scans').update(payload).eq('id', editItem.id)
    if (!error) { 
      await supabase.from('barcode_scan_history').insert({
        barcode_scan_id: editItem.id, barcode: editItem.barcode, scanned_by: profile.id,
        scanned_at: new Date().toISOString(), category: payload.category, note: payload.note,
        ont_kondisi: payload.ont_kondisi, ont_asal: payload.ont_asal, ont_asal_detail: payload.ont_asal_detail,
        ont_tujuan: payload.ont_tujuan, ont_tujuan_detail: payload.ont_tujuan_detail, action: 'edit'
      })
      toast.success('Diupdate'); setEditItem(null); fetchScans() 
    }`;

if (content.includes(oldSaveEdit)) {
  content = content.replace(oldSaveEdit, newSaveEdit);
} else {
  const oldSaveEditLF = oldSaveEdit.replace(/\r\n/g, '\n');
  content = content.replace(oldSaveEditLF, newSaveEdit.replace(/\r\n/g, '\n'));
}

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Done replacing handleSaveEdit and handleBulkEditNote');

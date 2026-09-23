const fs = require('fs');
const lines = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8').split('\n');

const editFn = `
  const handleSaveCamEdit = async (item) => {
    const newBarcode = editingCamScanValue.trim().toUpperCase()
    if (!newBarcode) return
    if (newBarcode === item.barcode) {
      setEditingCamScanId(null)
      return
    }

    if (activeTab === 'simpan') {
      const { error } = await supabase.from('barcode_scans').delete().eq('barcode', item.barcode)
      if (error) { toast.error('Gagal menghapus data lama'); return }
      fetchScans()
    } else {
      setTempScans(prev => prev.filter(s => s.barcode !== item.barcode))
    }
    
    setCamScanCount(prev => Math.max(0, prev - 1))
    setCamScannedItems(prev => prev.filter(i => i.id !== item.id))
    if (camLastBarcode === item.barcode) setCamLastBarcode('')
    setEditingCamScanId(null)

    const newItemId = crypto.randomUUID()
    setCamScanCount(prev => prev + 1)
    setCamScannedItems(prev => [{ barcode: newBarcode, id: newItemId, status: 'saving' }, ...prev])
    setCamLastBarcode(newBarcode)

    const result = await processBarcode(newBarcode)
    if (result) {
      setCamScannedItems(prev => prev.map(i => i.id === newItemId ? { ...i, status: 'success' } : i))
    } else {
      setCamScanCount(prev => Math.max(0, prev - 1))
      setCamScannedItems(prev => prev.map(i => i.id === newItemId ? { ...i, status: 'error' } : i))
    }
  }
`.split('\n');

const idx = lines.findIndex(l => l.includes('const handleDeleteCamScan ='));
if (idx !== -1) {
  lines.splice(idx, 0, ...editFn);
  fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', lines.join('\n'));
  console.log('Inserted handleSaveCamEdit');
} else {
  console.log('Could not find handleDeleteCamScan');
}

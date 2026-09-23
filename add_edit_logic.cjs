const fs = require('fs');

let code = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// 1. Add state variables if not exists
if (!code.includes('editingCamScanId')) {
  code = code.replace(
    'const [camScannedItems, setCamScannedItems] = useState([])',
    'const [camScannedItems, setCamScannedItems] = useState([])\n  const [editingCamScanId, setEditingCamScanId] = useState(null)\n  const [editingCamScanValue, setEditingCamScanValue] = useState(\'\')'
  );
}

// 2. Add handleSaveCamEdit if not exists
if (!code.includes('const handleSaveCamEdit')) {
  const deleteFn = `  const handleDeleteCamScan = async (barcode) => {
    if (activeTab === 'simpan') {
      const { error } = await supabase.from('barcode_scans').delete().eq('barcode', barcode)
      if (error) {
        toast.error('Gagal hapus: ' + error.message)
      } else {
        toast.success(\`Dihapus: \${barcode}\`)
        fetchScans()
        setCamScanCount(prev => Math.max(0, prev - 1))
        setCamScannedItems(prev => prev.filter(i => i.barcode !== barcode))
        if (camLastBarcode === barcode) setCamLastBarcode('')
      }
    } else {
      setTempScans(prev => prev.filter(s => s.barcode !== barcode))
      setCamScanCount(prev => Math.max(0, prev - 1))
      setCamScannedItems(prev => prev.filter(i => i.barcode !== barcode))
      if (camLastBarcode === barcode) setCamLastBarcode('')
      toast.success(\`Dihapus dari sesi sementara\`)
    }
  }`;

  const editFn = `  const handleSaveCamEdit = async (item) => {
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
  }`;

  code = code.replace(deleteFn, deleteFn + '\n\n' + editFn);
}

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', code);
console.log('Added states and function');

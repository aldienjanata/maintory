const fs = require('fs');

let code = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// 1. Add state variables
code = code.replace(
  'const [camScannedItems, setCamScannedItems] = useState([])',
  'const [camScannedItems, setCamScannedItems] = useState([])\n  const [editingCamScanId, setEditingCamScanId] = useState(null)\n  const [editingCamScanValue, setEditingCamScanValue] = useState(\'\')'
);

// 2. Add handleSaveCamEdit
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

// 3. Update the UI rendering of the list
const oldUI = `                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {item.status === 'saving' && <Loader size={14} className="spinner" style={{ color: 'var(--accent)' }} />}
                      {item.status === 'success' && <Check size={14} style={{ color: '#22c55e' }} />}
                      {item.status === 'error' && <AlertTriangle size={14} style={{ color: '#f87171' }} />}
                      <div style={{ color: item.status === 'error' ? '#f87171' : '#fff', fontFamily: 'monospace', fontSize: '13px', fontWeight: 600 }}>{item.barcode}</div>
                    </div>
                    {item.status !== 'saving' && (
                      <button onClick={() => handleDeleteCamScan(item.barcode)} style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Trash2 size={15} />
                      </button>
                    )}`;

const newUI = `                    {editingCamScanId === item.id ? (
                      <div style={{ display: 'flex', width: '100%', gap: '8px', alignItems: 'center' }}>
                        <input
                          autoFocus
                          value={editingCamScanValue}
                          onChange={e => setEditingCamScanValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSaveCamEdit(item)}
                          style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--accent)', background: 'transparent', color: '#fff', fontSize: '13px', fontFamily: 'monospace', minWidth: 0 }}
                        />
                        <button onClick={() => handleSaveCamEdit(item)} style={{ background: 'var(--accent)', border: 'none', color: '#000', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', flexShrink: 0 }}><Check size={14} /></button>
                        <button onClick={() => setEditingCamScanId(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', flexShrink: 0 }}><X size={14} /></button>
                      </div>
                    ) : (
                      <>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                          {item.status === 'saving' && <Loader size={14} className="spinner" style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                          {item.status === 'success' && <Check size={14} style={{ color: '#22c55e', flexShrink: 0 }} />}
                          {item.status === 'error' && <AlertTriangle size={14} style={{ color: '#f87171', flexShrink: 0 }} />}
                          <div style={{ color: item.status === 'error' ? '#f87171' : '#fff', fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.barcode}</div>
                        </div>
                        {item.status !== 'saving' && (
                          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                            <button onClick={() => { setEditingCamScanId(item.id); setEditingCamScanValue(item.barcode); }} style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Edit2 size={15} />
                            </button>
                            <button onClick={() => handleDeleteCamScan(item.barcode)} style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </>
                    )}`;

code = code.replace(oldUI, newUI);

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', code);
console.log('Done');

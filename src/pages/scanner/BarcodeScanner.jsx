import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import toast from 'react-hot-toast'
import {
  ScanLine, Search, Trash2, Edit2, X, Download,
  CheckSquare, Calendar, RefreshCw, FileDown, Clock,
  Copy, Tag, Camera, ChevronDown, ChevronUp, AlertTriangle, Check
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import * as XLSX from 'xlsx'

const CATEGORIES = ['umum', 'ONT', 'Kabel', 'Material', 'Perangkat', 'Lain-lain']

export default function BarcodeScanner() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const [activeTab, setActiveTab] = useState('simpan')

  // ===== TAB 1 STATE =====
  const [scans, setScans] = useState([])
  const [users, setUsers] = useState({})
  const [loading, setLoading] = useState(true)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const scanInputRef = useRef(null)

  // Bulk mode: category & note apply to ALL scans
  const [bulkCategory, setBulkCategory] = useState('umum')
  const [bulkNote, setBulkNote] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [filterFirstFrom, setFilterFirstFrom] = useState('')
  const [filterFirstTo, setFilterFirstTo] = useState('')
  const [filterLastFrom, setFilterLastFrom] = useState('')
  const [filterLastTo, setFilterLastTo] = useState('')

  // Selection
  const [selected, setSelected] = useState(new Set())
  const [selectMode, setSelectMode] = useState(false)

  // Modals
  const [editItem, setEditItem] = useState(null)
  const [editForm, setEditForm] = useState({ barcode: '', note: '', category: 'umum' })
  const [showDeleteByDate, setShowDeleteByDate] = useState(false)
  const [deleteByDateFrom, setDeleteByDateFrom] = useState('')
  const [deleteByDateTo, setDeleteByDateTo] = useState('')
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportMonth, setExportMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [exportMode, setExportMode] = useState('month')

  // ===== CAMERA STATE =====
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [camLastBarcode, setCamLastBarcode] = useState('')
  const [camScanCount, setCamScanCount] = useState(0)
  const [camStatus, setCamStatus] = useState('scanning') // 'scanning' | 'detected'
  const [hasBarcodeDetector] = useState(() => 'BarcodeDetector' in window)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const scanTimerRef = useRef(null)
  const isCameraOpenRef = useRef(false)
  const lastBarcodeRef = useRef('')
  const lastBarcodeTimeRef = useRef(0)
  const detectorRef = useRef(null)

  // ===== TAB 2 STATE =====
  const [tempScans, setTempScans] = useState([])
  const [tempInput, setTempInput] = useState('')
  const tempInputRef = useRef(null)

  useEffect(() => { fetchScans(); fetchUsers() }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      if (activeTab === 'simpan') scanInputRef.current?.focus()
      else tempInputRef.current?.focus()
    }, 150)
    return () => clearTimeout(t)
  }, [activeTab])
  useEffect(() => { isCameraOpenRef.current = isCameraOpen }, [isCameraOpen])
  useEffect(() => { return () => closeCamera() }, [])

  const fetchScans = async () => {
    setLoading(true)
    const { data } = await supabase.from('barcode_scans').select('*').order('last_scan', { ascending: false })
    setScans(data || [])
    setLoading(false)
  }
  const fetchUsers = async () => {
    const { data } = await supabase.from('users').select('id, full_name')
    if (data) setUsers(Object.fromEntries(data.map(u => [u.id, u.full_name])))
  }

  // ===== PROCESS SCAN (shared by text input & camera) =====
  const processBarcode = useCallback(async (barcode) => {
    if (!barcode) return false
    
    // Check mode
    if (activeTab === 'sementara') {
      if (tempScans.find(s => s.barcode === barcode)) { 
        toast('Sudah ada dalam sesi', { icon: '⚠️' }); 
        return false;
      }
      setTempScans(prev => [...prev, { id: crypto.randomUUID(), barcode, scanned_at: new Date().toISOString() }])
      toast.success(`Terscan sementara: "${barcode}"`, { duration: 1500 });
      return true;
    }

    // Permanent Save Mode
    const { data: existing } = await supabase.from('barcode_scans').select('*').eq('barcode', barcode).maybeSingle()
    if (existing) {
      const newCount = (existing.scan_count || 1) + 1
      const { error } = await supabase.from('barcode_scans')
        .update({ last_scan: new Date().toISOString(), scan_count: newCount, updated_by: profile.id })
        .eq('id', existing.id)
      if (!error) { toast.success(`🔄 Diperbarui: "${barcode}" (${newCount}×)`, { duration: 2000 }); return true }
    } else {
      const now = new Date().toISOString()
      const { error } = await supabase.from('barcode_scans').insert({
        barcode, note: bulkNote.trim() || null, category: bulkCategory,
        scanned_by: profile.id, first_scan: now, last_scan: now, scan_count: 1,
      })
      if (!error) { toast.success(`✅ Tersimpan: "${barcode}"`, { duration: 2000 }); return true }
      if (error) { toast.error('Gagal: ' + error.message); return false }
    }
    return false
  }, [bulkNote, bulkCategory, profile, activeTab, tempScans])

  const handleScan = async (e) => {
    if (e.key !== 'Enter') return
    const barcode = barcodeInput.trim()
    if (!barcode) return
    setBarcodeInput('')
    setScanning(true)
    await processBarcode(barcode)
    if (activeTab === 'simpan') fetchScans()
    setScanning(false)
    scanInputRef.current?.focus()
  }

  // ===== CAMERA =====
  const openCamera = async () => {
    if (!hasBarcodeDetector) {
      toast.error('Browser ini tidak mendukung scan kamera. Gunakan Chrome di Android atau ketik manual.')
      return
    }
    setIsCameraOpen(true)
    setCamScanCount(0)
    setCamLastBarcode('')
    try {
      const constraints = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      startDetecting()
    } catch (err) {
      toast.error('Tidak bisa akses kamera: ' + err.message)
      setIsCameraOpen(false)
    }
  }

  const startDetecting = () => {
    if (!('BarcodeDetector' in window)) return
    if (!detectorRef.current) {
      detectorRef.current = new window.BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'aztec', 'data_matrix', 'code_93']
      })
    }
    const detect = async () => {
      if (!isCameraOpenRef.current || !videoRef.current) return
      if (videoRef.current.readyState >= 2) {
        try {
          const barcodes = await detectorRef.current.detect(videoRef.current)
          if (barcodes.length > 0) {
            const barcode = barcodes[0].rawValue
            const now = Date.now()
            if (barcode !== lastBarcodeRef.current || now - lastBarcodeTimeRef.current > 2500) {
              lastBarcodeRef.current = barcode
              lastBarcodeTimeRef.current = now
              setCamLastBarcode(barcode)
              setCamStatus('detected')
              setCamScanCount(prev => prev + 1)
              await processBarcode(barcode)
              if (activeTab === 'simpan') fetchScans()
              setTimeout(() => setCamStatus('scanning'), 1500)
            }
          }
        } catch {}
      }
      scanTimerRef.current = setTimeout(detect, 250)
    }
    detect()
  }

  const closeCamera = () => {
    isCameraOpenRef.current = false
    if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); scanTimerRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (videoRef.current) { videoRef.current.srcObject = null }
    setIsCameraOpen(false)
    setCamLastBarcode('')
    setCamStatus('scanning')
    if (activeTab === 'simpan') {
      fetchScans()
      setTimeout(() => scanInputRef.current?.focus(), 200)
    } else {
      setTimeout(() => tempInputRef.current?.focus(), 200)
    }
  }

  // ===== FILTERS =====
  const filtered = scans.filter(s => {
    if (searchTerm && !s.barcode.toLowerCase().includes(searchTerm.toLowerCase()) && !(s.note || '').toLowerCase().includes(searchTerm.toLowerCase())) return false
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false
    if (filterFirstFrom && s.first_scan < filterFirstFrom) return false
    if (filterFirstTo && s.first_scan > filterFirstTo + 'T23:59:59') return false
    if (filterLastFrom && s.last_scan < filterLastFrom) return false
    if (filterLastTo && s.last_scan > filterLastTo + 'T23:59:59') return false
    return true
  })
  const hasFilter = searchTerm || categoryFilter !== 'all' || filterFirstFrom || filterFirstTo || filterLastFrom || filterLastTo
  const resetFilters = () => { setSearchTerm(''); setCategoryFilter('all'); setFilterFirstFrom(''); setFilterFirstTo(''); setFilterLastFrom(''); setFilterLastTo('') }

  // ===== SELECTION =====
  const toggleSelect = id => { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const toggleSelectAll = () => { setSelected(selected.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(s => s.id))) }

  // ===== CRUD =====
  const handleDeleteSelected = async () => {
    if (!selected.size || !window.confirm(`Hapus ${selected.size} data? Tidak bisa dibatalkan.`)) return
    const { error } = await supabase.from('barcode_scans').delete().in('id', [...selected])
    if (!error) { toast.success(`${selected.size} data dihapus`); setSelected(new Set()); setSelectMode(false); fetchScans() }
  }
  const handleDeleteByDate = async () => {
    if (!deleteByDateFrom) { toast.error('Pilih tanggal awal'); return }
    if (!window.confirm('Hapus data dalam rentang tanggal ini?')) return
    let query = supabase.from('barcode_scans').delete().gte('first_scan', deleteByDateFrom + 'T00:00:00')
    if (deleteByDateTo) query = query.lte('first_scan', deleteByDateTo + 'T23:59:59')
    const { error } = await query
    if (!error) { toast.success('Data dihapus'); setShowDeleteByDate(false); setDeleteByDateFrom(''); setDeleteByDateTo(''); fetchScans() }
  }
  const handleDeleteSingle = async (s) => {
    if (!window.confirm(`Hapus "${s.barcode}"?`)) return
    await supabase.from('barcode_scans').delete().eq('id', s.id)
    toast.success('Dihapus'); fetchScans()
  }
  const handleEdit = item => { setEditItem(item); setEditForm({ barcode: item.barcode, note: item.note || '', category: item.category || 'umum' }) }
  const handleSaveEdit = async () => {
    if (!editForm.barcode.trim()) { toast.error('Barcode kosong'); return }
    const { error } = await supabase.from('barcode_scans').update({ barcode: editForm.barcode.trim(), note: editForm.note.trim() || null, category: editForm.category, updated_by: profile.id }).eq('id', editItem.id)
    if (!error) { toast.success('Diupdate'); setEditItem(null); fetchScans() }
  }

  // ===== EXPORT =====
  const handleExport = () => {
    let data = scans, filename = 'Export_Data_Scan_Semua.xlsx'
    if (exportMode === 'month') {
      const from = startOfMonth(parseISO(exportMonth + '-01')), to = endOfMonth(from)
      data = scans.filter(s => { const d = new Date(s.first_scan); return d >= from && d <= to })
      filename = `Export_Data_Scan_${exportMonth}.xlsx`
    }
    if (!data.length) { toast.error('Tidak ada data'); return }
    const ws = XLSX.utils.json_to_sheet(data.map((s, i) => ({
      'No': i + 1, 'Barcode / SN': s.barcode, 'Kategori': s.category || 'umum', 'Catatan': s.note || '',
      'Pertama Scan': format(new Date(s.first_scan), 'dd/MM/yyyy HH:mm', { locale: idLocale }),
      'Terakhir Scan': format(new Date(s.last_scan), 'dd/MM/yyyy HH:mm', { locale: idLocale }),
      'Jumlah Scan': s.scan_count, 'Oleh': users[s.scanned_by] || '-',
    })))
    ws['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 18 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Data Scan')
    XLSX.writeFile(wb, filename); toast.success('Export: ' + filename); setShowExportModal(false)
  }

  // ===== TAB 2 =====
  const handleTempScan = e => {
    if (e.key !== 'Enter') return
    const barcode = tempInput.trim(); if (!barcode) return
    setTempInput('')
    processBarcode(barcode)
    tempInputRef.current?.focus()
  }
  const handleCopyAll = () => { if (!tempScans.length) return; navigator.clipboard.writeText(tempScans.map(s => s.barcode).join('\n')); toast.success(`${tempScans.length} barcode disalin`) }
  const handleExportTemp = () => {
    if (!tempScans.length) return
    const ws = XLSX.utils.json_to_sheet(tempScans.map((s, i) => ({ 'No': i + 1, 'Barcode / SN': s.barcode, 'Waktu': format(new Date(s.scanned_at), 'HH:mm:ss dd/MM/yyyy') })))
    ws['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 22 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sementara')
    XLSX.writeFile(wb, `Scan_Sementara_${format(new Date(), 'ddMMyyyy_HHmm')}.xlsx`)
    toast.success('Export berhasil')
  }

  const fmtDate = iso => { try { return format(new Date(iso), 'dd MMM yyyy HH:mm', { locale: idLocale }) } catch { return '-' } }
  const todayCount = scans.filter(s => new Date(s.first_scan).toDateString() === new Date().toDateString()).length

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><ScanLine size={22} /> Scan Barcode / SN</h1>
          <p className="page-subtitle" style={{ fontSize: '13px' }}>Scan kamera atau ketik manual — kategori berlaku untuk semua (bulk mode)</p>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: '2px solid var(--border)' }}>
        {[{ key: 'simpan', label: '💾 Simpan Permanen' }, { key: 'sementara', label: '⏱ Sementara' }].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: '10px 16px', border: 'none', cursor: 'pointer', background: 'none', borderBottom: activeTab === tab.key ? '3px solid var(--accent)' : '3px solid transparent', color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: activeTab === tab.key ? 700 : 400, fontSize: '14px', marginBottom: '-2px' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* COMPACT SCAN CARD (Shared) */}
      <div className="card" style={{ marginBottom: '16px', borderColor: 'var(--accent)', borderWidth: '2px', padding: '16px' }}>
        {/* Row 1: Bulk settings */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Tag size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontWeight: 600 }}>Kategori:</span>
            <select className="form-input" value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} style={{ padding: '5px 8px', fontSize: '13px', minWidth: '110px' }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '160px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontWeight: 600 }}>Catatan:</span>
            <input type="text" className="form-input" placeholder="Opsional, untuk bulk scan..." value={bulkNote} onChange={e => setBulkNote(e.target.value)} style={{ flex: 1, padding: '5px 8px', fontSize: '13px' }} />
          </div>
        </div>

        {/* Row 2: Input + scan button */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              ref={activeTab === 'simpan' ? scanInputRef : tempInputRef}
              type="text"
              className="form-input"
              placeholder="Ketik / scan barcode, lalu Enter..."
              value={activeTab === 'simpan' ? barcodeInput : tempInput}
              onChange={e => activeTab === 'simpan' ? setBarcodeInput(e.target.value) : setTempInput(e.target.value)}
              onKeyDown={activeTab === 'simpan' ? handleScan : handleTempScan}
              disabled={scanning}
              style={{ fontFamily: 'monospace', fontSize: '15px', width: '100%', paddingRight: scanning ? '36px' : '12px' }}
              autoComplete="off"
            />
            {scanning && <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}><div className="spinner" style={{ width: '16px', height: '16px' }} /></div>}
          </div>
          <button
            onClick={openCamera}
            className="btn btn-primary"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
              background: hasBarcodeDetector ? 'var(--accent)' : 'var(--bg-primary)',
              color: hasBarcodeDetector ? '#0d1117' : 'var(--text-muted)',
              border: 'none', opacity: hasBarcodeDetector ? 1 : 0.6,
            }}
            title={hasBarcodeDetector ? 'Scan dengan kamera' : 'Browser ini tidak support BarcodeDetector'}
          >
            <Camera size={16} />
            <span className="hide-on-mobile">Scan Kamera</span>
          </button>
        </div>
        {!hasBarcodeDetector && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--warning)', display: 'flex', gap: '4px', alignItems: 'center' }}>
            <AlertTriangle size={11} /> Scan kamera membutuhkan Chrome di Android. Gunakan input teks manual.
          </div>
        )}
      </div>

      {/* ===== TAB 1 Content ===== */}
      {activeTab === 'simpan' && (
        <div>
          {/* STATS */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {[{ label: 'Total', value: scans.length, color: 'var(--accent)' }, { label: 'Hari Ini', value: todayCount, color: 'var(--success)' }, { label: 'Filter', value: filtered.length, color: 'var(--text-secondary)' }].map(s => (
              <div key={s.label} style={{ padding: '8px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: s.color }}>{s.value}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.label}</span>
              </div>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              {can(role, 'scanner.delete') && (<>
                <button className={`btn btn-sm ${selectMode ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setSelectMode(!selectMode); setSelected(new Set()) }}><CheckSquare size={13} /> {selectMode ? 'Batal' : 'Pilih'}</button>
                {selectMode && selected.size > 0 && <button className="btn btn-danger btn-sm" onClick={handleDeleteSelected}><Trash2 size={13} /> ({selected.size})</button>}
                <button className="btn btn-secondary btn-sm" onClick={() => setShowDeleteByDate(true)} title="Hapus by tanggal"><Calendar size={13} /></button>
              </>)}
              {can(role, 'scanner.export') && <button className="btn btn-secondary btn-sm" onClick={() => setShowExportModal(true)}><FileDown size={13} /> Export</button>}
              <button className="btn btn-secondary btn-sm" onClick={fetchScans}><RefreshCw size={13} /></button>
            </div>
          </div>

          {/* FILTER TOGGLE */}
          <div style={{ marginBottom: '12px' }}>
            <button onClick={() => setShowFilters(!showFilters)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: hasFilter ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '13px', padding: '0', fontWeight: hasFilter ? 600 : 400 }}>
              {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Filter {hasFilter ? `(aktif)` : ''}
              {hasFilter && <span onClick={e => { e.stopPropagation(); resetFilters() }} style={{ marginLeft: '4px', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}>Reset</span>}
            </button>
            {showFilters && (
              <div style={{ marginTop: '10px', padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="search-box" style={{ maxWidth: '200px' }}><Search size={14} className="search-icon" /><input type="text" placeholder="Cari barcode..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                <select className="filter-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                  <option value="all">Semua Kategori</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                  <Calendar size={12} style={{ color: 'var(--text-muted)' }} /><span style={{ color: 'var(--text-muted)' }}>Pertama:</span>
                  <input type="date" className="form-input" style={{ padding: '4px 6px', fontSize: '12px', width: '130px' }} value={filterFirstFrom} onChange={e => setFilterFirstFrom(e.target.value)} />–
                  <input type="date" className="form-input" style={{ padding: '4px 6px', fontSize: '12px', width: '130px' }} value={filterFirstTo} onChange={e => setFilterFirstTo(e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                  <Clock size={12} style={{ color: 'var(--text-muted)' }} /><span style={{ color: 'var(--text-muted)' }}>Terakhir:</span>
                  <input type="date" className="form-input" style={{ padding: '4px 6px', fontSize: '12px', width: '130px' }} value={filterLastFrom} onChange={e => setFilterLastFrom(e.target.value)} />–
                  <input type="date" className="form-input" style={{ padding: '4px 6px', fontSize: '12px', width: '130px' }} value={filterLastTo} onChange={e => setFilterLastTo(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* TABLE */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}><div className="spinner" style={{ margin: '0 auto 12px' }} />Memuat...</div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead><tr>
                  {selectMode && <th style={{ width: '36px' }}><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} /></th>}
                  <th style={{ width: '40px' }}>No</th><th>Barcode / SN</th><th>Kategori</th><th>Catatan</th><th>Pertama Scan</th><th>Terakhir Scan</th><th style={{ textAlign: 'center', width: '60px' }}>Scan</th><th>Oleh</th><th style={{ width: '60px' }}></th>
                </tr></thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={selectMode ? 10 : 9} style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                      <ScanLine size={36} style={{ opacity: 0.2, display: 'block', margin: '0 auto 10px' }} />
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>{hasFilter ? 'Tidak ada data sesuai filter' : 'Belum ada data scan'}</div>
                      <div style={{ fontSize: '13px' }}>{hasFilter ? 'Coba ubah filter.' : 'Scan barcode di atas untuk mulai.'}</div>
                    </td></tr>
                  ) : filtered.map((s, i) => (
                    <tr key={s.id} style={{ background: selected.has(s.id) ? 'rgba(99,179,237,0.07)' : undefined }}>
                      {selectMode && <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} style={{ cursor: 'pointer' }} /></td>}
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{i + 1}</td>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: 'var(--accent)' }}>{s.barcode}</span></td>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: 'var(--accent-dim)', color: 'var(--accent)' }}><Tag size={9} />{s.category || 'umum'}</span></td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.note || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(s.first_scan)}</td>
                      <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{s.scan_count > 1 ? <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{fmtDate(s.last_scan)}</span> : <span style={{ color: 'var(--text-muted)' }}>{fmtDate(s.last_scan)}</span>}</td>
                      <td style={{ textAlign: 'center' }}><span style={{ background: s.scan_count > 1 ? 'rgba(245,158,11,0.15)' : 'var(--bg-primary)', color: s.scan_count > 1 ? 'var(--warning)' : 'var(--text-muted)', borderRadius: '12px', padding: '2px 7px', fontSize: '11px', fontWeight: 700 }}>{s.scan_count}×</span></td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{users[s.scanned_by] || '—'}</td>
                      <td><div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end' }}>
                        {can(role, 'scanner.edit') && <button className="btn-icon" onClick={() => handleEdit(s)}><Edit2 size={13} /></button>}
                        {can(role, 'scanner.delete') && <button className="btn-icon text-danger" onClick={() => handleDeleteSingle(s)}><Trash2 size={13} /></button>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== TAB 2 Content ===== */}
      {activeTab === 'sementara' && (
        <div>
          <div style={{ padding: '10px 14px', marginBottom: '14px', borderRadius: 'var(--radius-md)', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '13px', color: 'var(--warning)' }}>
            ⚠️ <strong>Mode Sementara:</strong> Data tidak tersimpan ke database. Hilang jika halaman di-refresh.
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ padding: '8px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--warning)' }}>{tempScans.length}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Item</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleCopyAll} disabled={!tempScans.length}><Copy size={13} /> Salin</button>
              <button className="btn btn-secondary btn-sm" onClick={handleExportTemp} disabled={!tempScans.length}><FileDown size={13} /> Export</button>
              <button className="btn btn-danger btn-sm" onClick={() => { if (!tempScans.length || !window.confirm('Hapus semua sesi?')) return; setTempScans([]); toast.success('Sesi dibersihkan') }} disabled={!tempScans.length}><Trash2 size={13} /> Hapus Semua</button>
            </div>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th style={{ width: '50px' }}>No</th><th>Barcode / SN</th><th style={{ width: '190px' }}>Waktu Scan</th><th style={{ width: '45px' }}></th></tr></thead>
              <tbody>
                {tempScans.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}><ScanLine size={36} style={{ opacity: 0.2, display: 'block', margin: '0 auto 10px' }} /><div style={{ fontWeight: 600 }}>Sesi kosong</div></td></tr>
                ) : [...tempScans].reverse().map((s, i) => (
                  <tr key={s.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{tempScans.length - i}</td>
                    <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--warning)', fontSize: '13px' }}>{s.barcode}</span></td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{format(new Date(s.scanned_at), 'HH:mm:ss · dd MMM yyyy')}</td>
                    <td><button className="btn-icon text-danger" onClick={() => setTempScans(p => p.filter(t => t.id !== s.id))}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== CAMERA MODAL (FULLSCREEN) ===== */}
      {isCameraOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column' }}>
          {/* Camera Header */}
          <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}><Camera size={16} /> Scan Kamera</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '2px' }}>Arahkan kamera ke barcode / QR Code</div>
            </div>
            <button onClick={closeCamera} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '38px', height: '38px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <X size={20} />
            </button>
          </div>

          {/* Bulk settings bar */}
          <div style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.7)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            <Tag size={13} style={{ color: 'var(--accent)' }} />
            <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer' }}>
              {CATEGORIES.map(c => <option key={c} value={c} style={{ color: '#000', background: '#fff' }}>{c}</option>)}
            </select>
            <input type="text" placeholder="Catatan opsional..." value={bulkNote} onChange={e => setBulkNote(e.target.value)} style={{ flex: 1, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '13px' }} />
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{camScanCount}</span> terscan
            </div>
          </div>

          {/* Video */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
            {/* Scan frame overlay */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ position: 'relative', width: '260px', height: '160px' }}>
                <div style={{ position: 'absolute', inset: 0, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)', borderRadius: '10px' }} />
                <div style={{ position: 'absolute', inset: 0, border: `3px solid ${camStatus === 'detected' ? '#22c55e' : 'var(--accent)'}`, borderRadius: '10px', transition: 'border-color 0.3s', boxShadow: camStatus === 'detected' ? '0 0 16px rgba(34,197,94,0.6)' : '0 0 12px rgba(99,179,237,0.4)' }} />
                {/* Corner marks */}
                {[{ top: -2, left: -2 }, { top: -2, right: -2 }, { bottom: -2, left: -2 }, { bottom: -2, right: -2 }].map((pos, i) => (
                  <div key={i} style={{ position: 'absolute', width: '20px', height: '20px', borderColor: camStatus === 'detected' ? '#22c55e' : 'var(--accent)', borderStyle: 'solid', borderWidth: 0, ...(pos.top !== undefined ? { borderTopWidth: '3px' } : { borderBottomWidth: '3px' }), ...(pos.left !== undefined ? { borderLeftWidth: '3px' } : { borderRightWidth: '3px' }), ...pos, borderRadius: '2px' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Last scanned result */}
          <div style={{ padding: '12px 16px', background: camStatus === 'detected' ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.75)', borderTop: `1px solid ${camStatus === 'detected' ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`, transition: 'background 0.3s', flexShrink: 0, minHeight: '64px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {camLastBarcode ? (
              <>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: camStatus === 'detected' ? '#22c55e' : 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.3s' }}>
                  <Check size={18} style={{ color: '#000' }} />
                </div>
                <div>
                  <div style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 700, fontSize: '15px' }}>{camLastBarcode}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '2px' }}>Kategori: {bulkCategory} · Total: {camScanCount} barcode</div>
                </div>
              </>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Menunggu barcode...</div>
            )}
          </div>
        </div>
      )}

      {/* ===== MODAL EDIT ===== */}
      {editItem && (
        <div className="modal-overlay"><div className="modal">
          <div className="modal-header"><div><h3>Edit Data Scan</h3><p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Hanya superadmin</p></div><button className="btn-close" onClick={() => setEditItem(null)}><X size={18} /></button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">Barcode / SN *</label><input type="text" className="form-input" style={{ fontFamily: 'monospace', fontWeight: 600 }} value={editForm.barcode} onChange={e => setEditForm(p => ({ ...p, barcode: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Kategori</label><select className="form-input" value={editForm.category} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Catatan</label><input type="text" className="form-input" value={editForm.note} onChange={e => setEditForm(p => ({ ...p, note: e.target.value }))} /></div>
            <div style={{ padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              <div>Pertama Scan: <strong>{fmtDate(editItem.first_scan)}</strong></div>
              <div>Jumlah Scan: <strong>{editItem.scan_count}×</strong></div>
            </div>
          </div>
          <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setEditItem(null)}>Batal</button><button className="btn btn-primary" onClick={handleSaveEdit}>Simpan</button></div>
        </div></div>
      )}

      {/* ===== MODAL HAPUS BY DATE ===== */}
      {showDeleteByDate && (
        <div className="modal-overlay"><div className="modal">
          <div className="modal-header"><h3>Hapus by Tanggal</h3><button className="btn-close" onClick={() => setShowDeleteByDate(false)}><X size={18} /></button></div>
          <div className="modal-body">
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>Hapus data berdasarkan <strong>tanggal pertama scan</strong>.</p>
            <div className="form-group"><label className="form-label">Dari *</label><input type="date" className="form-input" value={deleteByDateFrom} onChange={e => setDeleteByDateFrom(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Sampai <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opsional)</span></label><input type="date" className="form-input" value={deleteByDateTo} onChange={e => setDeleteByDateTo(e.target.value)} min={deleteByDateFrom} /></div>
            <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--danger)' }}>⚠️ Tidak bisa dikembalikan!</div>
          </div>
          <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowDeleteByDate(false)}>Batal</button><button className="btn btn-danger" onClick={handleDeleteByDate}>Hapus</button></div>
        </div></div>
      )}

      {/* ===== MODAL EXPORT ===== */}
      {showExportModal && (
        <div className="modal-overlay"><div className="modal">
          <div className="modal-header"><h3>Export Data Scan</h3><button className="btn-close" onClick={() => setShowExportModal(false)}><X size={18} /></button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">Rentang Data</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}><input type="radio" name="em" value="month" checked={exportMode === 'month'} onChange={() => setExportMode('month')} /> Per Bulan</label>
                {exportMode === 'month' && <input type="month" className="form-input" value={exportMonth} onChange={e => setExportMonth(e.target.value)} style={{ marginLeft: '22px', width: '160px' }} />}
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}><input type="radio" name="em" value="all" checked={exportMode === 'all'} onChange={() => setExportMode('all')} /> Semua Data <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>({scans.length} baris)</span></label>
              </div>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-muted)' }}>
              File: <strong style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{exportMode === 'month' ? `Export_Data_Scan_${exportMonth}.xlsx` : 'Export_Data_Scan_Semua.xlsx'}</strong>
            </div>
          </div>
          <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowExportModal(false)}>Batal</button><button className="btn btn-primary" onClick={handleExport}><Download size={14} /> Download</button></div>
        </div></div>
      )}
    </div>
  )
}

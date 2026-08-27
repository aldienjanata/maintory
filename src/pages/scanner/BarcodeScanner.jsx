import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import toast from 'react-hot-toast'
import {
  ScanLine, Search, Trash2, Edit2, X, Download,
  CheckSquare, Calendar, RefreshCw, FileDown, Clock,
  Copy, Tag, Camera, ChevronDown, ChevronUp, AlertTriangle, Check, Info
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { applyHeaderStyle, applyDataRowStyles, setColumnWidths, downloadWorkbook } from '../../utils/excelHelper'

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

  // Bulk mode
  const [bulkCategory, setBulkCategory] = useState('umum')
  const [bulkNote, setBulkNote] = useState('')
  // Bulk mode for ONT
  const [bulkOntKondisi, setBulkOntKondisi] = useState('')
  const [bulkOntAsal, setBulkOntAsal] = useState('')
  const [bulkOntAsalDetail, setBulkOntAsalDetail] = useState('')
  const [bulkOntTujuan, setBulkOntTujuan] = useState('')
  const [bulkOntTujuanDetail, setBulkOntTujuanDetail] = useState('')
  
  // Create refs to avoid stale closures in camera detect loop
  const bulkStateRef = useRef({ category: 'umum', note: '', ontKondisi: '', ontAsal: '', ontAsalDetail: '', ontTujuan: '', ontTujuanDetail: '' })
  useEffect(() => {
    bulkStateRef.current = { category: bulkCategory, note: bulkNote, ontKondisi: bulkOntKondisi, ontAsal: bulkOntAsal, ontAsalDetail: bulkOntAsalDetail, ontTujuan: bulkOntTujuan, ontTujuanDetail: bulkOntTujuanDetail }
  }, [bulkCategory, bulkNote, bulkOntKondisi, bulkOntAsal, bulkOntAsalDetail, bulkOntTujuan, bulkOntTujuanDetail])

  const activeTabRef = useRef(activeTab)
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

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
  const [editForm, setEditForm] = useState({ 
    barcode: '', note: '', category: 'umum',
    ont_kondisi: '', ont_asal: '', ont_asal_detail: '', ont_tujuan: '', ont_tujuan_detail: ''
  })
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
  const [camScannedItems, setCamScannedItems] = useState([])
  const [camStatus, setCamStatus] = useState('scanning')
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
  const tempScansRef = useRef([])
  useEffect(() => { tempScansRef.current = tempScans }, [tempScans])
  
  const [tempInput, setTempInput] = useState('')
  const tempInputRef = useRef(null)
  
  // Mobile Card Expansion State
  const [expandedCards, setExpandedCards] = useState(new Set())

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

  // ===== PROCESS SCAN =====
  const processBarcode = useCallback(async (barcode) => {
    if (!barcode) return false
    const bulk = bulkStateRef.current
    const tab = activeTabRef.current
    
    // Check mode
    if (tab === 'sementara') {
      if (tempScansRef.current.find(s => s.barcode === barcode)) { 
        toast('Sudah ada dalam sesi', { icon: '⚠️' }); return false 
      }
      setTempScans(prev => [...prev, { id: crypto.randomUUID(), barcode, scanned_at: new Date().toISOString() }])
      toast.success(`Terscan sementara: "${barcode}"`, { duration: 1500 });
      return true
    }

    // Permanent Save Mode Validation
    if (bulk.category === 'ONT') {
      if (!bulk.ontKondisi) { toast.error('Kondisi ONT wajib dipilih!'); return false }
      if (!bulk.ontAsal) { toast.error('Asal Modem wajib dipilih!'); return false }
      if (bulk.ontAsal === 'Pembelian Di Luar' && !bulk.ontAsalDetail.trim()) { toast.error('Nama toko wajib diisi!'); return false }
      if (!bulk.ontTujuan) { toast.error('Status / Tujuan ONT wajib dipilih!'); return false }
      if (bulk.ontTujuan === 'Akan Di Kirim Ke Site Lain' && !bulk.ontTujuanDetail.trim()) { toast.error('Nama site wajib diisi!'); return false }
    }

    const ontFields = bulk.category === 'ONT' ? {
      ont_kondisi: bulk.ontKondisi,
      ont_asal: bulk.ontAsal,
      ont_asal_detail: bulk.ontAsalDetail.trim() || null,
      ont_tujuan: bulk.ontTujuan,
      ont_tujuan_detail: bulk.ontTujuanDetail.trim() || null
    } : {
      ont_kondisi: null, ont_asal: null, ont_asal_detail: null, ont_tujuan: null, ont_tujuan_detail: null
    }

    const { data: existing } = await supabase.from('barcode_scans').select('*').eq('barcode', barcode).maybeSingle()
    if (existing) {
      const newCount = (existing.scan_count || 1) + 1
      const { error } = await supabase.from('barcode_scans')
        .update({ 
          last_scan: new Date().toISOString(), 
          scan_count: newCount, 
          updated_by: profile.id,
          note: bulk.note.trim() || existing.note,
          category: bulk.category,
          ...ontFields
        }).eq('id', existing.id)
      if (!error) { toast.success(`🔄 Diperbarui: "${barcode}" (${newCount}×)`, { duration: 2000 }); return true }
      if (error) { toast.error('Gagal update: ' + error.message); return false }
    } else {
      const now = new Date().toISOString()
      const { error } = await supabase.from('barcode_scans').insert({
        barcode, note: bulk.note.trim() || null, category: bulk.category,
        scanned_by: profile.id, first_scan: now, last_scan: now, scan_count: 1,
        ...ontFields
      })
      if (!error) { toast.success(`✅ Tersimpan: "${barcode}"`, { duration: 2000 }); return true }
      if (error) { toast.error('Gagal simpan: ' + error.message); return false }
    }
    return false
  }, [profile])

  const handleScan = async (e) => {
    if (e.key !== 'Enter') return
    const barcode = barcodeInput.trim()
    if (!barcode) return
    setBarcodeInput('')
    setScanning(true)
    const success = await processBarcode(barcode)
    if (activeTab === 'simpan' && success) fetchScans()
    setScanning(false)
    scanInputRef.current?.focus()
  }

  // ===== CAMERA =====
  const openCamera = async () => {
    if (!hasBarcodeDetector) { toast.error('Browser ini tidak mendukung scan kamera. Gunakan Chrome di Android.'); return }
    setIsCameraOpen(true)
    setCamScanCount(0)
    setCamScannedItems([])
    setCamLastBarcode('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      streamRef.current = stream
      // Tunggu modal render agar videoRef.current tidak null
      setTimeout(async () => {
        if (videoRef.current) { 
          videoRef.current.srcObject = stream
          try { await videoRef.current.play() } catch (e) {}
          startDetecting()
        }
      }, 50)
    } catch (err) { toast.error('Gagal akses kamera: ' + err.message); setIsCameraOpen(false) }
  }

  const startDetecting = () => {
    if (!('BarcodeDetector' in window)) return
    if (!detectorRef.current) detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'aztec', 'data_matrix', 'code_93'] })
    
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
              const success = await processBarcode(barcode)
              if (success) {
                setCamScanCount(prev => prev + 1)
                setCamScannedItems(prev => [{ barcode, id: crypto.randomUUID() }, ...prev])
                if (activeTabRef.current === 'simpan') fetchScans()
              }
              setTimeout(() => setCamStatus('scanning'), 1500)
            }
          }
        } catch {}
      }
      scanTimerRef.current = setTimeout(detect, 250)
    }
    detect()
  }

  const handleDeleteCamScan = async (barcode) => {
    if (activeTab === 'simpan') {
      const { error } = await supabase.from('barcode_scans').delete().eq('barcode', barcode)
      if (error) {
        toast.error('Gagal hapus: ' + error.message)
      } else {
        toast.success(`Dihapus: ${barcode}`)
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
      toast.success(`Dihapus dari sesi sementara`)
    }
  }

  const closeCamera = () => {
    isCameraOpenRef.current = false
    if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); scanTimerRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (videoRef.current) videoRef.current.srcObject = null
    setIsCameraOpen(false)
    setCamLastBarcode('')
    setCamStatus('scanning')
    if (activeTab === 'simpan') { fetchScans(); setTimeout(() => scanInputRef.current?.focus(), 200) }
    else setTimeout(() => tempInputRef.current?.focus(), 200)
  }

  // ===== FILTERS & HELPERS =====
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
  const resetFilters = () => { setSearchTerm(''); setCategoryFilter('all'); setFilterFirstFrom(''); setFilterFirstTo(''); setFilterLastFrom(''); setFilterLastTo(''); setCurrentPage(1) }
  const toggleSelect = id => { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const toggleCard = id => { setExpandedCards(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  // ===== PAGINATION =====
  const [PAGE_SIZE, setPAGE_SIZE] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  useEffect(() => { setCurrentPage(1) }, [searchTerm, categoryFilter, filterFirstFrom, filterFirstTo, filterLastFrom, filterLastTo, PAGE_SIZE])

  const toggleSelectAll = () => {
    const allVisibleSelected = paginated.length > 0 && paginated.every(s => selected.has(s.id))
    if (allVisibleSelected) {
      setSelected(prev => {
        const n = new Set(prev)
        paginated.forEach(s => n.delete(s.id))
        return n
      })
    } else {
      setSelected(prev => {
        const n = new Set(prev)
        paginated.forEach(s => n.add(s.id))
        return n
      })
    }
  }

  // ===== CRUD =====
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null })
  const requestConfirm = (title, message, onConfirm) => setConfirmDialog({ isOpen: true, title, message, onConfirm })

  const handleDeleteSelected = () => {
    if (!selected.size) return
    requestConfirm('Konfirmasi Hapus', `Hapus ${selected.size} data? Tidak bisa dibatalkan.`, async () => {
      const { error } = await supabase.from('barcode_scans').delete().in('id', [...selected])
      if (!error) { toast.success(`${selected.size} data dihapus`); setSelected(new Set()); setSelectMode(false); fetchScans() }
    })
  }
  const handleDeleteByDate = () => {
    if (!deleteByDateFrom) { toast.error('Pilih tanggal awal'); return }
    requestConfirm('Hapus Data', 'Hapus permanen data dalam rentang tanggal ini?', async () => {
      let query = supabase.from('barcode_scans').delete().gte('first_scan', deleteByDateFrom + 'T00:00:00')
      if (deleteByDateTo) query = query.lte('first_scan', deleteByDateTo + 'T23:59:59')
      const { error } = await query
      if (!error) { toast.success('Data dihapus'); setShowDeleteByDate(false); setDeleteByDateFrom(''); setDeleteByDateTo(''); fetchScans() }
    })
  }
  const handleDeleteSingle = (s) => {
    requestConfirm('Hapus Data', `Hapus "${s.barcode}"? Tidak bisa dibatalkan.`, async () => {
      await supabase.from('barcode_scans').delete().eq('id', s.id)
      toast.success('Dihapus'); fetchScans()
    })
  }
  const handleEdit = item => { 
    setEditItem(item); 
    setEditForm({ 
      barcode: item.barcode, note: item.note || '', category: item.category || 'umum',
      ont_kondisi: item.ont_kondisi || '', ont_asal: item.ont_asal || '', ont_asal_detail: item.ont_asal_detail || '',
      ont_tujuan: item.ont_tujuan || '', ont_tujuan_detail: item.ont_tujuan_detail || ''
    }) 
  }
  const handleSaveEdit = async () => {
    if (!editForm.barcode.trim()) { toast.error('Barcode kosong'); return }
    const payload = { 
      barcode: editForm.barcode.trim(), note: editForm.note.trim() || null, category: editForm.category, updated_by: profile.id,
      ont_kondisi: editForm.category === 'ONT' ? editForm.ont_kondisi : null,
      ont_asal: editForm.category === 'ONT' ? editForm.ont_asal : null,
      ont_asal_detail: editForm.category === 'ONT' ? editForm.ont_asal_detail : null,
      ont_tujuan: editForm.category === 'ONT' ? editForm.ont_tujuan : null,
      ont_tujuan_detail: editForm.category === 'ONT' ? editForm.ont_tujuan_detail : null,
    }
    const { error } = await supabase.from('barcode_scans').update(payload).eq('id', editItem.id)
    if (!error) { toast.success('Diupdate'); setEditItem(null); fetchScans() }
  }

  // ===== EXPORT =====
  const handleExport = async () => {
    let data = scans, filename = 'Export Data Scan Semua.xlsx'
    if (exportMode === 'month') {
      const from = startOfMonth(parseISO(exportMonth + '-01')), to = endOfMonth(from)
      data = scans.filter(s => { const d = new Date(s.first_scan); return d >= from && d <= to })
      filename = `Export Data Scan ${exportMonth}.xlsx`
    }
    if (!data.length) { toast.error('Tidak ada data'); return }
    const hasOnt = data.some(s => s.category === 'ONT')
    
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Data Scan')

      const headers = ['No', 'Barcode / SN', 'Kategori', 'Catatan', 'Tanggal Pertama', 'Jam Pertama', 'Tanggal Terakhir', 'Jam Terakhir', 'Jumlah Scan', 'Oleh']
      if (hasOnt) headers.push('Kondisi ONT', 'Asal ONT', 'Tujuan ONT')

      applyHeaderStyle(ws, headers, '0284C7')
      const widths = [6, 25, 12, 30, 16, 12, 16, 12, 12, 18]
      if (hasOnt) widths.push(15, 25, 25)
      setColumnWidths(ws, widths)

      data.forEach((s, i) => {
        const firstDateObj = new Date(s.first_scan)
        const lastDateObj = new Date(s.last_scan)
        const rowData = [
          i + 1,
          s.barcode,
          s.category || 'umum',
          s.note || '',
          format(firstDateObj, 'dd/MM/yyyy'),
          format(firstDateObj, 'HH:mm'),
          format(lastDateObj, 'dd/MM/yyyy'),
          format(lastDateObj, 'HH:mm'),
          s.scan_count,
          users[s.scanned_by] || '-'
        ]
        if (hasOnt) {
          rowData.push(
            s.ont_kondisi || '',
            s.ont_asal ? `${s.ont_asal}${s.ont_asal_detail ? ` (${s.ont_asal_detail})` : ''}` : '',
            s.ont_tujuan ? `${s.ont_tujuan}${s.ont_tujuan_detail ? ` (${s.ont_tujuan_detail})` : ''}` : ''
          )
        }
        ws.addRow(rowData)
      })

      applyDataRowStyles(ws)
      await downloadWorkbook(wb, filename)
      toast.success('Export: ' + filename)
      setShowExportModal(false)
    } catch (error) {
      toast.error('Gagal export: ' + error.message)
    }
  }

  // ===== TAB 2 EXPORT =====
  const handleTempScan = async e => {
    if (e.key !== 'Enter') return
    const barcode = tempInput.trim(); if (!barcode) return
    setTempInput('')
    await processBarcode(barcode)
    tempInputRef.current?.focus()
  }
  const handleCopyAll = () => { if (!tempScans.length) return; navigator.clipboard.writeText(tempScans.map(s => s.barcode).join('\n')); toast.success(`${tempScans.length} barcode disalin`) }
  const handleExportTemp = async () => {
    if (!tempScans.length) return
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Sesi Sementara')
      const headers = ['No', 'Barcode / SN', 'Tanggal', 'Jam']
      applyHeaderStyle(ws, headers, 'EA580C') // orange header for temp
      setColumnWidths(ws, [6, 25, 16, 12])

      const arr = [...tempScans].reverse()
      arr.forEach((s, i) => {
        const d = new Date(s.scanned_at)
        ws.addRow([
          i + 1,
          s.barcode,
          format(d, 'dd/MM/yyyy'),
          format(d, 'HH:mm:ss')
        ])
      })
      
      applyDataRowStyles(ws)
      await downloadWorkbook(wb, `Scan Sementara ${format(new Date(), 'dd-MM-yyyy HHmm')}.xlsx`)
      toast.success('Export berhasil')
    } catch (error) {
      toast.error('Gagal export: ' + error.message)
    }
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

      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: '2px solid var(--border)' }}>
        {[{ key: 'simpan', label: '💾 Simpan Permanen' }, { key: 'sementara', label: '⏱ Sementara' }].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: '10px 16px', border: 'none', cursor: 'pointer', background: 'none', borderBottom: activeTab === tab.key ? '3px solid var(--accent)' : '3px solid transparent', color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: activeTab === tab.key ? 700 : 400, fontSize: '14px', marginBottom: '-2px', flex: window.innerWidth <= 768 ? 1 : 'unset' }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '16px', borderColor: 'var(--accent)', borderWidth: '2px', padding: '16px', maxWidth: '800px' }}>
        {activeTab === 'simpan' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><Tag size={12}/> Kategori:</label>
                <select className="form-input" value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} style={{ padding: '6px 10px', fontSize: '13px', width: '100%' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Catatan:</label>
                <input type="text" className="form-input" placeholder="Opsional, untuk bulk scan..." value={bulkNote} onChange={e => setBulkNote(e.target.value)} style={{ padding: '6px 10px', fontSize: '13px', width: '100%' }} />
              </div>
            </div>

            {bulkCategory === 'ONT' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '14px', padding: '12px', background: 'rgba(99,179,237,0.06)', borderRadius: '8px', border: '1px solid rgba(99,179,237,0.3)' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', display: 'block', marginBottom: '4px' }}>Kondisi <span style={{color:'var(--danger)'}}>*</span></label>
                  <select className="form-input" value={bulkOntKondisi} onChange={e => setBulkOntKondisi(e.target.value)} style={{ padding: '6px 10px', fontSize: '12px', width: '100%' }}>
                    <option value="">-- Pilih --</option><option value="Aman">Aman</option><option value="Rusak">Rusak</option><option value="Dismantle">Dismantle</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', display: 'block', marginBottom: '4px' }}>Asal Modem <span style={{color:'var(--danger)'}}>*</span></label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <select className="form-input" value={bulkOntAsal} onChange={e => { setBulkOntAsal(e.target.value); if (e.target.value !== 'Pembelian Di Luar') setBulkOntAsalDetail('') }} style={{ padding: '6px 10px', fontSize: '12px', width: '100%' }}>
                      <option value="">-- Pilih --</option><option value="Kiriman Dari Bekasi">Kiriman Dari Bekasi</option><option value="Pembelian Di Luar">Pembelian Di Luar</option><option value="Dismantle">Dismantle</option><option value="Stok Lama">Stok Lama</option>
                    </select>
                    {bulkOntAsal === 'Pembelian Di Luar' && <input type="text" className="form-input" placeholder="Nama Toko..." value={bulkOntAsalDetail} onChange={e => setBulkOntAsalDetail(e.target.value)} style={{ padding: '6px 10px', fontSize: '12px', width: '100%' }} />}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', display: 'block', marginBottom: '4px' }}>Status / Tujuan <span style={{color:'var(--danger)'}}>*</span></label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <select className="form-input" value={bulkOntTujuan} onChange={e => { setBulkOntTujuan(e.target.value); if (e.target.value !== 'Akan Di Kirim Ke Site Lain') setBulkOntTujuanDetail('') }} style={{ padding: '6px 10px', fontSize: '12px', width: '100%' }}>
                      <option value="">-- Pilih --</option><option value="Ada Di Gudang">Ada Di Gudang</option><option value="Akan Di Retur Ke Pusat">Akan Di Retur Ke Pusat</option><option value="Akan Dipakai Lagi">Akan Dipakai Lagi</option><option value="Akan Di Kirim Ke Site Lain">Akan Di Kirim Ke Site Lain</option>
                    </select>
                    {bulkOntTujuan === 'Akan Di Kirim Ke Site Lain' && <input type="text" className="form-input" placeholder="Nama Site..." value={bulkOntTujuanDetail} onChange={e => setBulkOntTujuanDetail(e.target.value)} style={{ padding: '6px 10px', fontSize: '12px', width: '100%' }} />}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: '8px', flexDirection: window.innerWidth <= 480 ? 'column' : 'row' }}>
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
          <button onClick={openCamera} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexShrink: 0, background: hasBarcodeDetector ? 'var(--accent)' : 'var(--bg-primary)', color: hasBarcodeDetector ? '#0d1117' : 'var(--text-muted)', border: 'none', opacity: hasBarcodeDetector ? 1 : 0.6, padding: '10px 16px', height: '42px' }} title={hasBarcodeDetector ? 'Scan dengan kamera' : 'Browser ini tidak support BarcodeDetector'}>
            <Camera size={18} />
            <span>Scan Kamera</span>
          </button>
        </div>
        {!hasBarcodeDetector && <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--warning)', display: 'flex', gap: '4px', alignItems: 'center' }}><AlertTriangle size={11} /> Scan kamera membutuhkan Chrome di Android. Gunakan input teks manual.</div>}
      </div>

      {activeTab === 'simpan' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {[{ label: 'Total', value: scans.length, color: 'var(--accent)' }, { label: 'Hari Ini', value: todayCount, color: 'var(--success)' }, { label: 'Filter', value: filtered.length, color: 'var(--text-secondary)' }].map(s => (
              <div key={s.label} style={{ padding: '8px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '8px', alignItems: 'center', flex: window.innerWidth <= 480 ? 1 : 'unset', justifyContent: 'center' }}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: s.color }}>{s.value}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.label}</span>
              </div>
            ))}
            <div style={{ marginLeft: window.innerWidth <= 480 ? 0 : 'auto', width: window.innerWidth <= 480 ? '100%' : 'auto', display: 'flex', gap: '6px', alignItems: 'center', justifyContent: window.innerWidth <= 480 ? 'space-between' : 'flex-end', flexWrap: 'wrap', marginTop: window.innerWidth <= 480 ? '8px' : 0 }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {can(role, 'scanner.delete') && (<>
                  <button className={`btn btn-sm ${selectMode ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setSelectMode(!selectMode); setSelected(new Set()) }}><CheckSquare size={13} /> <span className="hide-on-mobile">{selectMode ? 'Batal' : 'Pilih'}</span></button>
                  {selectMode && selected.size > 0 && <button className="btn btn-danger btn-sm" onClick={handleDeleteSelected}><Trash2 size={13} /> ({selected.size})</button>}
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowDeleteByDate(true)} title="Hapus by tanggal"><Calendar size={13} /></button>
                </>)}
                {can(role, 'scanner.export') && <button className="btn btn-secondary btn-sm" onClick={() => setShowExportModal(true)}><FileDown size={13} /> <span className="hide-on-mobile">Export</span></button>}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={fetchScans}><RefreshCw size={13} /></button>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <button onClick={() => setShowFilters(!showFilters)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: hasFilter ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '13px', padding: '0', fontWeight: hasFilter ? 600 : 400 }}>
              {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Filter {hasFilter ? `(aktif)` : ''}
              {hasFilter && <span onClick={e => { e.stopPropagation(); resetFilters() }} style={{ marginLeft: '4px', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}>Reset</span>}
            </button>
            {showFilters && (
              <div style={{ marginTop: '10px', padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'end' }}>
                <div><label style={{fontSize:'11px', color:'var(--text-muted)', display:'block', marginBottom:'4px'}}>Cari</label><div className="search-box" style={{ width: '100%' }}><Search size={14} className="search-icon" /><input type="text" placeholder="Barcode..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div></div>
                <div><label style={{fontSize:'11px', color:'var(--text-muted)', display:'block', marginBottom:'4px'}}>Kategori</label><select className="form-input" style={{width:'100%', padding:'6px 10px', fontSize:'13px'}} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="all">Semua</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label style={{fontSize:'11px', color:'var(--text-muted)', display:'block', marginBottom:'4px'}}>Tgl Pertama (Dari)</label><input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: '13px', width: '100%' }} value={filterFirstFrom} onChange={e => setFilterFirstFrom(e.target.value)} /></div>
                <div><label style={{fontSize:'11px', color:'var(--text-muted)', display:'block', marginBottom:'4px'}}>Tgl Pertama (Sampai)</label><input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: '13px', width: '100%' }} value={filterFirstTo} onChange={e => setFilterFirstTo(e.target.value)} /></div>
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}><div className="spinner" style={{ margin: '0 auto 12px' }} />Memuat...</div>
          ) : (
            <>
              {/* MOBILE CARD VIEW */}
              <div className="mobile-only mobile-card-list">
                {filtered.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    <ScanLine size={36} style={{ opacity: 0.2, display: 'block', margin: '0 auto 10px' }} />
                    <div style={{ fontWeight: 600 }}>Belum ada data scan</div>
                  </div>
                ) : paginated.map((s, i) => {
                  const isExpanded = expandedCards.has(s.id)
                  const globalIndex = (safePage - 1) * PAGE_SIZE + i + 1
                  return (
                    <div key={s.id} className="mobile-card" style={{ borderLeft: selectMode && selected.has(s.id) ? '4px solid var(--accent)' : undefined }}>
                      <div className="mobile-card-header" onClick={() => selectMode ? toggleSelect(s.id) : toggleCard(s.id)}>
                        <div style={{ flex: 1, paddingRight: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            {selectMode && <input type="checkbox" checked={selected.has(s.id)} onChange={() => {}} style={{ pointerEvents: 'none' }} />}
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>#{globalIndex}</span>
                            <span className="mobile-card-title" style={{ fontFamily: 'monospace', fontSize: '14px', color: 'var(--accent)' }}>{s.barcode}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: '10px', fontWeight: 600 }}>{s.category || 'umum'}</span>
                            <span style={{ fontSize: '10px', padding: '2px 6px', background: s.scan_count > 1 ? 'rgba(245,158,11,0.15)' : 'var(--bg-primary)', color: s.scan_count > 1 ? 'var(--warning)' : 'var(--text-muted)', borderRadius: '10px', fontWeight: 600 }}>{s.scan_count}×</span>
                          </div>
                        </div>
                        <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span style={{ fontSize: '11px' }}>{format(new Date(s.first_scan), 'dd MMM', { locale: idLocale })}</span>
                          {!selectMode && (isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                        </div>
                      </div>
                      
                      {isExpanded && !selectMode && (
                        <div className="mobile-card-body">
                          {s.category === 'ONT' && (s.ont_kondisi || s.ont_asal || s.ont_tujuan) && (
                            <div style={{ padding: '8px', background: 'rgba(99,179,237,0.06)', borderRadius: '6px', border: '1px solid rgba(99,179,237,0.2)', marginBottom: '4px' }}>
                              {s.ont_kondisi && <div className="mobile-info-row" style={{marginBottom:'4px'}}><span className="mobile-info-label">Kondisi</span><span className="mobile-info-value" style={{color: s.ont_kondisi==='Aman'?'var(--success)':'var(--danger)'}}>{s.ont_kondisi}</span></div>}
                              {s.ont_asal && <div className="mobile-info-row" style={{marginBottom:'4px'}}><span className="mobile-info-label">Asal</span><span className="mobile-info-value">{s.ont_asal} {s.ont_asal_detail ? `(${s.ont_asal_detail})` : ''}</span></div>}
                              {s.ont_tujuan && <div className="mobile-info-row"><span className="mobile-info-label">Tujuan</span><span className="mobile-info-value">{s.ont_tujuan} {s.ont_tujuan_detail ? `(${s.ont_tujuan_detail})` : ''}</span></div>}
                            </div>
                          )}
                          <div className="mobile-info-row"><span className="mobile-info-label">Catatan</span><span className="mobile-info-value">{s.note || '-'}</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">Pertama Scan</span><span className="mobile-info-value">{fmtDate(s.first_scan)}</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">Terakhir Scan</span><span className="mobile-info-value">{fmtDate(s.last_scan)}</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">Oleh</span><span className="mobile-info-value">{users[s.scanned_by] || '-'}</span></div>
                          
                          <div className="mobile-card-actions">
                            {can(role, 'scanner.edit') && <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); handleEdit(s) }}><Edit2 size={13}/> Edit</button>}
                            {can(role, 'scanner.delete') && <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); handleDeleteSingle(s) }}><Trash2 size={13}/> Hapus</button>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* DESKTOP TABLE VIEW */}
              <div className="table-container desktop-only">
                <table className="data-table">
                  <thead><tr>
                    {selectMode && <th style={{ width: '36px' }}><input type="checkbox" checked={paginated.length > 0 && paginated.every(s => selected.has(s.id))} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} /></th>}
                    <th style={{ width: '40px' }}>No</th><th>Barcode / SN</th><th>Kategori</th><th>Catatan</th><th>Pertama Scan</th><th>Terakhir Scan</th><th style={{ textAlign: 'center', width: '60px' }}>Scan</th><th>Oleh</th><th style={{ width: '60px' }}></th>
                  </tr></thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={selectMode ? 10 : 9} style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                        <ScanLine size={36} style={{ opacity: 0.2, display: 'block', margin: '0 auto 10px' }} />
                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>{hasFilter ? 'Tidak ada data sesuai filter' : 'Belum ada data scan'}</div>
                      </td></tr>
                    ) : paginated.map((s, i) => (
                      <tr key={s.id} style={{ background: selected.has(s.id) ? 'rgba(99,179,237,0.07)' : undefined }}>
                        {selectMode && <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} style={{ cursor: 'pointer' }} /></td>}
                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(safePage - 1) * PAGE_SIZE + i + 1}</td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: 'var(--accent)' }}>{s.barcode}</span>
                          {s.category === 'ONT' && (s.ont_kondisi || s.ont_asal || s.ont_tujuan) && (
                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                              {s.ont_kondisi && <span style={{ fontSize: '10px', padding: '2px 6px', background: s.ont_kondisi === 'Aman' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: s.ont_kondisi === 'Aman' ? 'var(--success)' : 'var(--danger)', borderRadius: '4px' }}>{s.ont_kondisi}</span>}
                              {s.ont_asal && <span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', borderRadius: '4px' }}>Asal: {s.ont_asal} {s.ont_asal_detail ? `(${s.ont_asal_detail})` : ''}</span>}
                              {s.ont_tujuan && <span style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', borderRadius: '4px' }}>Ke: {s.ont_tujuan} {s.ont_tujuan_detail ? `(${s.ont_tujuan_detail})` : ''}</span>}
                            </div>
                          )}
                        </td>
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

              {/* PAGINATION */}
              {(totalPages > 1 || filtered.length > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Tampilkan:</span>
                    <select 
                      value={PAGE_SIZE} 
                      onChange={e => setPAGE_SIZE(Number(e.target.value))} 
                      className="form-input" 
                      style={{ padding: '4px 8px', fontSize: '12px', width: 'auto' }}
                    >
                      {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  
                  {totalPages > 1 && <>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={safePage === 1}
                    style={{ padding: '6px 10px' }}
                  >«</button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    style={{ padding: '6px 10px' }}
                  >‹ Prev</button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                    .reduce((acc, p, idx, arr) => {
                      if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...')
                      acc.push(p)
                      return acc
                    }, [])
                    .map((p, i) => p === '...' ? (
                      <span key={`ellipsis-${i}`} style={{ color: 'var(--text-muted)', padding: '0 4px' }}>…</span>
                    ) : (
                      <button
                        key={p}
                        className={`btn btn-sm ${safePage === p ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setCurrentPage(p)}
                        style={{ minWidth: '36px', padding: '6px 10px', fontWeight: safePage === p ? 700 : 400 }}
                      >{p}</button>
                    ))
                  }

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    style={{ padding: '6px 10px' }}
                  >Next ›</button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safePage === totalPages}
                    style={{ padding: '6px 10px' }}
                  >»</button>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Hal {safePage}/{totalPages} • {filtered.length} data
                  </span>
                  </>}
                </div>
              )}
            </>
          )}
        </div>
      )}


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
              <button className="btn btn-secondary btn-sm" onClick={handleCopyAll} disabled={!tempScans.length}><Copy size={13} /> <span className="hide-on-mobile">Salin</span></button>
              <button className="btn btn-secondary btn-sm" onClick={handleExportTemp} disabled={!tempScans.length}><FileDown size={13} /> <span className="hide-on-mobile">Export</span></button>
              <button className="btn btn-danger btn-sm" onClick={() => { if (!tempScans.length) return; requestConfirm('Bersihkan Sesi', 'Hapus semua data pindaian sementara?', () => { setTempScans([]); toast.success('Sesi dibersihkan') }) }} disabled={!tempScans.length}><Trash2 size={13} /> <span className="hide-on-mobile">Hapus Semua</span></button>
            </div>
          </div>
          
          <div className="mobile-only mobile-card-list">
            {tempScans.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}><ScanLine size={36} style={{ opacity: 0.2, display: 'block', margin: '0 auto 10px' }} /><div style={{ fontWeight: 600 }}>Sesi kosong</div></div>
            ) : [...tempScans].reverse().map((s, i) => (
              <div key={s.id} className="mobile-card" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--warning)', fontSize: '14px', marginBottom: '4px' }}>{s.barcode}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{format(new Date(s.scanned_at), 'HH:mm:ss · dd MMM yyyy')}</div>
                </div>
                <button className="btn-icon text-danger" onClick={() => setTempScans(p => p.filter(t => t.id !== s.id))}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>

          <div className="table-container desktop-only">
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

      {/* CAMERA MODAL */}
      {isCameraOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}><Camera size={16} /> Scan Kamera</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '2px' }}>Arahkan kamera ke barcode</div>
            </div>
            <button onClick={closeCamera} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '38px', height: '38px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><X size={20} /></button>
          </div>

          <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
            {activeTab === 'simpan' ? (
              <>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Tag size={13} style={{ color: 'var(--accent)' }} />
                  <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer', minWidth: '80px' }}>
                    {CATEGORIES.map(c => <option key={c} value={c} style={{ color: '#000', background: '#fff' }}>{c}</option>)}
                  </select>
                  <input type="text" placeholder="Catatan opsi..." value={bulkNote} onChange={e => setBulkNote(e.target.value)} style={{ flex: 1, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', minWidth: 0 }} />
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}><span style={{ color: 'var(--accent)', fontWeight: 700 }}>{camScanCount}</span> scan</div>
                </div>
                
                {bulkCategory === 'ONT' && (
                  <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
                    <select value={bulkOntKondisi} onChange={e => setBulkOntKondisi(e.target.value)} style={{ background: bulkOntKondisi ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.3)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', flexShrink: 0 }}>
                      <option value="" style={{color:'#000'}}>Kondisi...</option><option value="Aman" style={{color:'#000'}}>Aman</option><option value="Rusak" style={{color:'#000'}}>Rusak</option><option value="Dismantle" style={{color:'#000'}}>Dismantle</option>
                    </select>
                    <select value={bulkOntAsal} onChange={e => { setBulkOntAsal(e.target.value); if (e.target.value !== 'Pembelian Di Luar') setBulkOntAsalDetail('') }} style={{ background: bulkOntAsal ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.3)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', flexShrink: 0 }}>
                      <option value="" style={{color:'#000'}}>Asal...</option><option value="Kiriman Dari Bekasi" style={{color:'#000'}}>Dari Bekasi</option><option value="Pembelian Di Luar" style={{color:'#000'}}>Beli Di Luar</option><option value="Dismantle" style={{color:'#000'}}>Dismantle</option><option value="Stok Lama" style={{color:'#000'}}>Stok Lama</option>
                    </select>
                    {bulkOntAsal === 'Pembelian Di Luar' && <input type="text" placeholder="Toko..." value={bulkOntAsalDetail} onChange={e => setBulkOntAsalDetail(e.target.value)} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', width: '90px', flexShrink: 0 }} />}
                    <select value={bulkOntTujuan} onChange={e => { setBulkOntTujuan(e.target.value); if (e.target.value !== 'Akan Di Kirim Ke Site Lain') setBulkOntTujuanDetail('') }} style={{ background: bulkOntTujuan ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.3)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', flexShrink: 0 }}>
                      <option value="" style={{color:'#000'}}>Tujuan...</option><option value="Ada Di Gudang" style={{color:'#000'}}>Gudang</option><option value="Akan Di Retur Ke Pusat" style={{color:'#000'}}>Retur</option><option value="Akan Dipakai Lagi" style={{color:'#000'}}>Dipakai</option><option value="Akan Di Kirim Ke Site Lain" style={{color:'#000'}}>Ke Site Lain</option>
                    </select>
                    {bulkOntTujuan === 'Akan Di Kirim Ke Site Lain' && <input type="text" placeholder="Site..." value={bulkOntTujuanDetail} onChange={e => setBulkOntTujuanDetail(e.target.value)} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', width: '90px', flexShrink: 0 }} />}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: 'var(--warning)', fontSize: '12px', textAlign: 'center' }}>Sesi Sementara: <strong style={{color:'#fff'}}>{camScanCount}</strong> barcode terscan</div>
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ width: '100%', maxWidth: '420px', aspectRatio: '3/4', maxHeight: '60vh', position: 'relative', overflow: 'hidden', borderRadius: '16px', background: '#111', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
              <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} autoPlay playsInline muted />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ position: 'relative', width: '85%', height: '35%' }}>
                  <div style={{ position: 'absolute', inset: 0, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)', borderRadius: '10px' }} />
                  <div style={{ position: 'absolute', inset: 0, border: `3px solid ${camStatus === 'detected' ? '#22c55e' : 'var(--accent)'}`, borderRadius: '10px', transition: 'border-color 0.3s', boxShadow: camStatus === 'detected' ? '0 0 16px rgba(34,197,94,0.6)' : '0 0 12px rgba(99,179,237,0.4)' }} />
                  {[{ top: -2, left: -2 }, { top: -2, right: -2 }, { bottom: -2, left: -2 }, { bottom: -2, right: -2 }].map((pos, i) => (
                    <div key={i} style={{ position: 'absolute', width: '20px', height: '20px', borderColor: camStatus === 'detected' ? '#22c55e' : 'var(--accent)', borderStyle: 'solid', borderWidth: 0, ...(pos.top !== undefined ? { borderTopWidth: '3px' } : { borderBottomWidth: '3px' }), ...(pos.left !== undefined ? { borderLeftWidth: '3px' } : { borderRightWidth: '3px' }), ...pos, borderRadius: '4px' }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ flexShrink: 0, background: 'rgba(0,0,0,0.85)', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', maxHeight: '45vh' }}>
            <div style={{ padding: '12px 16px', background: camStatus === 'detected' ? 'rgba(34,197,94,0.15)' : 'transparent', transition: 'background 0.3s', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              {camLastBarcode ? (
                <>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: camStatus === 'detected' ? '#22c55e' : 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.3s' }}><Check size={18} style={{ color: '#000' }} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 700, fontSize: '15px' }}>{camLastBarcode}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '2px' }}>Total sesi ini: {camScanCount} barcode</div>
                  </div>
                </>
              ) : <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', padding: '8px 0' }}>Menunggu barcode...</div>}
            </div>

            {camScannedItems.length > 0 && (
              <div style={{ flex: 1, minHeight: 0, borderTop: '1px solid rgba(255,255,255,0.1)', overflowY: 'auto', padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', flexShrink: 0 }}>Riwayat Scan (Sesi Ini)</div>
                {camScannedItems.map((item) => (
                  <div key={item.id} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px' }}>
                    <div style={{ color: '#fff', fontFamily: 'monospace', fontSize: '13px', fontWeight: 600 }}>{item.barcode}</div>
                    <button onClick={() => handleDeleteCamScan(item.barcode)} style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>, document.body)}

      {/* MODAL EDIT */}
      {editItem && (
        <div className="modal-overlay"><div className="modal" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
          <div className="modal-header"><div><h3>Edit Data Scan</h3><p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Hanya superadmin</p></div><button className="btn-close" onClick={() => setEditItem(null)}><X size={18} /></button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">Barcode / SN *</label><input type="text" className="form-input" style={{ fontFamily: 'monospace', fontWeight: 600 }} value={editForm.barcode} onChange={e => setEditForm(p => ({ ...p, barcode: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Kategori</label><select className="form-input" value={editForm.category} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Catatan</label><input type="text" className="form-input" value={editForm.note} onChange={e => setEditForm(p => ({ ...p, note: e.target.value }))} /></div>
            
            {editForm.category === 'ONT' && (
              <div style={{ padding: '12px', background: 'rgba(99,179,237,0.06)', borderRadius: '8px', border: '1px solid rgba(99,179,237,0.3)', marginBottom: '16px' }}>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', display: 'block', marginBottom: '4px' }}>Kondisi</label>
                  <select className="form-input" value={editForm.ont_kondisi} onChange={e => setEditForm(p => ({ ...p, ont_kondisi: e.target.value }))} style={{ padding: '6px 10px', fontSize: '12px' }}>
                    <option value="">-- Pilih --</option><option value="Aman">Aman</option><option value="Rusak">Rusak</option><option value="Dismantle">Dismantle</option>
                  </select>
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', display: 'block', marginBottom: '4px' }}>Asal Modem</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <select className="form-input" value={editForm.ont_asal} onChange={e => setEditForm(p => ({ ...p, ont_asal: e.target.value }))} style={{ padding: '6px 10px', fontSize: '12px', flex: 1, minWidth: '130px' }}>
                      <option value="">-- Pilih --</option><option value="Kiriman Dari Bekasi">Kiriman Dari Bekasi</option><option value="Pembelian Di Luar">Pembelian Di Luar</option><option value="Dismantle">Dismantle</option><option value="Stok Lama">Stok Lama</option>
                    </select>
                    {editForm.ont_asal === 'Pembelian Di Luar' && <input type="text" className="form-input" placeholder="Nama Toko" value={editForm.ont_asal_detail} onChange={e => setEditForm(p => ({ ...p, ont_asal_detail: e.target.value }))} style={{ padding: '6px 10px', fontSize: '12px', flex: 1, minWidth: '130px' }} />}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', display: 'block', marginBottom: '4px' }}>Status / Tujuan</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <select className="form-input" value={editForm.ont_tujuan} onChange={e => setEditForm(p => ({ ...p, ont_tujuan: e.target.value }))} style={{ padding: '6px 10px', fontSize: '12px', flex: 1, minWidth: '130px' }}>
                      <option value="">-- Pilih --</option><option value="Ada Di Gudang">Ada Di Gudang</option><option value="Akan Di Retur Ke Pusat">Akan Di Retur Ke Pusat</option><option value="Akan Dipakai Lagi">Akan Dipakai Lagi</option><option value="Akan Di Kirim Ke Site Lain">Akan Di Kirim Ke Site Lain</option>
                    </select>
                    {editForm.ont_tujuan === 'Akan Di Kirim Ke Site Lain' && <input type="text" className="form-input" placeholder="Nama Site" value={editForm.ont_tujuan_detail} onChange={e => setEditForm(p => ({ ...p, ont_tujuan_detail: e.target.value }))} style={{ padding: '6px 10px', fontSize: '12px', flex: 1, minWidth: '130px' }} />}
                  </div>
                </div>
              </div>
            )}

            <div style={{ padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              <div>Pertama Scan: <strong>{fmtDate(editItem.first_scan)}</strong></div>
              <div>Jumlah Scan: <strong>{editItem.scan_count}×</strong></div>
            </div>
          </div>
          <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setEditItem(null)}>Batal</button><button className="btn btn-primary" onClick={handleSaveEdit}>Simpan</button></div>
        </div></div>
      )}

      {/* MODAL HAPUS BY DATE */}
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

      {/* MODAL EXPORT */}
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
              File: <strong style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{exportMode === 'month' ? `Export Data Scan ${exportMonth}.xlsx` : 'Export Data Scan Semua.xlsx'}</strong>
            </div>
          </div>
          <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowExportModal(false)}>Batal</button><button className="btn btn-primary" onClick={handleExport}><Download size={14} /> Download</button></div>
        </div></div>
      )}

      {/* CONFIRMATION DIALOG */}
      {confirmDialog.isOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '340px' }}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={18} /> {confirmDialog.title}</h3>
            </div>
            <div className="modal-body" style={{ padding: '20px 16px', fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)' }}>
              {confirmDialog.message}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null })}>Batal</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => { if (confirmDialog.onConfirm) confirmDialog.onConfirm(); setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null }) }}>Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

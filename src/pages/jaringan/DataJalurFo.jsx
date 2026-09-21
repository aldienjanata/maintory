import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import Pagination from '../../components/common/Pagination'
import { Plus, X, Edit2, Trash2, MapPin, Search, Download, ChevronDown, ChevronUp, ExternalLink, Upload, FileSpreadsheet, CheckSquare, Square, Eraser, Cable } from 'lucide-react'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import * as XLSX from 'xlsx'

const SITES = [
  { value: 'banyumas', label: 'Site Banyumas' },
  { value: 'cilacap', label: 'Site Cilacap' },
  { value: 'cilacap_herman', label: 'Site Cilacap-Herman' },
  { value: 'rowokele', label: 'Site Rowokele' },
  { value: 'kebumen', label: 'Site Kebumen' },
]
const SITE_CODE = { banyumas: 'BMS', cilacap: 'CLP', cilacap_herman: 'CLH', rowokele: 'RWK', kebumen: 'KBM' }

const TIPE_KABEL = [
  { value: 'ADSS', label: 'ADSS' },
  { value: 'FTTH', label: 'FTTH' },
  { value: 'OPGW', label: 'OPGW' },
  { value: 'UTP', label: 'UTP' },
  { value: 'Lainnya', label: 'Lainnya' },
]

const EMPTY_FORM = {
  site: 'banyumas',
  nama_jalur: '',
  titik_awal: '',
  titik_akhir: '',
  panjang_meter: '',
  tipe_kabel: 'ADSS',
  maps_url_awal: '',
  maps_url_akhir: '',
  provinsi: 'Jawa Tengah',
  kabupaten: 'Banyumas',
  kecamatan: '',
  desa: '',
  keterangan: '',
  jalur_id_manual: ''
}

function generateItemId(site, desa, existingItems) {
  if (!desa) return ''
  const siteCode = SITE_CODE[site] || 'BMS'
  const desaSlug = desa.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').substring(0, 15)
  
  const sameItems = existingItems.filter(
    p => p.site === site && p.desa?.toUpperCase().trim() === desa.toUpperCase().trim()
  )
  
  let maxNo = 0
  for (const p of sameItems) {
    if (p.jalur_id) {
        const match = p.jalur_id.match(/\/(\d+)$/)
        if (match) maxNo = Math.max(maxNo, parseInt(match[1]))
    }
  }
  
  return `NAT/${siteCode}/JALUR/${desaSlug}/${String(maxNo + 1).padStart(3, '0')}`
}

function parseMapsUrl(url) {
  if (!url) return { lat: '', lon: '' }
  const m = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
  if (m) return { lat: m[1], lon: m[2] }
  const m2 = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/)
  if (m2) return { lat: m2[1], lon: m2[2] }
  return { lat: '', lon: '' }
}

export default function DataJalurFo() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const importRef = useRef(null)

  const [items, setItems] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSite, setFilterSite] = useState('')
  const [filterKecamatan, setFilterKecamatan] = useState('')
  const [filterDesa, setFilterDesa] = useState('')

  // Sorting
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(null)
  
  const [excelMenuOpen, setExcelMenuOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importRows, setImportRows] = useState([])

  // Bulk Delete
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkDeleteModal, setBulkDeleteModal] = useState(null)
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('')
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false)

  // Pagination
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      let allItems = []
      let from = 0
      const step = 1000
      
      while (true) {
        const { data, error } = await supabase
          .from('network_jalur_fo')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + step - 1)
          
        if (error) throw error
        if (data && data.length > 0) {
          allItems = [...allItems, ...data]
          if (data.length < step) break
          from += step
        } else {
          break
        }
      }

      const { data: usersData } = await supabase.from('users').select('id, full_name')
      
      setItems(allItems)
      if (usersData) setUsers(usersData)
    } catch { toast.error('Gagal memuat data') }
    finally { setLoading(false) }
  }

  const getUserName = (uid) => users.find(u => u.id === uid)?.full_name || '-'

  const kecamatanList = useMemo(() => [...new Set(items.map(p => p.kecamatan).filter(Boolean))].sort(), [items])
  const desaList = useMemo(() => {
    let list = items
    if (filterKecamatan) list = list.filter(p => p.kecamatan === filterKecamatan)
    return [...new Set(list.map(p => p.desa).filter(Boolean))].sort()
  }, [items, filterKecamatan])

  const filtered = useMemo(() => {
    let data = [...items]
    if (filterSite) data = data.filter(p => p.site === filterSite)
    if (filterKecamatan) data = data.filter(p => p.kecamatan === filterKecamatan)
    if (filterDesa) data = data.filter(p => p.desa === filterDesa)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      data = data.filter(p => 
        p.jalur_id?.toLowerCase().includes(q) || 
        p.nama_jalur?.toLowerCase().includes(q) || 
        p.desa?.toLowerCase().includes(q) || 
        p.kecamatan?.toLowerCase().includes(q)
      )
    }
    data.sort((a, b) => {
      let va = a[sortKey] ?? '', vb = b[sortKey] ?? ''
      if (va === vb) return 0
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
    })
    return data
  }, [items, filterSite, filterKecamatan, filterDesa, searchQuery, sortKey, sortDir])

  const paginated = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page, perPage])
  const totalPages = Math.ceil(filtered.length / perPage)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const SortIcon = ({ col }) => sortKey !== col ? <ChevronDown size={11} style={{ opacity: 0.3 }} /> : sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setIsModalOpen(true) }
  const openEdit = (item) => {
    setEditingId(item.id)
    setForm({
      site: item.site || 'banyumas',
      nama_jalur: item.nama_jalur || '',
      titik_awal: item.titik_awal || '',
      titik_akhir: item.titik_akhir || '',
      panjang_meter: item.panjang_meter || '',
      tipe_kabel: item.tipe_kabel || 'ADSS',
      maps_url_awal: item.maps_url_awal || '',
      maps_url_akhir: item.maps_url_akhir || '',
      provinsi: item.provinsi || 'Jawa Tengah',
      kabupaten: item.kabupaten || 'Banyumas',
      kecamatan: item.kecamatan || '',
      desa: item.desa || '',
      keterangan: item.keterangan || '',
      jalur_id_manual: ''
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.nama_jalur.trim()) return toast.error('Nama Jalur wajib diisi!')
    if (!form.kecamatan.trim()) return toast.error('Kecamatan wajib diisi!')
    if (!form.desa.trim()) return toast.error('Desa wajib diisi!')

    setSaving(true)
    try {
      const payload = {
        site: form.site,
        nama_jalur: form.nama_jalur,
        titik_awal: form.titik_awal,
        titik_akhir: form.titik_akhir,
        panjang_meter: form.panjang_meter ? parseInt(form.panjang_meter) : null,
        tipe_kabel: form.tipe_kabel,
        maps_url_awal: form.maps_url_awal,
        maps_url_akhir: form.maps_url_akhir,
        provinsi: form.provinsi,
        kabupaten: form.kabupaten,
        kecamatan: form.kecamatan,
        desa: form.desa,
        keterangan: form.keterangan,
        updated_by: profile.id
      }

      if (editingId) {
        const existingItem = items.find(d => d.id === editingId)
        if (existingItem) {
          const siteChanged = existingItem.site !== form.site
          const desaChanged = (existingItem.desa || '').toUpperCase() !== (form.desa || '').toUpperCase()
          
          if (siteChanged || desaChanged) {
            payload.jalur_id = generateItemId(form.site, form.desa, items)
          }
        }
        const { error } = await supabase.from('network_jalur_fo').update(payload).eq('id', editingId)
        if (error) throw error
        toast.success('Data Jalur FO diperbarui!')
      } else {
        const jalurId = form.jalur_id_manual?.trim() || generateItemId(form.site, form.desa, items)
        const { error } = await supabase.from('network_jalur_fo').insert({
          ...payload,
          jalur_id: jalurId,
          created_by: profile.id
        })
        if (error) throw error
        toast.success(`${jalurId} ditambahkan!`)
      }
      setIsModalOpen(false)
      fetchData()
    } catch (e) { toast.error(e.message || 'Terjadi kesalahan') }
    finally { setSaving(false) }
  }

  const handleDelete = async (item) => {
    try {
      const { error } = await supabase.from('network_jalur_fo').delete().eq('id', item.id)
      if (error) throw error
      toast.success('Data dihapus')
      setConfirmDelete(null)
      fetchData()
    } catch { toast.error('Gagal menghapus data') }
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    const allVisibleSelected = paginated.length > 0 && paginated.every(p => selectedIds.has(p.id))
    if (allVisibleSelected) {
      setSelectedIds(prev => {
        const n = new Set(prev)
        paginated.forEach(p => n.delete(p.id))
        return n
      })
    } else {
      setSelectedIds(prev => {
        const n = new Set(prev)
        paginated.forEach(p => n.add(p.id))
        return n
      })
    }
  }
  const clearSelection = () => setSelectedIds(new Set())

  const openBulkDeleteModal = (mode) => {
    if (mode === 'selected') {
      if (selectedIds.size === 0) return toast.error('Tidak ada data yang dipilih!')
      setBulkDeleteModal({ mode, label: `${selectedIds.size} data yang dipilih`, filter: null })
    } else if (mode === 'desa') {
      if (!filterDesa) return toast.error('Pilih filter Desa terlebih dahulu!')
      setBulkDeleteModal({ mode, label: `semua data Desa "${filterDesa}"`, filter: { col: 'desa', val: filterDesa } })
    } else if (mode === 'kecamatan') {
      if (!filterKecamatan) return toast.error('Pilih filter Kecamatan terlebih dahulu!')
      setBulkDeleteModal({ mode, label: `semua data Kecamatan "${filterKecamatan}"`, filter: { col: 'kecamatan', val: filterKecamatan } })
    } else if (mode === 'all') {
      setBulkDeleteModal({ mode, label: `SELURUH DATA JALUR FO`, filter: null })
    }
    setBulkDeleteConfirmText('')
  }

  const handleBulkDelete = async () => {
    if (!bulkDeleteModal) return
    const { mode, filter } = bulkDeleteModal
    const required = mode === 'all' ? 'HAPUS SEMUA' : 'HAPUS'
    if (bulkDeleteConfirmText.trim().toUpperCase() !== required) {
      return toast.error(`Ketik "${required}" untuk konfirmasi!`)
    }
    setBulkDeleteModal(null)
    
    try {
      let targetIds = []
      if (mode === 'selected') {
        targetIds = [...selectedIds]
      } else {
        let from = 0
        const step = 1000
        while (true) {
          let query = supabase.from('network_jalur_fo').select('id').range(from, from + step - 1)
          if (filter) query = query.eq(filter.col, filter.val)
          
          const { data, error } = await query
          if (error) throw error
          if (!data || data.length === 0) break
          targetIds.push(...data.map(d => d.id))
          if (data.length < step) break
          from += step
        }
      }

      if (targetIds.length === 0) return toast.info('Tidak ada data untuk dihapus')
      
      const chunkSize = 500
      for (let i = 0; i < targetIds.length; i += chunkSize) {
        const chunk = targetIds.slice(i, i + chunkSize)
        await supabase.from('network_jalur_fo').delete().in('id', chunk)
      }
      
      toast.success(`${targetIds.length} data berhasil dihapus!`)
      setSelectedIds(new Set())
      fetchData()
    } catch (e) {
      toast.error('Gagal menghapus data masal')
      console.error(e)
    }
  }

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { 'Jalur ID (Kosongkan jika auto)': '', 'Nama Jalur': '', Site: 'banyumas', 'Titik Awal': '', 'Titik Akhir': '', 'Panjang (m)': '', 'Tipe Kabel': 'ADSS', Kecamatan: '', Desa: '', Keterangan: '', 'Maps URL Awal': '', 'Maps URL Akhir': '' }
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template Jalur FO')
    XLSX.writeFile(wb, 'Template_Jalur_FO.xlsx')
  }

  const handleExport = () => {
    const dataToExport = filtered.map(p => ({
      'Jalur ID': p.jalur_id,
      'Nama Jalur': p.nama_jalur,
      Site: p.site,
      'Titik Awal': p.titik_awal,
      'Titik Akhir': p.titik_akhir,
      'Panjang (m)': p.panjang_meter,
      'Tipe Kabel': p.tipe_kabel,
      Kecamatan: p.kecamatan,
      Desa: p.desa,
      Keterangan: p.keterangan,
      'Maps URL Awal': p.maps_url_awal,
      'Maps URL Akhir': p.maps_url_akhir,
      'Diinput Oleh': getUserName(p.created_by),
      Tanggal: format(new Date(p.created_at), 'dd MMM yyyy HH:mm', { locale: localeId })
    }))
    const ws = XLSX.utils.json_to_sheet(dataToExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data Jalur FO')
    XLSX.writeFile(wb, `Data_Jalur_FO_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`)
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const bstr = evt.target.result
      const wb = XLSX.read(bstr, { type: 'binary' })
      const wsname = wb.SheetNames[0]
      const ws = wb.Sheets[wsname]
      const data = XLSX.utils.sheet_to_json(ws)
      
      const mapped = data.map((row, i) => ({
        index: i,
        jalur_id: row['Jalur ID (Kosongkan jika auto)'] || row['Jalur ID'] || '',
        nama_jalur: row['Nama Jalur'] || '',
        site: row['Site']?.toLowerCase() || 'banyumas',
        titik_awal: row['Titik Awal'] || '',
        titik_akhir: row['Titik Akhir'] || '',
        panjang_meter: row['Panjang (m)'] || '',
        tipe_kabel: row['Tipe Kabel'] || 'ADSS',
        kecamatan: row['Kecamatan'] || '',
        desa: row['Desa'] || '',
        keterangan: row['Keterangan'] || '',
        maps_url_awal: row['Maps URL Awal'] || '',
        maps_url_akhir: row['Maps URL Akhir'] || ''
      })).filter(r => r.nama_jalur && r.kecamatan && r.desa)

      setImportRows(mapped)
      setIsImportModalOpen(true)
      if (importRef.current) importRef.current.value = ''
      setExcelMenuOpen(false)
    }
    reader.readAsBinaryString(file)
  }

  const processImport = async () => {
    if (importRows.length === 0) return
    setSaving(true)
    try {
      let successCount = 0
      let localItems = [...items]

      for (let i = 0; i < importRows.length; i++) {
        const r = importRows[i]
        const jId = r.jalur_id || generateItemId(r.site, r.desa, localItems)
        
        const payload = {
          jalur_id: jId,
          nama_jalur: r.nama_jalur,
          site: r.site,
          titik_awal: r.titik_awal,
          titik_akhir: r.titik_akhir,
          panjang_meter: r.panjang_meter ? parseInt(r.panjang_meter) : null,
          tipe_kabel: r.tipe_kabel,
          kecamatan: r.kecamatan,
          desa: r.desa,
          provinsi: 'Jawa Tengah',
          kabupaten: 'Banyumas',
          keterangan: r.keterangan,
          maps_url_awal: r.maps_url_awal,
          maps_url_akhir: r.maps_url_akhir,
          created_by: profile.id
        }

        const { error, data } = await supabase.from('network_jalur_fo').insert(payload).select().single()
        if (!error && data) {
          successCount++
          localItems.push(data)
        }
      }
      toast.success(`${successCount} dari ${importRows.length} baris berhasil diimpor!`)
      setIsImportModalOpen(false)
      fetchData()
    } catch (e) { toast.error(e.message || 'Gagal impor data') }
    finally { setSaving(false) }
  }

  return (
    <div className="page-container">
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 700 }}>
            <Cable size={24} style={{ opacity: 0.8 }} />
            Data Jalur FO
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Jaringan Fiber — Pencatatan & Manajemen Data Jalur FO</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['admin', 'superadmin', 'teknisi'].includes(role) && (
            <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={14} /> Tambah</button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}><FileSpreadsheet size={14} /> Template</button>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setExcelMenuOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Download size={14} /> Excel <ChevronDown size={13} style={{ transform: excelMenuOpen ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
            </button>
            {excelMenuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setExcelMenuOpen(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', minWidth: '180px', overflow: 'hidden' }}>
                  <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setExcelMenuOpen(false); handleExportExcel() }}><Download size={13} /> Export ke Excel</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Total Data', value: items.length, color: 'var(--accent)' },
          { label: 'Kecamatan', value: kecamatanList.length, color: 'var(--success)' },
          { label: 'Hasil Filter', value: filtered.length, color: 'var(--purple)' },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: '12px 14px', borderTop: '3px solid ' + card.color }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div className="card" style={{ padding: '12px 14px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 auto', minWidth: '200px', maxWidth: '350px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            <input className="form-input" style={{ paddingLeft: '30px', height: '34px', fontSize: '13px', width: '100%' }} placeholder="Cari data, ID, Desa..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(1) }} />
          </div>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '110px', width: 'auto' }} value={filterSite} onChange={e => { setFilterSite(e.target.value); setPage(1) }}><option value="">Semua Site</option>{SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '140px', width: 'auto' }} value={filterKecamatan} onChange={e => { setFilterKecamatan(e.target.value); setFilterDesa(''); setPage(1) }}><option value="">Semua Kecamatan</option>{kecamatanList.map(k => <option key={k} value={k}>{k}</option>)}</select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '140px', width: 'auto' }} value={filterDesa} onChange={e => { setFilterDesa(e.target.value); setPage(1) }}><option value="">Semua Desa</option>{desaList.map(d => <option key={d} value={d}>{d}</option>)}</select>
          {(filterSite || filterKecamatan || filterDesa || searchQuery)
            ? <button className="btn btn-secondary btn-sm" style={{ height: '34px' }} onClick={() => { setFilterSite(''); setFilterKecamatan(''); setFilterDesa(''); setSearchQuery(''); setPage(1) }}>Reset</button>
            : <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>{filtered.length} data</div>
          }
        </div>
      </div>

      {/* BULK DELETE (superadmin) */}
      {role === 'superadmin' && (
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: '10px' }}>
          <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => setBulkMenuOpen(o => !o)}>
            <Trash2 size={13} /> Hapus Massal
            {selectedIds.size > 0 && <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: '20px', padding: '0 6px', fontSize: '10px', fontWeight: 700 }}>{selectedIds.size}</span>}
            <ChevronDown size={13} style={{ transform: bulkMenuOpen ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
          </button>
          {bulkMenuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setBulkMenuOpen(false)} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', minWidth: '220px', overflow: 'hidden' }}>
                {selectedIds.size > 0 && (
                  <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setBulkMenuOpen(false); openBulkDeleteModal('selected') }}>
                    <CheckSquare size={14} /> Hapus Yang Dipilih ({selectedIds.size})
                  </button>
                )}
                <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'rgba(239,68,68,0.08)', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setBulkMenuOpen(false); openBulkDeleteModal('all') }}>
                  <Trash2 size={14} /> Hapus SEMUA JALUR FO
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* TABLE */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat data...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Tidak ada data ditemukan</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: '900px', fontSize: '13px' }}>
              <thead>
                <tr>
                  {role === 'superadmin' && (
                    <th style={{ width: '36px', textAlign: 'center', cursor: 'pointer' }} onClick={toggleSelectAll}>
                      {paginated.length > 0 && paginated.every(p => selectedIds.has(p.id))
                        ? <CheckSquare size={14} style={{ color: 'var(--accent)' }} />
                        : <Square size={14} style={{ opacity: 0.4 }} />}
                    </th>
                  )}
                  <th style={{ width: '40px' }}>No</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('jalur_id')}>Jalur ID <SortIcon col="jalur_id" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('nama_jalur')}>Nama Jalur <SortIcon col="nama_jalur" /></th>
                  <th>Titik Awal</th>
                  <th>Titik Akhir</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('panjang_meter')}>Panjang (m) <SortIcon col="panjang_meter" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('tipe_kabel')}>Tipe Kabel <SortIcon col="tipe_kabel" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kecamatan')}>Kecamatan <SortIcon col="kecamatan" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('desa')}>Desa <SortIcon col="desa" /></th>
                  <th>Maps</th>
                  <th>Keterangan</th>
                  <th>Dibuat Oleh</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>Tanggal <SortIcon col="created_at" /></th>
                  <th style={{ width: '80px' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((item, idx) => {
                  
                  return (
                    <tr key={item.id} style={{ background: selectedIds.has(item.id) ? 'rgba(59,130,246,0.06)' : undefined }}>
                      {role === 'superadmin' && (
                        <td style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSelect(item.id)}>
                          {selectedIds.has(item.id) ? <CheckSquare size={14} style={{ color: 'var(--accent)' }} /> : <Square size={14} style={{ opacity: 0.4 }} />}
                        </td>
                      )}
                      <td style={{ color: 'var(--text-secondary)' }}>{(page - 1) * perPage + idx + 1}</td>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{item.jalur_id}</span></td>
                      <td>{item.nama_jalur || '-'}</td>
                      <td>{item.titik_awal || '-'}</td>
                      <td>{item.titik_akhir || '-'}</td>
                      <td>{item.panjang_meter ? item.panjang_meter + ' m' : '-'}</td>
                      <td>{item.tipe_kabel || '-'}</td>
                      <td>{item.kecamatan || '-'}</td>
                      <td>{item.desa || '-'}</td>
                      <td>
                        {item.maps_url_awal || item.maps_url_akhir ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {item.maps_url_awal && (
                              <a href={item.maps_url_awal} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px' }}>
                                <MapPin size={10} />Awal <ExternalLink size={10} />
                              </a>
                            )}
                            {item.maps_url_akhir && (
                              <a href={item.maps_url_akhir} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px' }}>
                                <MapPin size={10} />Akhir <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        ) : '-'}
                      </td>
                      <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '12px' }}>{item.keterangan || '-'}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{getUserName(item.created_by)}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID') : '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {['admin', 'superadmin', 'teknisi'].includes(role) && (
                            <button className="btn btn-sm" style={{ padding: '4px 7px', background: 'rgba(59,130,246,0.1)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.25)' }} onClick={() => openEdit(item)}><Edit2 size={12} /></button>
                          )}
                          {role === 'superadmin' && (
                            <button className="btn btn-sm" style={{ padding: '4px 7px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)' }} onClick={() => setConfirmDelete(item)}><Trash2 size={12} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div style={{ marginTop: '12px' }}>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Hapus Data</h3><button className="btn-icon" onClick={() => setConfirmDelete(null)}><X size={18} /></button></div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '24px' }}>
              <Trash2 size={40} style={{ color: 'var(--danger)', marginBottom: '12px' }} />
              <p style={{ marginBottom: '8px' }}>Hapus data ini?</p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Tindakan ini tidak bisa dibatalkan.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Batal</button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleDelete(confirmDelete)}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE CONFIRM MODAL */}
      {bulkDeleteModal && (
        <div className="modal-overlay" onClick={() => setBulkDeleteModal(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Konfirmasi Hapus Massal</h3><button className="btn-icon" onClick={() => setBulkDeleteModal(null)}><X size={18} /></button></div>
            <div className="modal-body">
              <p style={{ marginBottom: '12px' }}>Anda akan menghapus: <strong style={{ color: 'var(--danger)' }}>{bulkDeleteModal.label}</strong></p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Ketik <strong>{bulkDeleteModal.mode === 'all' ? 'HAPUS SEMUA' : 'HAPUS'}</strong> untuk konfirmasi:</p>
              <input className="form-input" value={bulkDeleteConfirmText} onChange={e => setBulkDeleteConfirmText(e.target.value)} placeholder={bulkDeleteModal.mode === 'all' ? 'HAPUS SEMUA' : 'HAPUS'} autoFocus />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setBulkDeleteModal(null)}>Batal</button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleBulkDelete}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT MODAL */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '640px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'Edit Data' : 'Tambah Data'}</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div className="responsive-grid-2">
                <div className="form-group">
                  <label className="form-label">Site *</label>
                  <select className="form-input" value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {!editingId && (
                  <div className="form-group">
                    <label className="form-label">ID Jalur Manual</label>
                    <input className="form-input" placeholder="Biarkan kosong untuk auto-generate" value={form.jalur_id_manual || ''} onChange={e => setForm(f => ({ ...f, jalur_id_manual: e.target.value }))} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Nama Jalur *</label>
                  <input className="form-input" placeholder="Nama Jalur..." value={form.nama_jalur} onChange={e => setForm(f => ({ ...f, nama_jalur: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipe Kabel</label>
                  <select className="form-input" value={form.tipe_kabel} onChange={e => setForm(f => ({ ...f, tipe_kabel: e.target.value }))}>
                    <option value="">-- Pilih Tipe --</option>
                    <option value="ADSS">ADSS</option>
                    <option value="FTTH">FTTH</option>
                    <option value="OPGW">OPGW</option>
                    <option value="UTP">UTP</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Panjang (meter)</label>
                  <input className="form-input" type="number" placeholder="cth: 50" value={form.panjang_meter} onChange={e => setForm(f => ({ ...f, panjang_meter: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Titik Awal</label>
                  <input className="form-input" placeholder="Titik Awal..." value={form.titik_awal} onChange={e => setForm(f => ({ ...f, titik_awal: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Titik Akhir</label>
                  <input className="form-input" placeholder="Titik Akhir..." value={form.titik_akhir} onChange={e => setForm(f => ({ ...f, titik_akhir: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Maps URL Awal</label>
                  <input className="form-input" placeholder="Maps URL Awal..." value={form.maps_url_awal} onChange={e => setForm(f => ({ ...f, maps_url_awal: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Maps URL Akhir</label>
                  <input className="form-input" placeholder="Maps URL Akhir..." value={form.maps_url_akhir} onChange={e => setForm(f => ({ ...f, maps_url_akhir: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Kecamatan *</label>
                  <SearchableSelect value={form.kecamatan} onChange={val => setForm(f => ({ ...f, kecamatan: val, desa: '' }))} options={kecamatanOpts.map(k => ({ value: k, label: k }))} placeholder="Ketik atau pilih kecamatan..." allowNew />
                </div>
                <div className="form-group">
                  <label className="form-label">Desa/Kelurahan *</label>
                  <SearchableSelect value={form.desa} onChange={val => setForm(f => ({ ...f, desa: val }))} options={desaOpts.map(d => ({ value: d, label: d }))} placeholder="Ketik atau pilih desa..." allowNew />
                </div>
                <div className="form-group">
                  <label className="form-label">Jalan/Dusun/Gang</label>
                  <input className="form-input" placeholder="Jalan/Dusun/Gang" value={form.jalan} onChange={e => setForm(f => ({ ...f, jalan: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Google Maps URL</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input className="form-input" placeholder="Paste link Google Maps..." value={form.maps_url} onChange={e => setForm(f => ({ ...f, maps_url: e.target.value }))} style={{ flex: 1 }} />
                  <button className="btn btn-secondary btn-sm" onClick={handleExtractCoords} type="button"><MapPin size={14} /> Ekstrak</button>
                </div>
              </div>
              <div className="responsive-grid-2">
                <div className="form-group">
                  <label className="form-label">Latitude</label>
                  <input className="form-input" placeholder="-7.xxxx" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Longitude</label>
                  <input className="form-input" placeholder="109.xxxx" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Keterangan</label>
                <textarea className="form-input" rows={3} placeholder="Catatan tambahan..." value={form.keterangan} onChange={e => setForm(f => ({ ...f, keterangan: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Data'}</button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT PREVIEW MODAL */}
      {isImportModalOpen && (
        <div className="modal-overlay" onClick={() => setIsImportModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '900px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Preview Import ({importRows.length} baris)</h3>
              <button className="btn-icon" onClick={() => setIsImportModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ fontSize: '12px', minWidth: '600px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '36px' }}>
                        <input type="checkbox" checked={importRows.length > 0 && importRows.every(r => r._selected)} onChange={e => setImportRows(rows => rows.map(r => ({ ...r, _selected: e.target.checked })))} />
                      </th>
                      <th>Baris</th><th>ID Manual</th><th>Kecamatan</th><th>Desa</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r, i) => (
                      <tr key={i} style={{ background: r._error ? 'rgba(239,68,68,0.06)' : undefined }}>
                        <td><input type="checkbox" checked={!!r._selected && !r._error} disabled={!!r._error} onChange={e => setImportRows(rows => rows.map((row, ri) => ri === i ? { ...row, _selected: e.target.checked } : row))} /></td>
                        <td style={{ color: 'var(--text-secondary)' }}>{r._rowNo}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{r.jalur_id_manual || <span style={{ color: 'var(--text-secondary)' }}>auto</span>}</td>
                        <td>{r.kecamatan}</td>
                        <td>{r.desa}</td>
                        <td>{r._error ? <span style={{ color: 'var(--danger)', fontSize: '11px' }}>{r._error}</span> : <span style={{ color: 'var(--success)', fontSize: '11px' }}>OK</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsImportModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={processImport} disabled={saving}>
                {saving ? 'Mengimport...' : 'Import ' + importRows.filter(r => r._selected && !r._error).length + ' data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
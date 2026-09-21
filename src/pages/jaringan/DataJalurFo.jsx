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
  { value: 'banyumas', label: 'Banyumas' },
  { value: 'cilacap', label: 'Cilacap' },
  { value: 'cilacap_herman', label: 'Cilacap (Herman)' },
]
const SITE_CODE = { banyumas: 'BMS', cilacap: 'CLP', cilacap_herman: 'CLH' }

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
      <div className="page-header">
        <div>
          <h1><Cable size={24} style={{ marginRight: 10 }} /> Data Jalur Fiber Optik</h1>
          <p className="text-secondary">Kelola data jalur kabel fiber optik jaringan</p>
        </div>
        <div className="flex gap-2">
          {['admin', 'superadmin', 'teknisi'].includes(role) && (
            <button className="btn-primary" onClick={openAdd}>
              <Plus size={16} /> Tambah Jalur
            </button>
          )}

          <div style={{ position: 'relative' }}>
            <button className="btn-secondary" onClick={() => { setExcelMenuOpen(!excelMenuOpen); setBulkMenuOpen(false) }}>
              <FileSpreadsheet size={16} /> Excel <ChevronDown size={14} />
            </button>
            {excelMenuOpen && (
              <div className="dropdown-menu">
                <button onClick={() => { handleExport(); setExcelMenuOpen(false) }}>
                  <Download size={14} /> Export Semua ({filtered.length})
                </button>
                {['admin', 'superadmin', 'teknisi'].includes(role) && (
                  <>
                    <button onClick={() => { handleDownloadTemplate(); setExcelMenuOpen(false) }}>
                      <Download size={14} /> Download Template
                    </button>
                    <button onClick={() => importRef.current?.click()}>
                      <Upload size={14} /> Import Data
                    </button>
                    <input type="file" ref={importRef} accept=".xlsx, .xls" style={{ display: 'none' }} onChange={handleFileChange} />
                  </>
                )}
              </div>
            )}
          </div>

          {role === 'superadmin' && (
            <div style={{ position: 'relative' }}>
              <button className="btn-danger-outline" onClick={() => { setBulkMenuOpen(!bulkMenuOpen); setExcelMenuOpen(false) }}>
                <Trash2 size={16} /> Hapus Masal <ChevronDown size={14} />
              </button>
              {bulkMenuOpen && (
                <div className="dropdown-menu" style={{ right: 0 }}>
                  <button onClick={() => { openBulkDeleteModal('selected'); setBulkMenuOpen(false) }} disabled={selectedIds.size === 0}>
                    <CheckSquare size={14} /> Hapus yang dipilih ({selectedIds.size})
                  </button>
                  <button onClick={() => { openBulkDeleteModal('desa'); setBulkMenuOpen(false) }} disabled={!filterDesa}>
                    <MapPin size={14} /> Hapus filter Desa
                  </button>
                  <button onClick={() => { openBulkDeleteModal('kecamatan'); setBulkMenuOpen(false) }} disabled={!filterKecamatan}>
                    <Map size={14} /> Hapus filter Kecamatan
                  </button>
                  <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }}></div>
                  <button onClick={() => { openBulkDeleteModal('all'); setBulkMenuOpen(false) }} style={{ color: 'var(--danger)' }}>
                    <Trash2 size={14} /> Hapus Seluruh Data
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Cari ID, Nama Jalur, atau Lokasi..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
          />
        </div>
        
        <select value={filterSite} onChange={(e) => { setFilterSite(e.target.value); setPage(1) }} className="form-input" style={{ width: '150px' }}>
          <option value="">Semua Site</option>
          {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <select value={filterKecamatan} onChange={(e) => { setFilterKecamatan(e.target.value); setFilterDesa(''); setPage(1) }} className="form-input" style={{ width: '180px' }}>
          <option value="">Semua Kecamatan</option>
          {kecamatanList.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        
        <select value={filterDesa} onChange={(e) => { setFilterDesa(e.target.value); setPage(1) }} className="form-input" style={{ width: '180px' }}>
          <option value="">Semua Desa</option>
          {desaList.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="card table-container">
        {loading ? (
          <div className="loading-state">Memuat data...</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                {role === 'superadmin' && (
                  <th width="40">
                    <button className="btn-icon" onClick={toggleSelectAll}>
                      {paginated.length > 0 && paginated.every(p => selectedIds.has(p.id)) ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </th>
                )}
                <th width="50">No</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('jalur_id')}>
                  Jalur ID <SortIcon col="jalur_id" />
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('nama_jalur')}>
                  Nama Jalur <SortIcon col="nama_jalur" />
                </th>
                <th>Titik Awal</th>
                <th>Titik Akhir</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('panjang_meter')}>
                  Panjang (m) <SortIcon col="panjang_meter" />
                </th>
                <th>Tipe Kabel</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kecamatan')}>
                  Kecamatan <SortIcon col="kecamatan" />
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('desa')}>
                  Desa <SortIcon col="desa" />
                </th>
                <th>Maps Awal</th>
                <th>Maps Akhir</th>
                <th>Keterangan</th>
                <th>Dibuat Oleh</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                  Tanggal <SortIcon col="created_at" />
                </th>
                <th width="100">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={role === 'superadmin' ? 16 : 15} className="text-center">Tidak ada data jalur FO ditemukan</td></tr>
              ) : (
                paginated.map((item, idx) => (
                  <tr key={item.id} className={selectedIds.has(item.id) ? 'row-selected' : ''}>
                    {role === 'superadmin' && (
                      <td>
                        <button className="btn-icon" onClick={() => toggleSelect(item.id)}>
                          {selectedIds.has(item.id) ? <CheckSquare size={16} color="var(--accent)" /> : <Square size={16} />}
                        </button>
                      </td>
                    )}
                    <td>{(page - 1) * perPage + idx + 1}</td>
                    <td className="font-mono text-accent">{item.jalur_id}</td>
                    <td className="fw-600">{item.nama_jalur}</td>
                    <td>{item.titik_awal || '-'}</td>
                    <td>{item.titik_akhir || '-'}</td>
                    <td>{item.panjang_meter ? `${item.panjang_meter}m` : '-'}</td>
                    <td>{item.tipe_kabel}</td>
                    <td>{item.kecamatan}</td>
                    <td>{item.desa}</td>
                    <td>
                      {item.maps_url_awal ? (
                        <a href={item.maps_url_awal} target="_blank" rel="noreferrer" title="Buka Maps Awal" className="text-accent flex items-center gap-1">
                          <MapPin size={14} /> <ExternalLink size={12} />
                        </a>
                      ) : '-'}
                    </td>
                    <td>
                      {item.maps_url_akhir ? (
                        <a href={item.maps_url_akhir} target="_blank" rel="noreferrer" title="Buka Maps Akhir" className="text-accent flex items-center gap-1">
                          <MapPin size={14} /> <ExternalLink size={12} />
                        </a>
                      ) : '-'}
                    </td>
                    <td>{item.keterangan || '-'}</td>
                    <td className="text-sm">{getUserName(item.created_by)}</td>
                    <td className="text-sm">{format(new Date(item.created_at), 'dd MMM yyyy', { locale: localeId })}</td>
                    <td>
                      <div className="flex gap-2">
                        {['admin', 'superadmin', 'teknisi'].includes(role) && (
                          <button className="btn-icon" onClick={() => openEdit(item)} title="Edit"><Edit2 size={16} /></button>
                        )}
                        {role === 'superadmin' && (
                          <button className="btn-icon text-danger" onClick={() => setConfirmDelete(item)} title="Hapus"><Trash2 size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* MODAL ADD/EDIT */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 800 }}>
            <div className="modal-header">
              <h2>{editingId ? 'Edit Jalur FO' : 'Tambah Jalur FO Baru'}</h2>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div className="form-group mb-4">
                <label>Site Wilayah</label>
                <div className="flex gap-3">
                  {SITES.map(s => (
                    <label key={s.value} className="radio-label">
                      <input type="radio" name="site" value={s.value} checked={form.site === s.value} onChange={(e) => setForm({ ...form, site: e.target.value })} />
                      <span>{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {!editingId && (
                <div className="form-group mb-4 p-3 bg-darker rounded border border-gray-700">
                  <label>Jalur ID Manual (Opsional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Kosongkan untuk auto-generate (contoh: NAT/BMS/JALUR/DESA/001)"
                    value={form.jalur_id_manual}
                    onChange={e => setForm({ ...form, jalur_id_manual: e.target.value })}
                  />
                  <p className="text-xs text-secondary mt-1">Hanya diisi jika ingin menggunakan ID khusus, lewati jika ingin format otomatis.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label>Nama Jalur <span className="text-danger">*</span></label>
                  <input type="text" className="form-input" value={form.nama_jalur} onChange={e => setForm({ ...form, nama_jalur: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Tipe Kabel</label>
                  <select className="form-input" value={form.tipe_kabel} onChange={e => setForm({ ...form, tipe_kabel: e.target.value })}>
                    {TIPE_KABEL.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Titik Awal</label>
                  <input type="text" className="form-input" value={form.titik_awal} onChange={e => setForm({ ...form, titik_awal: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Titik Akhir</label>
                  <input type="text" className="form-input" value={form.titik_akhir} onChange={e => setForm({ ...form, titik_akhir: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Panjang Kabel (Meter)</label>
                  <input type="number" className="form-input" value={form.panjang_meter} onChange={e => setForm({ ...form, panjang_meter: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Keterangan</label>
                  <input type="text" className="form-input" value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} />
                </div>
              </div>

              <div className="border-t border-gray-700 my-4 pt-4">
                <h3 className="mb-3 text-md fw-600">Lokasi / Area</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label>Kecamatan <span className="text-danger">*</span></label>
                    <input type="text" className="form-input" value={form.kecamatan} onChange={e => setForm({ ...form, kecamatan: e.target.value })} placeholder="Ketik Kecamatan..." required />
                  </div>
                  <div className="form-group">
                    <label>Desa/Kelurahan <span className="text-danger">*</span></label>
                    <input type="text" className="form-input" value={form.desa} onChange={e => setForm({ ...form, desa: e.target.value })} placeholder="Ketik Desa..." required />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-700 my-4 pt-4">
                <h3 className="mb-3 text-md fw-600">Koordinat (Opsional)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label>URL Maps Titik Awal</label>
                    <input type="text" className="form-input" value={form.maps_url_awal} onChange={e => setForm({ ...form, maps_url_awal: e.target.value })} placeholder="Paste link Google Maps awal..." />
                  </div>
                  <div className="form-group">
                    <label>URL Maps Titik Akhir</label>
                    <input type="text" className="form-input" value={form.maps_url_akhir} onChange={e => setForm({ ...form, maps_url_akhir: e.target.value })} placeholder="Paste link Google Maps akhir..." />
                  </div>
                </div>
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan Jalur FO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal-content modal-sm">
            <div className="modal-header">
              <h2>Konfirmasi Hapus</h2>
              <button className="btn-icon" onClick={() => setConfirmDelete(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p>Yakin ingin menghapus jalur <strong>{confirmDelete.jalur_id} ({confirmDelete.nama_jalur})</strong>?</p>
              <p className="text-secondary text-sm mt-2">Data yang dihapus tidak dapat dikembalikan.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Batal</button>
              <button className="btn-danger" onClick={() => handleDelete(confirmDelete)}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MODAL */}
      {isImportModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h2>Konfirmasi Import Data</h2>
              <button className="btn-icon" onClick={() => setIsImportModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <p className="mb-4">Ditemukan <strong>{importRows.length}</strong> baris valid untuk diimpor.</p>
              <table className="table" style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th>Nama Jalur</th>
                    <th>Site</th>
                    <th>Desa</th>
                    <th>Kecamatan</th>
                    <th>Tipe Kabel</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      <td>{r.nama_jalur}</td>
                      <td>{r.site}</td>
                      <td>{r.desa}</td>
                      <td>{r.kecamatan}</td>
                      <td>{r.tipe_kabel}</td>
                    </tr>
                  ))}
                  {importRows.length > 10 && (
                    <tr>
                      <td colSpan="5" className="text-center text-secondary">...dan {importRows.length - 10} baris lainnya</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsImportModalOpen(false)}>Batal</button>
              <button className="btn-primary" onClick={processImport} disabled={saving}>
                {saving ? 'Memproses Import...' : `Import ${importRows.length} Data`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE MODAL */}
      {bulkDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-sm">
            <div className="modal-header">
              <h2 className="text-danger">Konfirmasi Hapus Masal</h2>
              <button className="btn-icon" onClick={() => setBulkDeleteModal(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="bg-danger-subtle p-3 rounded mb-4">
                <p className="mb-2 fw-600">PERINGATAN BAHAYA!</p>
                <p>Anda akan menghapus secara permanen <strong>{bulkDeleteModal.label}</strong>.</p>
                <p className="mt-2">Tindakan ini tidak bisa dibatalkan!</p>
              </div>
              <div className="form-group">
                <label>Ketik <strong className="text-danger">{bulkDeleteModal.mode === 'all' ? 'HAPUS SEMUA' : 'HAPUS'}</strong> untuk melanjutkan:</label>
                <input 
                  type="text" 
                  className="form-input font-mono mt-1" 
                  value={bulkDeleteConfirmText} 
                  onChange={e => setBulkDeleteConfirmText(e.target.value)}
                  placeholder={bulkDeleteModal.mode === 'all' ? 'HAPUS SEMUA' : 'HAPUS'}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setBulkDeleteModal(null)}>Batal</button>
              <button className="btn-danger" onClick={handleBulkDelete}>Eksekusi Hapus</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

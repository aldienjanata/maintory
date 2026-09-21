import { useState, useEffect, useMemo, useRef } from 'react'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import Pagination from '../../components/common/Pagination'
import { Plus, X, Edit2, Trash2, Search, Download, ChevronDown, ChevronUp, ExternalLink, Server, Upload, FileSpreadsheet, CheckSquare, Square, Eraser } from 'lucide-react'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'

const SITES = [
  { value: 'banyumas', label: 'Banyumas' },
  { value: 'cilacap', label: 'Cilacap' },
  { value: 'cilacap_herman', label: 'Cilacap (Herman)' },
]
const SITE_CODE = { banyumas: 'BMS', cilacap: 'CLP', cilacap_herman: 'CLH' }

const EMPTY_FORM = {
  site: 'banyumas', server_id_manual: '', nama_server: '',
  provinsi: 'Jawa Tengah', kabupaten: 'Banyumas', kecamatan: '', desa: '', jalan: '',
  maps_url: '', longitude: '', latitude: '', keterangan: ''
}

const DEFAULT_FORMAT = 'NAT/{SITE_CODE}/SERVER/{DESA}/{NO}'

function generateItemId(site, desa, existingItems, formatTemplate = DEFAULT_FORMAT) {
  if (!desa) return ''
  const siteCode = SITE_CODE[site] || 'BMS'
  const desaSlug = desa.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').substring(0, 15)
  
  const sameItems = existingItems.filter(
    p => p.site === site && p.desa?.toUpperCase().trim() === desa.toUpperCase().trim() && p.server_id
  )
  
  let maxNo = 0
  for (const p of sameItems) {
    const match = p.server_id.match(/\/(\d+)$/)
    if (match && match[1]) {
      const num = parseInt(match[1], 10)
      if (num > maxNo) maxNo = num
    }
  }
  
  if (maxNo === 0) maxNo = sameItems.length
  const no = String(maxNo + 1).padStart(3, '0')
  
  return formatTemplate
    .replace(/{SITE_CODE}/g, siteCode)
    .replace(/{DESA}/g, desaSlug)
    .replace(/{NO}/g, no)
}

function parseMapsUrl(url) {
  if (!url) return { lat: '', lon: '' }
  const m = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
  if (m) return { lat: m[1], lon: m[2] }
  const m2 = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/)
  if (m2) return { lat: m2[1], lon: m2[2] }
  return { lat: '', lon: '' }
}

export default function DataServer() {
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
  
  // Bulk Delete (superadmin only)
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
          .from('network_server')
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
    } catch { 
      toast.error('Gagal memuat data') 
    } finally { 
      setLoading(false) 
    }
  }

  const getUserName = (uid) => users.find(u => u.id === uid)?.full_name || '-'

  const kecamatanList = useMemo(() => [...new Set(items.map(p => p.kecamatan).filter(Boolean))].sort(), [items])
  const desaList = useMemo(() => {
    let list = items
    if (filterKecamatan) list = list.filter(p => p.kecamatan === filterKecamatan)
    return [...new Set(list.map(p => p.desa).filter(Boolean))].sort()
  }, [items, filterKecamatan])

  // CASCADING OPTIONS UNTUK FORM TAMBAH/EDIT
  const provinsiOpts = useMemo(() => [...new Set(items.map(p => p.provinsi).filter(Boolean))].sort(), [items])
  const kabupatenOpts = useMemo(() => {
    let list = items
    if (form.provinsi) list = list.filter(p => p.provinsi === form.provinsi)
    return [...new Set(list.map(p => p.kabupaten).filter(Boolean))].sort()
  }, [items, form.provinsi])
  const kecamatanOpts = useMemo(() => {
    let list = items
    if (form.kabupaten) list = list.filter(p => p.kabupaten === form.kabupaten)
    return [...new Set(list.map(p => p.kecamatan).filter(Boolean))].sort()
  }, [items, form.kabupaten])
  const desaOpts = useMemo(() => {
    let list = items
    if (form.kecamatan) list = list.filter(p => p.kecamatan === form.kecamatan)
    return [...new Set(list.map(p => p.desa).filter(Boolean))].sort()
  }, [items, form.kecamatan])

  const filtered = useMemo(() => {
    let data = [...items]
    if (filterSite) data = data.filter(p => p.site === filterSite)
    if (filterKecamatan) data = data.filter(p => p.kecamatan === filterKecamatan)
    if (filterDesa) data = data.filter(p => p.desa === filterDesa)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      data = data.filter(p => 
        p.server_id?.toLowerCase().includes(q) || 
        p.nama_server?.toLowerCase().includes(q) || 
        p.desa?.toLowerCase().includes(q) || 
        p.kecamatan?.toLowerCase().includes(q)
      )
    }
    data.sort((a, b) => {
      let va = a[sortKey] ?? '', vb = b[sortKey] ?? ''
      if (va === vb) {
        let ida = a.server_id ?? '', idb = b.server_id ?? ''
        return ida > idb ? 1 : (ida < idb ? -1 : 0)
      }
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
      nama_server: item.nama_server || '',
      provinsi: item.provinsi || '', kabupaten: item.kabupaten || '',
      kecamatan: item.kecamatan || '', desa: item.desa || '', jalan: item.jalan || '',
      maps_url: item.maps_url || '', longitude: item.longitude || '',
      latitude: item.latitude || '', keterangan: item.keterangan || ''
    })
    setIsModalOpen(true)
  }

  const handleExtractCoords = () => {
    const coords = parseMapsUrl(form.maps_url)
    if (coords.lat && coords.lon) {
      setForm(f => ({ ...f, latitude: coords.lat, longitude: coords.lon }))
      toast.success('Koordinat berhasil diekstrak!')
    } else toast.error('Koordinat tidak ditemukan. Masukkan manual.')
  }

  const handleSave = async () => {
    if (!form.nama_server.trim()) return toast.error('Nama Server wajib diisi!')
    if (!form.kecamatan.trim()) return toast.error('Kecamatan wajib diisi!')
    if (!form.desa.trim()) return toast.error('Desa/Kelurahan wajib diisi!')
    
    setSaving(true)
    try {
      const lat = form.latitude ? Number(form.latitude) : null
      const lon = form.longitude ? Number(form.longitude) : null

      const payload = {
        site: form.site,
        nama_server: form.nama_server,
        provinsi: form.provinsi,
        kabupaten: form.kabupaten,
        kecamatan: form.kecamatan,
        desa: form.desa,
        jalan: form.jalan,
        maps_url: form.maps_url,
        longitude: lon,
        latitude: lat,
        keterangan: form.keterangan,
        updated_by: profile.id,
      }
      
      if (editingId) {
        const existingItem = items.find(d => d.id === editingId)
        let newItemId = null
        if (existingItem) {
          const siteChanged = existingItem.site !== form.site
          const desaChanged = (existingItem.desa || '').toUpperCase() !== (form.desa || '').toUpperCase()
          if (siteChanged || desaChanged) {
            newItemId = generateItemId(form.site, form.desa, items)
            payload.server_id = newItemId
          }
        }
        const { error } = await supabase.from('network_server').update(payload).eq('id', editingId)
        if (error) throw error
        toast.success(`Data Server diperbarui!${newItemId ? ` ID otomatis disesuaikan menjadi ${newItemId}` : ''}`)
      } else {
        const itemId = form.server_id_manual?.trim() || generateItemId(form.site, form.desa, items)
        const { error } = await supabase.from('network_server').insert({ ...payload, server_id: itemId, created_by: profile.id })
        if (error) throw error
        toast.success(`${itemId} ditambahkan!`)
      }
      setIsModalOpen(false)
      fetchData()
    } catch (e) { 
      toast.error(e.message || 'Terjadi kesalahan') 
    } finally { 
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    try {
      const { error } = await supabase.from('network_server').delete().eq('id', item.id)
      if (error) throw error
      toast.success('Data server dihapus')
      setConfirmDelete(null)
      fetchData()
    } catch { toast.error('Gagal menghapus data') }
  }

  // BULK DELETE
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
      setBulkDeleteModal({ mode, label: `${selectedIds.size} server yang dipilih`, filter: null })
    } else if (mode === 'all') {
      setBulkDeleteModal({ mode, label: `SELURUH DATA SERVER`, filter: null })
    }
    setBulkDeleteConfirmText('')
  }

  const handleBulkDelete = async () => {
    if (!bulkDeleteModal) return
    const { mode, filter } = bulkDeleteModal
    const required = mode.startsWith('all') ? 'HAPUS SEMUA' : 'HAPUS'
    if (bulkDeleteConfirmText.trim().toUpperCase() !== required) {
      return toast.error(`Ketik "${required}" untuk konfirmasi!`)
    }
    setBulkDeleteModal(null)
    
    try {
      let targetIds = []
      if (mode === 'selected') {
        targetIds = [...selectedIds]
      } else {
        const { data, error } = await supabase.from('network_server').select('id')
        if (error) throw error
        targetIds = data.map(d => d.id)
      }

      if (targetIds.length === 0) return toast.error('Tidak ada data yang cocok untuk dihapus!')

      const chunkSize = 200
      for (let i = 0; i < targetIds.length; i += chunkSize) {
        const chunk = targetIds.slice(i, i + chunkSize)
        const { error } = await supabase.from('network_server').delete().in('id', chunk)
        if (error) throw error
      }

      toast.success(`${targetIds.length} server berhasil dihapus!`)
      setSelectedIds(new Set())
      fetchData()
    } catch (e) {
      toast.error('Gagal menghapus: ' + e.message)
    }
  }

  // EXPORT / IMPORT
  const handleExportExcel = () => {
    if (filtered.length === 0) return toast.error('Tidak ada data')
    const rows = filtered.map((p, i) => ({
      'No': i + 1, 'Site': SITES.find(s => s.value === p.site)?.label || p.site,
      'Server ID': p.server_id || '', 'Nama Server': p.nama_server || '',
      'Provinsi': p.provinsi || '', 'Kabupaten/Kota': p.kabupaten || '', 'Kecamatan': p.kecamatan || '',
      'Desa/Kelurahan': p.desa || '', 'Jalan': p.jalan || '', 'Maps URL': p.maps_url || '',
      'Latitude': p.latitude || '', 'Longitude': p.longitude || '',
      'Keterangan': p.keterangan || '', 'Diinput Oleh': getUserName(p.created_by),
      'Edit Oleh': getUserName(p.updated_by), 'Tanggal Input': p.created_at ? format(new Date(p.created_at), 'dd/MM/yyyy HH:mm') : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data Server')
    XLSX.writeFile(wb, `Data Server ${format(new Date(), 'dd-MM-yyyy')}.xlsx`)
    toast.success('Export Excel berhasil!')
  }

  const handleDownloadTemplate = () => {
    const template = [
      {
        'Server ID': '', 'Nama Server': 'Server Pusat Kroya', 'Site': 'BANYUMAS',
        'Provinsi': 'JAWA TENGAH', 'Kabupaten/Kota': 'CILACAP',
        'Kecamatan': 'KROYA', 'Desa/Kelurahan': 'MUJUR', 'Jalan': 'Gg. BIMA',
        'Maps URL': '', 'Latitude': '-7.625345', 'Longitude': '109.245233',
        'Keterangan': 'Server ID boleh dikosongkan, akan otomatis dibuatkan'
      }
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, `Template Import Server ${format(new Date(), 'dd-MM-yyyy')}.xlsx`)
    toast.success('Template berhasil diunduh!')
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws)
        
        let freshItems = [...items]
        let payloads = []

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]
          let siteStr = String(r['Site'] || r['site'] || 'Banyumas').toLowerCase()
          let siteVal = SITES.find(s => s.label.toLowerCase() === siteStr || s.value === siteStr)?.value || 'banyumas'
          let desa = String(r['Desa/Kelurahan'] || r['Desa'] || '').toUpperCase()
          
          let server_id = String(r['Server ID'] || r['ID'] || '')
          if (!server_id && desa) {
            server_id = generateItemId(siteVal, desa, freshItems)
          }

          if (!desa || !r['Nama Server']) continue; // skip invalid

          const payload = {
            server_id,
            site: siteVal,
            nama_server: r['Nama Server'],
            provinsi: r['Provinsi'] || '',
            kabupaten: r['Kabupaten/Kota'] || r['Kabupaten'] || '',
            kecamatan: r['Kecamatan'] || '',
            desa,
            jalan: r['Jalan'] || '',
            maps_url: r['Maps URL'] || '',
            latitude: Number(r['Latitude']) || null,
            longitude: Number(r['Longitude']) || null,
            keterangan: r['Keterangan'] || '',
            created_by: profile.id,
            updated_by: profile.id,
          }
          
          payloads.push(payload)
          freshItems.push({ site: siteVal, desa, server_id })
        }

        if (payloads.length === 0) return toast.error('Tidak ada data valid yang bisa diimport!')
        
        const { error } = await supabase.from('network_server').insert(payloads)
        if (error) throw error
        toast.success(`${payloads.length} Server berhasil diimport!`)
        fetchData()
      } catch (err) {
        toast.error('Gagal import file Excel')
        console.error(err)
      }
      if (importRef.current) importRef.current.value = ''
    }
    reader.readAsArrayBuffer(file)
  }

  const itemIdPreview = !editingId && form.desa ? generateItemId(form.site, form.desa, items) : null

  return (
    <div className="page-container">
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 700 }}>
            <Server size={24} /> Data Server
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Jaringan Fiber — Pencatatan & Manajemen Server</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['admin', 'superadmin', 'teknisi'].includes(role) && (
            <button className="btn btn-primary btn-sm" onClick={openAdd} title="Tambah Data Server Baru">
              <Plus size={14} /> Tambah
            </button>
          )}
          {['admin', 'superadmin'].includes(role) && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate} title="Unduh template Excel untuk import">
                <FileSpreadsheet size={14} /> Template
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => importRef.current?.click()} title="Import dari Excel">
                <Upload size={14} /> Import
              </button>
              <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportFile} />
            </>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleExportExcel} title="Export ke Excel">
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        <div className="card" style={{ padding: '12px 14px', borderTop: '3px solid var(--accent)' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>{items.length}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Total Server</div>
        </div>
        <div className="card" style={{ padding: '12px 14px', borderTop: '3px solid var(--purple)' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--purple)' }}>{kecamatanList.length}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Kecamatan</div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="card" style={{ padding: '12px 14px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 auto', minWidth: '200px', maxWidth: '350px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            <input className="form-input" style={{ paddingLeft: '30px', height: '34px', fontSize: '13px', width: '100%' }} placeholder="Cari ID, Nama, Desa, Kecamatan..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(1) }} />
          </div>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '110px', width: 'auto' }} value={filterSite} onChange={e => { setFilterSite(e.target.value); setPage(1) }}><option value="">Semua Site</option>{SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '140px', width: 'auto' }} value={filterKecamatan} onChange={e => { setFilterKecamatan(e.target.value); setFilterDesa(''); setPage(1) }}><option value="">Semua Kecamatan</option>{kecamatanList.map(k => <option key={k} value={k}>{k}</option>)}</select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '140px', width: 'auto' }} value={filterDesa} onChange={e => { setFilterDesa(e.target.value); setPage(1) }}><option value="">Semua Desa</option>{desaList.map(d => <option key={d} value={d}>{d}</option>)}</select>
          {(filterSite || filterKecamatan || filterDesa || searchQuery)
            ? <button className="btn btn-secondary btn-sm" style={{ height: '34px', whiteSpace: 'nowrap' }} onClick={() => { setFilterSite(''); setFilterKecamatan(''); setFilterDesa(''); setSearchQuery(''); setPage(1) }}>Reset</button>
            : <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>{filtered.length} data</div>
          }
        </div>
      </div>

      {/* BULK DELETE */}
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
                  <>
                    <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setBulkMenuOpen(false); openBulkDeleteModal('selected') }}><CheckSquare size={14} /> Hapus Yang Dipilih ({selectedIds.size})</button>
                    <button className="dropdown-item" style={{ width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { clearSelection(); setBulkMenuOpen(false) }}><Square size={14} /> Batal Pilih</button>
                    <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                  </>
                )}
                <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'rgba(239,68,68,0.08)', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setBulkMenuOpen(false); openBulkDeleteModal('all') }}><Trash2 size={14} /> Hapus SEMUA Data Server</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* TABLE */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }} className="desktop-table">
          <table className="table" style={{ minWidth: '960px', fontSize: '13px' }}>
            <thead>
              <tr>
                {role === 'superadmin' && <th style={{ width: '36px', textAlign: 'center', cursor: 'pointer' }} onClick={toggleSelectAll}>{paginated.length > 0 && paginated.every(p => selectedIds.has(p.id)) ? <CheckSquare size={14} style={{ color: 'var(--accent)' }} /> : <Square size={14} style={{ opacity: 0.4 }} />}</th>}
                <th style={{ width: '40px', textAlign: 'center' }}>No</th>
                <th style={{ cursor: 'pointer', minWidth: '160px' }} onClick={() => handleSort('server_id')}><div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>Server ID <SortIcon col="server_id" /></div></th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('nama_server')}><div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>Nama Server <SortIcon col="nama_server" /></div></th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kecamatan')}><div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>Kecamatan <SortIcon col="kecamatan" /></div></th>
                <th>Desa</th>
                <th style={{ width: '120px' }}>Koordinat</th>
                <th style={{ width: '55px' }}>Maps</th>
                <th>Keterangan</th>
                <th style={{ width: '100px' }}>Input Oleh</th>
                <th style={{ cursor: 'pointer', width: '100px' }} onClick={() => handleSort('created_at')}><div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>Tgl Input <SortIcon col="created_at" /></div></th>
                {['admin', 'superadmin', 'teknisi'].includes(role) && <th style={{ width: '60px', textAlign: 'center' }}>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: '30px' }}>Memuat data...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>Tidak ada data server ditemukan</td></tr>
              ) : (
                paginated.map((p, i) => (
                  <tr key={p.id}>
                    {role === 'superadmin' && (
                      <td style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSelect(p.id)}>
                        {selectedIds.has(p.id) ? <CheckSquare size={14} style={{ color: 'var(--accent)' }} /> : <Square size={14} style={{ opacity: 0.3 }} />}
                      </td>
                    )}
                    <td style={{ textAlign: 'center' }}>{(page - 1) * perPage + i + 1}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.server_id}</td>
                    <td>{p.nama_server}</td>
                    <td>{p.kecamatan}</td>
                    <td>{p.desa}</td>
                    <td style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {p.latitude && p.longitude ? (
                        <><div>{p.latitude}</div><div>{p.longitude}</div></>
                      ) : '-'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {p.maps_url ? (
                        <a href={p.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: '#ef4444', display: 'inline-flex', padding: '4px', background: 'rgba(239,68,68,0.1)', borderRadius: '4px' }} title="Buka di Maps"><ExternalLink size={14} /></a>
                      ) : '-'}
                    </td>
                    <td><div style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.keterangan}>{p.keterangan || '-'}</div></td>
                    <td style={{ fontSize: '11px' }}>{getUserName(p.created_by)}</td>
                    <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{format(new Date(p.created_at), 'dd/MM/yy HH:mm')}</td>
                    {['admin', 'superadmin', 'teknisi'].includes(role) && (
                      <td>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button className="btn-icon" onClick={() => openEdit(p)} title="Edit"><Edit2 size={13} /></button>
                          {['admin', 'superadmin'].includes(role) && (
                            <button className="btn-icon danger" onClick={() => setConfirmDelete(p)} title="Hapus"><Trash2 size={13} /></button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* MODAL FORM */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3>{editingId ? 'Edit Data Server' : 'Tambah Data Server'}</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px' }}>
                <div className="form-group">
                  <label>Site</label>
                  <select className="form-input" value={form.site} onChange={e => setForm({ ...form, site: e.target.value })}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {!editingId && (
                  <div className="form-group">
                    <label>Server ID <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)', fontSize: '11px' }}>(Opsional)</span></label>
                    <input className="form-input" value={form.server_id_manual} onChange={e => setForm({ ...form, server_id_manual: e.target.value })} placeholder={itemIdPreview || 'Otomatis...'} />
                    {itemIdPreview && !form.server_id_manual && <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '4px' }}>Preview: {itemIdPreview}</div>}
                  </div>
                )}
                <div className="form-group">
                  <label>Nama Server <span className="text-danger">*</span></label>
                  <input className="form-input" value={form.nama_server} onChange={e => setForm({ ...form, nama_server: e.target.value })} placeholder="Cth: Server Pusat Kroya" />
                </div>
              </div>

              <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div className="form-group">
                    <label>Provinsi</label>
                    <SearchableSelect value={form.provinsi} onChange={val => setForm(f => ({ ...f, provinsi: val, kabupaten: '', kecamatan: '', desa: '' }))} options={provinsiOpts.map(o => ({ value: o, label: o }))} placeholder="Pilih/Ketik Provinsi" />
                  </div>
                  <div className="form-group">
                    <label>Kabupaten/Kota</label>
                    <SearchableSelect value={form.kabupaten} onChange={val => setForm(f => ({ ...f, kabupaten: val, kecamatan: '', desa: '' }))} options={kabupatenOpts.map(o => ({ value: o, label: o }))} placeholder="Pilih/Ketik Kabupaten" />
                  </div>
                  <div className="form-group">
                    <label>Kecamatan <span className="text-danger">*</span></label>
                    <SearchableSelect value={form.kecamatan} onChange={val => setForm(f => ({ ...f, kecamatan: val, desa: '' }))} options={kecamatanOpts.map(o => ({ value: o, label: o }))} placeholder="Pilih/Ketik Kecamatan" />
                  </div>
                  <div className="form-group">
                    <label>Desa/Kelurahan <span className="text-danger">*</span></label>
                    <SearchableSelect value={form.desa} onChange={val => setForm(f => ({ ...f, desa: val }))} options={desaOpts.map(o => ({ value: o, label: o }))} placeholder="Pilih/Ketik Desa" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Jalan/Dusun</label>
                  <input className="form-input" value={form.jalan} onChange={e => setForm({ ...form, jalan: e.target.value })} placeholder="Cth: Jl. Raya Timur" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>URL Google Maps</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input className="form-input" value={form.maps_url} onChange={e => setForm({ ...form, maps_url: e.target.value })} placeholder="Paste link maps di sini" />
                    <button className="btn btn-secondary" onClick={handleExtractCoords} type="button" style={{ whiteSpace: 'nowrap' }}>Ekstrak Koord</button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Latitude</label>
                  <input className="form-input" type="number" step="any" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} placeholder="-7.xxx" />
                </div>
                <div className="form-group">
                  <label>Longitude</label>
                  <input className="form-input" type="number" step="any" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} placeholder="109.xxx" />
                </div>
              </div>

              <div className="form-group">
                <label>Keterangan</label>
                <textarea className="form-input" value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} rows={3} placeholder="Catatan tambahan (opsional)" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE */}
      {confirmDelete && (
        <div className="modal-overlay" style={{ zIndex: 110 }}>
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header" style={{ borderBottom: 'none' }}>
              <h3 style={{ color: 'var(--danger)' }}>Konfirmasi Hapus</h3>
            </div>
            <div className="modal-body">
              <p>Yakin ingin menghapus Server <strong>{confirmDelete.server_id}</strong> - <strong>{confirmDelete.nama_server}</strong>?</p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Tindakan ini tidak dapat dibatalkan.</p>
            </div>
            <div className="modal-footer" style={{ borderTop: 'none', paddingTop: 0 }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Batal</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => handleDelete(confirmDelete)}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM BULK DELETE */}
      {bulkDeleteModal && (
        <div className="modal-overlay" style={{ zIndex: 110 }}>
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: '10px' }}>
              <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}><Trash2 size={20} /> Konfirmasi Hapus Massal</h3>
            </div>
            <div className="modal-body" style={{ padding: '0 20px' }}>
              <p style={{ margin: '0 0 10px', fontSize: '14px' }}>Anda akan menghapus secara permanen:</p>
              <div style={{ background: 'rgba(239,68,68,0.1)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--danger)', color: 'var(--danger)', fontWeight: 700, fontSize: '15px', textAlign: 'center', marginBottom: '16px' }}>{bulkDeleteModal.label}</div>
              <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--text-secondary)' }}>Tindakan ini <b>TIDAK BISA DIBATALKAN</b>. Data yang dihapus tidak dapat dipulihkan kembali.</p>
              <div className="form-group">
                <label style={{ color: 'var(--danger)' }}>Ketik "<b>{bulkDeleteModal.mode.startsWith('all') ? 'HAPUS SEMUA' : 'HAPUS'}</b>" untuk melanjutkan:</label>
                <input className="form-input" style={{ borderColor: bulkDeleteConfirmText === (bulkDeleteModal.mode.startsWith('all') ? 'HAPUS SEMUA' : 'HAPUS') ? 'var(--danger)' : '' }} value={bulkDeleteConfirmText} onChange={e => setBulkDeleteConfirmText(e.target.value)} placeholder="..." autoFocus />
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: 'none', paddingTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setBulkDeleteModal(null)}>Batal</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff', opacity: bulkDeleteConfirmText === (bulkDeleteModal.mode.startsWith('all') ? 'HAPUS SEMUA' : 'HAPUS') ? 1 : 0.5 }} onClick={handleBulkDelete} disabled={bulkDeleteConfirmText !== (bulkDeleteModal.mode.startsWith('all') ? 'HAPUS SEMUA' : 'HAPUS')}>Hapus Permanen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

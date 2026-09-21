import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import Pagination from '../../components/common/Pagination'
import { Plus, X, Edit2, Trash2, MapPin, Search, Download, ChevronDown, ChevronUp, ExternalLink, Upload, FileSpreadsheet, AlertTriangle, Settings as SettingsIcon, CheckSquare, Square, Eraser } from 'lucide-react'
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

const EMPTY_FORM = {
  site: 'banyumas',
  coilan_id_manual: '',
  panjang_meter: '',
  pole_id: '',
  provinsi: 'Jawa Tengah',
  kabupaten: 'Banyumas',
  kecamatan: '',
  desa: '',
  jalan: '',
  maps_url: '',
  longitude: '',
  latitude: '',
  keterangan: '',
}

const DEFAULT_FORMAT = 'NAT/{SITE_CODE}/COILAN/{DESA}/{NO}'

function generateCoilanId(site, desa, existingItems, formatTemplate = DEFAULT_FORMAT) {
  if (!desa) return ''
  const siteCode = SITE_CODE[site] || 'BMS'
  const desaSlug = desa.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').substring(0, 15)
  
  const sameDesaItems = existingItems.filter(
    p => p.site === site && p.desa?.toUpperCase().trim() === desa.toUpperCase().trim() && p.coilan_id
  )

  const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let regexPattern = escapeRegExp(formatTemplate)
    .replace('\\{SITE_CODE\\}', escapeRegExp(siteCode))
    .replace('\\{DESA\\}', escapeRegExp(desaSlug))
    .replace('\\{NO\\}', '(\\d+)')

  const idRegex = new RegExp(`^${regexPattern}$`, 'i')

  let maxNo = 0
  for (const p of sameDesaItems) {
    const match = p.coilan_id.match(idRegex)
    if (match && match[1]) {
      const num = parseInt(match[1], 10)
      if (num > maxNo) maxNo = num
    }
  }

  if (maxNo === 0 && sameDesaItems.length > 0) {
    for (const p of sameDesaItems) {
      const match = p.coilan_id.match(/\d+$/)
      if (match) {
        const num = parseInt(match[0], 10)
        if (num > maxNo) maxNo = num
      }
    }
  }

  if (maxNo === 0) maxNo = sameDesaItems.length

  const no = String(maxNo + 1).padStart(3, '0')
  return formatTemplate
    .replace(/{SITE_CODE}/g, siteCode)
    .replace(/{DESA}/g, desaSlug)
    .replace(/{NO}/g, no)
}

function parseMapsUrl(url) {
  if (!url) return null
  const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { latitude: m[1], longitude: m[2] }
  const m2 = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m2) return { latitude: m2[1], longitude: m2[2] }
  return null
}

export default function DataCoilan() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const importRef = useRef(null)

  const [items, setItems] = useState([])
  const [poles, setPoles] = useState([])
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

  // Bulk Delete
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkDeleteModal, setBulkDeleteModal] = useState(null)
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('')
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false)

  // Import Excel
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importRows, setImportRows] = useState([])

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
          .from('network_coilan')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + step - 1)
          
        if (error) throw error
        if (data && data.length > 0) {
          allItems = [...allItems, ...data]
          if (data.length < step) break
          from += step
        } else break
      }

      let allPoles = []
      let poleFrom = 0
      while (true) {
        const { data, error } = await supabase
          .from('network_poles')
          .select('id, pole_id, site, desa, kecamatan')
          .order('id', { ascending: true })
          .range(poleFrom, poleFrom + step - 1)
          
        if (error) throw error
        if (data && data.length > 0) {
          allPoles = [...allPoles, ...data]
          if (data.length < step) break
          poleFrom += step
        } else break
      }

      const usersRes = await supabase.from('users').select('id, full_name')
      
      setItems(allItems)
      setPoles(allPoles)
      if (usersRes.data) setUsers(usersRes.data)
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
        p.coilan_id?.toLowerCase().includes(q) || 
        p.desa?.toLowerCase().includes(q) || 
        p.kecamatan?.toLowerCase().includes(q) || 
        p.keterangan?.toLowerCase().includes(q)
      )
    }
    data.sort((a, b) => {
      let va = a[sortKey] ?? '', vb = b[sortKey] ?? ''
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
    })
    return data
  }, [items, filterSite, filterKecamatan, filterDesa, searchQuery, sortKey, sortDir])

  const paginated = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page])
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
      panjang_meter: item.panjang_meter || '',
      pole_id: item.pole_id || '',
      provinsi: item.provinsi || '', kabupaten: item.kabupaten || '',
      kecamatan: item.kecamatan || '', desa: item.desa || '',
      jalan: item.jalan || '',
      maps_url: item.maps_url || '', longitude: item.longitude || '', latitude: item.latitude || '',
      keterangan: item.keterangan || '',
    })
    setIsModalOpen(true)
  }

  const handleExtractCoords = () => {
    const coords = parseMapsUrl(form.maps_url)
    if (coords) {
      setForm(f => ({ ...f, latitude: coords.latitude, longitude: coords.longitude }))
      toast.success('Koordinat berhasil diekstrak!')
    } else toast.error('Koordinat tidak ditemukan. Masukkan manual.')
  }

  const handleSave = async () => {
    if (!form.kecamatan?.trim()) return toast.error('Kecamatan wajib diisi!')
    if (!form.desa?.trim()) return toast.error('Desa/Kelurahan wajib diisi!')
    
    setSaving(true)
    try {
      const payload = {
        ...form,
        panjang_meter: form.panjang_meter ? parseInt(form.panjang_meter, 10) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        latitude: form.latitude ? Number(form.latitude) : null,
        updated_by: profile.id,
      }
      delete payload.coilan_id_manual

      if (editingId) {
        const { error } = await supabase.from('network_coilan').update(payload).eq('id', editingId)
        if (error) throw error
        toast.success('Data Coilan diperbarui!')
      } else {
        const newId = form.coilan_id_manual?.trim() || generateCoilanId(form.site, form.desa, items)
        const { error } = await supabase.from('network_coilan').insert({ ...payload, coilan_id: newId, created_by: profile.id })
        if (error) throw error
        toast.success(`Coilan ${newId} ditambahkan!`)
      }
      setIsModalOpen(false)
      fetchData()
    } catch (e) { toast.error(e.message || 'Terjadi kesalahan') }
    finally { setSaving(false) }
  }

  const handleDelete = async (item) => {
    try {
      const { error } = await supabase.from('network_coilan').delete().eq('id', item.id)
      if (error) throw error
      toast.success('Data coilan dihapus')
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

  const openBulkDeleteModal = (mode) => {
    if (mode === 'selected') {
      if (selectedIds.size === 0) return toast.error('Tidak ada data yang dipilih!')
      setBulkDeleteModal({ mode, label: `${selectedIds.size} coilan yang dipilih`, filter: null })
    } else if (mode === 'all') {
      setBulkDeleteModal({ mode, label: `SELURUH DATA COILAN`, filter: null })
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
        targetIds = items.map(i => i.id)
      }

      if (targetIds.length === 0) return toast.error('Tidak ada data yang cocok untuk dihapus!')

      const chunkSize = 200
      for (let i = 0; i < targetIds.length; i += chunkSize) {
        const chunk = targetIds.slice(i, i + chunkSize)
        const { error } = await supabase.from('network_coilan').delete().in('id', chunk)
        if (error) throw error
      }

      toast.success(`${targetIds.length} coilan berhasil dihapus!`)
      setSelectedIds(new Set())
      fetchData()
    } catch (e) {
      toast.error('Gagal menghapus: ' + e.message)
    }
  }

  const handleExportExcel = () => {
    if (filtered.length === 0) return toast.error('Tidak ada data')
    setTimeout(() => {
      const rows = filtered.map((p, i) => {
        const linkedPole = poles.find(pol => pol.id === p.pole_id)
        return {
          'No': i + 1, 'Site': SITES.find(s => s.value === p.site)?.label || p.site,
          'Coilan ID': p.coilan_id || '', 
          'Panjang (m)': p.panjang_meter || '',
          'Tiang ID': linkedPole ? linkedPole.pole_id : '',
          'Provinsi': p.provinsi || '', 'Kabupaten/Kota': p.kabupaten || '', 'Kecamatan': p.kecamatan || '',
          'Desa/Kelurahan': p.desa || '', 'Jalan/Gang/Dusun': p.jalan || '', 'Maps URL': p.maps_url || '',
          'Latitude': p.latitude || '', 'Longitude': p.longitude || '',
          'Keterangan': p.keterangan || '', 'Diinput Oleh': getUserName(p.created_by),
          'Tanggal Input': p.created_at ? format(new Date(p.created_at), 'dd/MM/yyyy HH:mm') : '',
        }
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Data Coilan')
      XLSX.writeFile(wb, `Data Coilan ${format(new Date(), 'dd-MM-yyyy')}.xlsx`)
      toast.success('Export Excel berhasil!')
    }, 500)
  }

  const handleDownloadTemplate = () => {
    const template = [{
      'Site': 'BANYUMAS',
      'Coilan ID': '', // Opsional
      'Panjang (m)': '50',
      'Tiang ID': 'NAT/BMS/POLE/MUJUR/001',
      'Provinsi': 'JAWA TENGAH', 'Kabupaten/Kota': 'CILACAP',
      'Kecamatan': 'KROYA', 'Desa/Kelurahan': 'MUJUR', 'Jalan/Gang/Dusun': 'Gg. BIMA',
      'Maps URL': '',
      'Latitude': '',
      'Longitude': '',
      'Keterangan': 'Contoh import'
    }]
    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, `Template Import Coilan ${format(new Date(), 'dd-MM-yyyy')}.xlsx`)
    toast.success('Template berhasil diunduh!')
  }

  const handleImportFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws)
        
        const mapped = rows.map((r, i) => {
          let lat = r['Latitude'] ? Number(r['Latitude']) : null
          let lon = r['Longitude'] ? Number(r['Longitude']) : null
          
          let mapsUrl = r['Maps URL'] || ''
          if (!mapsUrl && lat && lon) mapsUrl = `http://maps.google.com/?q=${lat},${lon}`
          
          const tiangRef = (r['Tiang ID'] || '').trim()
          let foundPoleId = null
          if (tiangRef) {
            const matchPole = poles.find(p => p.pole_id === tiangRef)
            if (matchPole) foundPoleId = matchPole.id
          }

          return {
            _rowNo: i + 2,
            coilan_id_manual: (r['Coilan ID'] || '').trim(),
            site: (r['Site'] || 'banyumas').toLowerCase().trim(),
            panjang_meter: r['Panjang (m)'] ? parseInt(r['Panjang (m)'], 10) : null,
            pole_id: foundPoleId,
            pole_id_raw: tiangRef,
            provinsi: (r['Provinsi'] || 'Jawa Tengah').trim(),
            kabupaten: (r['Kabupaten/Kota'] || 'Banyumas').trim(),
            kecamatan: (r['Kecamatan'] || '').trim(),
            desa: (r['Desa/Kelurahan'] || '').trim(),
            jalan: (r['Jalan/Gang/Dusun'] || '').trim(),
            maps_url: mapsUrl,
            latitude: lat,
            longitude: lon,
            keterangan: (r['Keterangan'] || '').trim(),
            _selected: !!r['Kecamatan'] && !!r['Desa/Kelurahan'],
            _error: (!r['Kecamatan'] || !r['Desa/Kelurahan']) ? 'Kecamatan/Desa kosong' : null
          }
        })

        setImportRows(mapped)
        setIsImportModalOpen(true)
      } catch (err) { toast.error('Gagal membaca file Excel') }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const processImport = async () => {
    const toImport = importRows.filter(r => r._selected && !r._error)
    if (toImport.length === 0) return toast.error('Tidak ada data valid yang dipilih')
    
    setSaving(true)
    try {
      let currentItems = [...items]
      const chunkSize = 50
      
      for (let i = 0; i < toImport.length; i += chunkSize) {
        const chunk = toImport.slice(i, i + chunkSize)
        const payload = chunk.map(r => {
          const cId = r.coilan_id_manual || generateCoilanId(r.site, r.desa, currentItems)
          const newItem = {
            coilan_id: cId, site: r.site, panjang_meter: r.panjang_meter, pole_id: r.pole_id,
            provinsi: r.provinsi, kabupaten: r.kabupaten, kecamatan: r.kecamatan, desa: r.desa,
            jalan: r.jalan, maps_url: r.maps_url, latitude: r.latitude, longitude: r.longitude,
            keterangan: r.keterangan, created_by: profile.id
          }
          currentItems.push(newItem)
          return newItem
        })

        const { error } = await supabase.from('network_coilan').insert(payload)
        if (error) throw error
      }
      
      toast.success(`${toImport.length} data coilan berhasil diimport!`)
      setIsImportModalOpen(false)
      fetchData()
    } catch (err) { toast.error('Terjadi kesalahan saat import: ' + err.message) }
    finally { setSaving(false) }
  }

  // Options for modal dropdowns
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

  return (
    <div className="page-container">
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 700 }}>
            <img src="/icon_coilan.png" alt="coilan" style={{ width: "24px", height: "24px", objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.8 }} />
            Data Coilan
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Jaringan Fiber — Pencatatan & Manajemen Data Coilan</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['admin', 'superadmin', 'teknisi'].includes(role) && (
            <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={14} /> Tambah</button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}><FileSpreadsheet size={14} /> Template</button>
          {['admin', 'superadmin'].includes(role) && (
            <button className="btn btn-secondary btn-sm" onClick={() => importRef.current?.click()}><Upload size={14} /> Import</button>
          )}
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportFile} />
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
                  <Trash2 size={14} /> Hapus SEMUA DATA COILAN
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
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('coilan_id')}>Coilan ID <SortIcon col="coilan_id" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('panjang_meter')}>Panjang (m) <SortIcon col="panjang_meter" /></th>
                  <th>Tiang Terkait</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kecamatan')}>Kecamatan <SortIcon col="kecamatan" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('desa')}>Desa <SortIcon col="desa" /></th>
                  <th>Lokasi (Lat/Lon)</th>
                  <th>Maps</th>
                  <th>Keterangan</th>
                  <th>Dibuat Oleh</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>Tanggal <SortIcon col="created_at" /></th>
                  <th style={{ width: '80px' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((item, idx) => {
                  const linkedPole = poles.find(p => p.id === item.pole_id)
                  return (
                    <tr key={item.id} style={{ background: selectedIds.has(item.id) ? 'rgba(59,130,246,0.06)' : undefined }}>
                      {role === 'superadmin' && (
                        <td style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSelect(item.id)}>
                          {selectedIds.has(item.id) ? <CheckSquare size={14} style={{ color: 'var(--accent)' }} /> : <Square size={14} style={{ opacity: 0.4 }} />}
                        </td>
                      )}
                      <td style={{ color: 'var(--text-secondary)' }}>{(page - 1) * perPage + idx + 1}</td>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{item.coilan_id}</span></td>
                      <td>{item.panjang_meter ? item.panjang_meter + ' m' : '-'}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{linkedPole ? linkedPole.pole_id : '-'}</td>
                      <td>{item.kecamatan || '-'}</td>
                      <td>{item.desa || '-'}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {item.latitude && item.longitude ? (Number(item.latitude).toFixed(5) + ', ' + Number(item.longitude).toFixed(5)) : '-'}
                      </td>
                      <td>
                        {item.maps_url ? (
                          <a href={item.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <MapPin size={12} /><ExternalLink size={11} />
                          </a>
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
                    <label className="form-label">ID Coilan Manual</label>
                    <input className="form-input" placeholder="Biarkan kosong untuk auto-generate" value={form.coilan_id_manual || ''} onChange={e => setForm(f => ({ ...f, coilan_id_manual: e.target.value }))} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Panjang (meter)</label>
                  <input className="form-input" type="number" placeholder="cth: 50" value={form.panjang_meter} onChange={e => setForm(f => ({ ...f, panjang_meter: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tiang Terkait (Opsional)</label>
                  <SearchableSelect value={form.pole_id} onChange={val => setForm(f => ({ ...f, pole_id: val }))} options={poles.map(p => ({ value: p.id, label: p.pole_id + (p.desa ? ' - ' + p.desa : '') }))} placeholder="Pilih tiang yang terhubung..." />
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
                        <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{r.coilan_id_manual || <span style={{ color: 'var(--text-secondary)' }}>auto</span>}</td>
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
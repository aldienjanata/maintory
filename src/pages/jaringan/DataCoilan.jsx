import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import Pagination from '../../components/common/Pagination'
import { Plus, X, Edit2, Trash2, MapPin, Search, Download, ChevronDown, ChevronUp, ExternalLink, Upload, FileSpreadsheet, AlertTriangle, Settings as SettingsIcon } from 'lucide-react'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import * as XLSX from 'xlsx'

const SITES = [
  { value: 'banyumas', label: 'Banyumas' },
  { value: 'cilacap', label: 'Cilacap' },
  { value: 'cilacap_herman', label: 'Cilacap (Herman)' },
]
const SITE_CODE = { banyumas: 'BMS', cilacap: 'CLP', cilacap_herman: 'CLH' }

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
    <div className="p-4 max-w-[1600px] mx-auto space-y-4">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center border border-indigo-100">
            <img src="/icon_coilan.png" alt="Coilan" className="w-6 h-6 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = '/icon_tiang.png' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Data Coilan</h1>
            <p className="text-sm text-slate-500">Kelola inventaris Coilan FO jaringan</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {role === 'superadmin' && (
            <div className="relative">
              <button onClick={() => setBulkMenuOpen(!bulkMenuOpen)} className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 font-medium text-sm transition-colors border border-rose-200">
                <Trash2 size={16} /> Aksi Massal <ChevronDown size={14} className={`transform transition-transform ${bulkMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {bulkMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setBulkMenuOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 z-20 py-2">
                    <button onClick={() => { setBulkMenuOpen(false); openBulkDeleteModal('selected') }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <CheckSquare size={14} /> Hapus yang Dipilih ({selectedIds.size})
                    </button>
                    <div className="h-px bg-slate-100 my-1"></div>
                    <button onClick={() => { setBulkMenuOpen(false); openBulkDeleteModal('all') }} className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 font-medium flex items-center gap-2">
                      <AlertTriangle size={14} /> Kosongkan Semua Data
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="relative">
            <button onClick={() => setExcelMenuOpen(!excelMenuOpen)} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 font-medium text-sm transition-colors border border-emerald-200">
              <FileSpreadsheet size={16} /> Excel <ChevronDown size={14} className={`transform transition-transform ${excelMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {excelMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExcelMenuOpen(false)}></div>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-20 overflow-hidden py-1">
                  <button onClick={() => { setExcelMenuOpen(false); handleExportExcel() }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"><Download size={14}/> Export ke Excel</button>
                  <button onClick={() => { setExcelMenuOpen(false); handleDownloadTemplate() }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"><FileSpreadsheet size={14}/> Unduh Template</button>
                  <button onClick={() => { setExcelMenuOpen(false); importRef.current?.click() }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"><Upload size={14}/> Import Excel</button>
                  <input type="file" ref={importRef} accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
                </div>
              </>
            )}
          </div>
          
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition-colors shadow-sm shadow-indigo-200">
            <Plus size={16} /> Tambah Data
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Cari Coilan ID, Desa, Kec, Keterangan..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm" />
        </div>
        <select value={filterSite} onChange={(e) => { setFilterSite(e.target.value); setPage(1) }} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 min-w-[140px]">
          <option value="">Semua Site</option>
          {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterKecamatan} onChange={(e) => { setFilterKecamatan(e.target.value); setFilterDesa(''); setPage(1) }} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 min-w-[150px]">
          <option value="">Semua Kecamatan</option>
          {kecamatanList.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={filterDesa} onChange={(e) => { setFilterDesa(e.target.value); setPage(1) }} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 min-w-[150px]" disabled={!filterKecamatan}>
          <option value="">Semua Desa</option>
          {desaList.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200/80">
              <tr>
                {role === 'superadmin' && (
                  <th className="px-4 py-3 w-10 text-center">
                    <input type="checkbox" checked={paginated.length > 0 && paginated.every(p => selectedIds.has(p.id))} onChange={toggleSelectAll} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                  </th>
                )}
                <th className="px-4 py-3 w-14 text-center">No</th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('coilan_id')}><div className="flex items-center gap-2">Coilan ID <SortIcon col="coilan_id" /></div></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('panjang_meter')}><div className="flex items-center gap-2">Panjang (m) <SortIcon col="panjang_meter" /></div></th>
                <th className="px-4 py-3">Tiang Terkait</th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('kecamatan')}><div className="flex items-center gap-2">Kecamatan <SortIcon col="kecamatan" /></div></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('desa')}><div className="flex items-center gap-2">Desa <SortIcon col="desa" /></div></th>
                <th className="px-4 py-3">Lokasi (Lat/Lon)</th>
                <th className="px-4 py-3 text-center">Maps</th>
                <th className="px-4 py-3">Keterangan</th>
                <th className="px-4 py-3">Dibuat Oleh</th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('created_at')}><div className="flex items-center gap-2">Tanggal <SortIcon col="created_at" /></div></th>
                <th className="px-4 py-3 text-center sticky right-0 bg-slate-50 border-l border-slate-200">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr><td colSpan="13" className="px-4 py-8 text-center text-slate-500">Memuat data...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan="13" className="px-4 py-8 text-center text-slate-500">Tidak ada data ditemukan</td></tr>
              ) : (
                paginated.map((item, idx) => {
                  const linkedPole = poles.find(p => p.id === item.pole_id)
                  const isSelected = selectedIds.has(item.id)
                  return (
                    <tr key={item.id} className={`hover:bg-indigo-50/30 transition-colors ${isSelected ? 'bg-indigo-50/50' : ''}`}>
                      {role === 'superadmin' && (
                        <td className="px-4 py-3 text-center">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                        </td>
                      )}
                      <td className="px-4 py-3 text-center text-slate-500">{(page - 1) * perPage + idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{item.coilan_id}</td>
                      <td className="px-4 py-3">{item.panjang_meter ? `${item.panjang_meter} m` : '-'}</td>
                      <td className="px-4 py-3">
                        {linkedPole ? (
                          <div className="flex items-center gap-1.5 text-slate-600 bg-slate-100 px-2 py-1 rounded w-max">
                            <span className="font-medium text-xs">{linkedPole.pole_id}</span>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3">{item.kecamatan || '-'}</td>
                      <td className="px-4 py-3">{item.desa || '-'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                        {item.latitude && item.longitude ? `${item.latitude}, ${item.longitude}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.maps_url ? (
                          <a href={item.maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                            <MapPin size={16} />
                          </a>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={item.keterangan}>{item.keterangan || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{getUserName(item.created_by)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{format(new Date(item.created_at), 'dd MMM yyyy HH:mm', { locale: localeId })}</td>
                      <td className="px-4 py-3 sticky right-0 bg-white border-l border-slate-100 shadow-[-4px_0_12px_rgba(0,0,0,0.02)]">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openEdit(item)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Edit"><Edit2 size={16} /></button>
                          {(role === 'superadmin') && (
                            <button onClick={() => setConfirmDelete(item)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Hapus"><Trash2 size={16} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-200/80 bg-slate-50">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>

      {/* MODAL ADD/EDIT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800">{editingId ? 'Edit Data Coilan' : 'Tambah Data Coilan'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-xl"><X size={20} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Basic Info */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-700 pb-2 border-b border-slate-100">Informasi Dasar</h3>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Site Wilayah *</label>
                    <select value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                      {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  {!editingId && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Coilan ID (Opsional)</label>
                      <input type="text" value={form.coilan_id_manual} onChange={e => setForm(f => ({ ...f, coilan_id_manual: e.target.value.toUpperCase() }))} placeholder="Kosongkan untuk Auto-Generate" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-400" />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Panjang (meter)</label>
                    <input type="number" value={form.panjang_meter} onChange={e => setForm(f => ({ ...f, panjang_meter: e.target.value }))} placeholder="Misal: 50" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tiang Terkait</label>
                    <SearchableSelect
                      value={form.pole_id}
                      onChange={val => setForm(f => ({ ...f, pole_id: val }))}
                      options={poles.map(p => ({ value: p.id, label: p.pole_id + (p.desa ? ` (${p.desa})` : '') }))}
                      placeholder="Pilih Tiang..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Keterangan</label>
                    <textarea rows="3" value={form.keterangan} onChange={e => setForm(f => ({ ...f, keterangan: e.target.value }))} placeholder="Catatan tambahan..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-400" />
                  </div>
                </div>

                {/* Lokasi */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-700 pb-2 border-b border-slate-100">Lokasi / Alamat</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Provinsi</label>
                      <SearchableSelect
                        value={form.provinsi}
                        onChange={val => setForm(f => ({ ...f, provinsi: val, kabupaten: '', kecamatan: '', desa: '' }))}
                        options={provinsiOpts.length > 0 ? provinsiOpts.map(p => ({ value: p, label: p })) : [{ value: 'Jawa Tengah', label: 'Jawa Tengah' }]}
                        placeholder="Pilih/Ketik Provinsi"
                        creatable
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Kabupaten/Kota</label>
                      <SearchableSelect
                        value={form.kabupaten}
                        onChange={val => setForm(f => ({ ...f, kabupaten: val, kecamatan: '', desa: '' }))}
                        options={kabupatenOpts.length > 0 ? kabupatenOpts.map(p => ({ value: p, label: p })) : [{ value: 'Banyumas', label: 'Banyumas' }, { value: 'Cilacap', label: 'Cilacap' }]}
                        placeholder="Pilih/Ketik Kab/Kota"
                        creatable
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Kecamatan *</label>
                      <SearchableSelect
                        value={form.kecamatan}
                        onChange={val => setForm(f => ({ ...f, kecamatan: val, desa: '' }))}
                        options={kecamatanOpts.map(p => ({ value: p, label: p }))}
                        placeholder="Ketik Kecamatan..."
                        creatable
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Desa/Kelurahan *</label>
                      <SearchableSelect
                        value={form.desa}
                        onChange={val => setForm(f => ({ ...f, desa: val }))}
                        options={desaOpts.map(p => ({ value: p, label: p }))}
                        placeholder="Ketik Desa..."
                        creatable
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Jalan/Gang/Dusun</label>
                    <input type="text" value={form.jalan} onChange={e => setForm(f => ({ ...f, jalan: e.target.value }))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex justify-between">
                      <span>Maps URL</span>
                      <button type="button" onClick={handleExtractCoords} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Extract Lat/Lon</button>
                    </label>
                    <input type="text" value={form.maps_url} onChange={e => setForm(f => ({ ...f, maps_url: e.target.value }))} placeholder="Paste link Google Maps..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Latitude</label>
                      <input type="text" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} placeholder="-7.xxxxx" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 font-mono" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Longitude</label>
                      <input type="text" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} placeholder="109.xxxxx" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 font-mono" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
              <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors">Batal</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {saving ? 'Menyimpan...' : 'Simpan Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRM DELETE */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Hapus Data?</h3>
            <p className="text-slate-600 text-sm mb-6">Apakah Anda yakin ingin menghapus data <b>{confirmDelete.coilan_id}</b>? Data yang dihapus tidak dapat dikembalikan.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">Batal</button>
              <button onClick={() => handleDelete(confirmDelete)} className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium transition-colors">Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BULK DELETE */}
      {bulkDeleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center"><AlertTriangle size={20} /></div>
              <h3 className="text-lg font-bold text-slate-800">Konfirmasi Hapus Massal</h3>
            </div>
            <p className="text-slate-600 text-sm mb-4">
              Anda akan menghapus secara permanen <b>{bulkDeleteModal.label}</b>. 
              Tindakan ini sangat berisiko dan tidak dapat dibatalkan.
            </p>
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-5">
              <p className="text-xs text-rose-800 font-medium mb-2">Ketik <b>{bulkDeleteModal.mode === 'all' ? 'HAPUS SEMUA' : 'HAPUS'}</b> untuk melanjutkan:</p>
              <input type="text" value={bulkDeleteConfirmText} onChange={e => setBulkDeleteConfirmText(e.target.value)} className="w-full px-3 py-2 border border-rose-300 rounded bg-white text-sm focus:outline-none focus:border-rose-500" placeholder="Ketik di sini..." />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setBulkDeleteModal(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">Batal</button>
              <button onClick={handleBulkDelete} className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium transition-colors">Konfirmasi Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORT */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800">Review Import Data Coilan</h2>
              <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-xl"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-0">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 w-10 text-center"><input type="checkbox" checked={importRows.length > 0 && importRows.every(r => r._selected || r._error)} onChange={e => { const checked = e.target.checked; setImportRows(prev => prev.map(r => r._error ? r : { ...r, _selected: checked })) }} className="rounded border-slate-300" /></th>
                    <th className="px-4 py-3">Baris</th>
                    <th className="px-4 py-3">Coilan ID</th>
                    <th className="px-4 py-3">Tiang ID</th>
                    <th className="px-4 py-3">Site</th>
                    <th className="px-4 py-3">Kecamatan / Desa</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {importRows.map((r, i) => (
                    <tr key={i} className={r._error ? 'bg-rose-50/50' : (!r._selected ? 'opacity-50' : '')}>
                      <td className="px-4 py-2 text-center">
                        <input type="checkbox" disabled={!!r._error} checked={r._selected} onChange={e => { const checked = e.target.checked; setImportRows(prev => { const n = [...prev]; n[i]._selected = checked; return n }) }} className="rounded border-slate-300" />
                      </td>
                      <td className="px-4 py-2 font-medium">{r._rowNo}</td>
                      <td className="px-4 py-2">{r.coilan_id_manual || <span className="text-slate-400 italic">Auto-generate</span>}</td>
                      <td className="px-4 py-2">
                        {r.pole_id_raw ? (r.pole_id ? <span className="text-emerald-600">Terhubung ({r.pole_id_raw})</span> : <span className="text-amber-600">Tidak ketemu ({r.pole_id_raw})</span>) : '-'}
                      </td>
                      <td className="px-4 py-2 uppercase">{r.site}</td>
                      <td className="px-4 py-2">{r.kecamatan || '-'} / {r.desa || '-'}</td>
                      <td className="px-4 py-2">
                        {r._error ? <span className="text-xs font-medium text-rose-600 px-2 py-1 bg-rose-100 rounded">{r._error}</span> : <span className="text-xs font-medium text-emerald-600 px-2 py-1 bg-emerald-100 rounded">Siap Import</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between rounded-b-2xl">
              <p className="text-sm text-slate-600">Terpilih: <b>{importRows.filter(r => r._selected && !r._error).length}</b> dari {importRows.length} baris</p>
              <div className="flex gap-3">
                <button onClick={() => setIsImportModalOpen(false)} className="px-5 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors">Batal</button>
                <button onClick={processImport} disabled={saving || importRows.filter(r => r._selected && !r._error).length === 0} className="px-5 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50">
                  {saving ? 'Memproses...' : 'Import Data'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

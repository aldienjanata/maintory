import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useProgress } from '../../contexts/ProgressContext'
import toast from 'react-hot-toast'
import {
  Plus, X, Edit2, Trash2, MapPin, Search, Download,
  ChevronDown, ChevronUp, ExternalLink, Antenna, Upload,
  FileSpreadsheet, Map, Settings as SettingsIcon, AlertTriangle,
  CheckSquare, Square, Eraser
} from 'lucide-react'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const SITES = [
  { value: 'banyumas', label: 'Banyumas' },
  { value: 'cilacap', label: 'Cilacap' },
  { value: 'cilacap_herman', label: 'Cilacap (Herman)' },
]
const SITE_CODE = { banyumas: 'BMS', cilacap: 'CLP', cilacap_herman: 'CLH' }
const POLE_TYPES = [
  { value: 'tiang_7m', label: 'Tiang 7 m' },
  { value: 'tiang_9m', label: 'Tiang 9 m' },
]
const EMPTY_FORM = {
  site: 'banyumas', pole_type: 'tiang_7m',
  provinsi: 'Jawa Tengah', kabupaten: 'Banyumas',
  kecamatan: '', desa: '', maps_url: '',
  longitude: '', latitude: '', keterangan: '',
}
const DEFAULT_FORMAT = 'NAT/{SITE_CODE}/POLE/{DESA}/{NO}'

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function generatePoleId(site, desa, existingPoles, formatTemplate = DEFAULT_FORMAT) {
  if (!desa) return ''
  const siteCode = SITE_CODE[site] || 'BMS'
  const desaSlug = desa.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').substring(0, 15)
  const count = existingPoles.filter(
    p => p.site === site && p.desa?.toUpperCase().trim() === desa.toUpperCase().trim()
  ).length
  const no = String(count + 1).padStart(3, '0')
  return formatTemplate
    .replace(/{SITE_CODE}/g, siteCode)
    .replace(/{DESA}/g, desaSlug)
    .replace(/{NO}/g, no)
}

function extractCoordsFromUrl(url) {
  if (!url) return null
  const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { latitude: m[1], longitude: m[2] }
  const m2 = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m2) return { latitude: m2[1], longitude: m2[2] }
  return null
}

// ─── KMZ GENERATION ──────────────────────────────────────────────────────────
async function generateKMZ(poles, users) {
  const getUserName = (uid) => users.find(u => u.id === uid)?.full_name || 'Unknown'
  const placemarks = poles
    .filter(p => p.latitude && p.longitude)
    .map(p => `
    <Placemark>
      <name>${p.pole_id || 'Tiang'}</name>
      <description><![CDATA[
        <b>Site:</b> ${SITES.find(s => s.value === p.site)?.label || p.site}<br/>
        <b>Jenis:</b> ${POLE_TYPES.find(t => t.value === p.pole_type)?.label || p.pole_type}<br/>
        <b>Kecamatan:</b> ${p.kecamatan || '-'}<br/>
        <b>Desa:</b> ${p.desa || '-'}<br/>
        <b>Keterangan:</b> ${p.keterangan || '-'}<br/>
        <b>Diinput Oleh:</b> ${getUserName(p.created_by)}<br/>
        ${p.maps_url ? `<a href="${p.maps_url}">Lihat di Google Maps</a>` : ''}
      ]]></description>
      <styleUrl>#tiang_icon</styleUrl>
      <Point><coordinates>${p.longitude},${p.latitude},0</coordinates></Point>
    </Placemark>`).join('\n')

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Data Tiang Maintory - ${format(new Date(), 'dd MMM yyyy')}</name>
    <description>Export Data Tiang Jaringan Fiber</description>
    <Style id="tiang_icon">
      <IconStyle><scale>1.2</scale><Icon><href>files/icon_tiang.png</href></Icon><hotSpot x="0.5" y="0" xunits="fraction" yunits="fraction"/></IconStyle>
      <LabelStyle><color>ffffffff</color><scale>0.8</scale></LabelStyle>
    </Style>
    ${placemarks}
  </Document>
</kml>`

  const zip = new JSZip()
  zip.file('doc.kml', kml)
  try {
    const iconResp = await fetch('/icon_tiang.png')
    const iconBlob = await iconResp.blob()
    zip.folder('files').file('icon_tiang.png', iconBlob)
  } catch {}

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Data_Tiang_${format(new Date(), 'yyyyMMdd')}.kmz`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function DataTiang() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const { showProgress, hideProgress } = useProgress()
  const importRef = useRef(null)

  const [poles, setPoles] = useState([])
  const [users, setUsers] = useState([])
  const [idFormat, setIdFormat] = useState(DEFAULT_FORMAT)
  const [loading, setLoading] = useState(true)
  const [kmzLoading, setKmzLoading] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSite, setFilterSite] = useState('')
  const [filterKecamatan, setFilterKecamatan] = useState('')
  const [filterDesa, setFilterDesa] = useState('')
  const [filterType, setFilterType] = useState('')

  // Sorting
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  
  const [confirmDelete, setConfirmDelete] = useState(null)
  
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importRows, setImportRows] = useState([])
  
  // Format Modal
  const [isFormatModalOpen, setIsFormatModalOpen] = useState(false)
  const [formatForm, setFormatForm] = useState(DEFAULT_FORMAT)

  // Bulk Delete (superadmin only)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkDeleteModal, setBulkDeleteModal] = useState(null)
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('')
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false)
  const [confirmRetroactive, setConfirmRetroactive] = useState(false)

  // Pagination
  const [page, setPage] = useState(1)
  const perPage = 15

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Supabase membatasi maksimal 1000 baris per request. 
      // Karena data tiang bisa ribuan, kita harus fetch berulang (pagination) sampai habis.
      let allPoles = []
      let from = 0
      const step = 1000
      
      while (true) {
        const { data, error } = await supabase
          .from('network_poles')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + step - 1)
          
        if (error) throw error
        if (data && data.length > 0) {
          allPoles = [...allPoles, ...data]
          if (data.length < step) break
          from += step
        } else {
          break
        }
      }

      const [usersRes, settingsRes] = await Promise.all([
        supabase.from('users').select('id, full_name'),
        supabase.from('app_settings').select('pole_id_format').maybeSingle()
      ])
      
      setPoles(allPoles)
      if (usersRes.data) setUsers(usersRes.data)
      if (settingsRes.data?.pole_id_format) {
        setIdFormat(settingsRes.data.pole_id_format)
        setFormatForm(settingsRes.data.pole_id_format)
      }
    } catch { toast.error('Gagal memuat data') }
    finally { setLoading(false) }
  }

  const getUserName = (uid) => users.find(u => u.id === uid)?.full_name || '-'

  const kecamatanList = useMemo(() => [...new Set(poles.map(p => p.kecamatan).filter(Boolean))].sort(), [poles])
  const desaList = useMemo(() => {
    let list = poles
    if (filterKecamatan) list = list.filter(p => p.kecamatan === filterKecamatan)
    return [...new Set(list.map(p => p.desa).filter(Boolean))].sort()
  }, [poles, filterKecamatan])

  const filtered = useMemo(() => {
    let data = [...poles]
    if (filterSite) data = data.filter(p => p.site === filterSite)
    if (filterKecamatan) data = data.filter(p => p.kecamatan === filterKecamatan)
    if (filterDesa) data = data.filter(p => p.desa === filterDesa)
    if (filterType) data = data.filter(p => p.pole_type === filterType)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      data = data.filter(p => p.pole_id?.toLowerCase().includes(q) || p.desa?.toLowerCase().includes(q) || p.kecamatan?.toLowerCase().includes(q) || p.keterangan?.toLowerCase().includes(q))
    }
    data.sort((a, b) => {
      let va = a[sortKey] ?? '', vb = b[sortKey] ?? ''
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
    })
    return data
  }, [poles, filterSite, filterKecamatan, filterDesa, filterType, searchQuery, sortKey, sortDir])

  const paginated = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page])
  const totalPages = Math.ceil(filtered.length / perPage)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const SortIcon = ({ col }) => sortKey !== col ? <ChevronDown size={11} style={{ opacity: 0.3 }} /> : sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setIsModalOpen(true) }
  const openEdit = (pole) => {
    setEditingId(pole.id)
    setForm({
      site: pole.site || 'banyumas', pole_type: pole.pole_type || 'tiang_7m',
      provinsi: pole.provinsi || '', kabupaten: pole.kabupaten || '',
      kecamatan: pole.kecamatan || '', desa: pole.desa || '',
      maps_url: pole.maps_url || '', longitude: pole.longitude || '',
      latitude: pole.latitude || '', keterangan: pole.keterangan || '',
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.kecamatan.trim()) return toast.error('Kecamatan wajib diisi!')
    if (!form.desa.trim()) return toast.error('Desa/Kelurahan wajib diisi!')
    setSaving(true)
    showProgress('Menyimpan Tiang', 'Mengirim data ke server...', 50)
    try {
      const payload = {
        ...form,
        longitude: form.longitude ? Number(form.longitude) : null,
        latitude: form.latitude ? Number(form.latitude) : null,
        updated_by: profile.id,
      }
      if (editingId) {
        const { error } = await supabase.from('network_poles').update(payload).eq('id', editingId)
        if (error) throw error
        toast.success('Data tiang diperbarui!')
      } else {
        const poleId = generatePoleId(form.site, form.desa, poles, idFormat)
        const { error } = await supabase.from('network_poles').insert({ ...payload, pole_id: poleId, created_by: profile.id })
        if (error) throw error
        toast.success(`Tiang ${poleId} ditambahkan!`)
      }
      setIsModalOpen(false)
      fetchData()
    } catch (e) { toast.error(e.message || 'Terjadi kesalahan') }
    finally { 
      setSaving(false)
      hideProgress()
    }
  }

  const handleDelete = async (pole) => {
    showProgress('Menghapus Tiang', 'Menghapus data...', 50)
    try {
      const { error } = await supabase.from('network_poles').delete().eq('id', pole.id)
      if (error) throw error
      toast.success('Data tiang dihapus')
      setConfirmDelete(null)
      fetchData()
    } catch { toast.error('Gagal menghapus data') }
    finally { hideProgress() }
  }

  // ── BULK DELETE (superadmin) ──
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length && paginated.every(p => selectedIds.has(p.id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginated.map(p => p.id)))
    }
  }
  const clearSelection = () => setSelectedIds(new Set())

  const openBulkDeleteModal = (mode) => {
    if (mode === 'selected') {
      if (selectedIds.size === 0) return toast.error('Tidak ada data yang dipilih!')
      setBulkDeleteModal({ mode, label: `${selectedIds.size} tiang yang dipilih`, ids: [...selectedIds] })
    } else if (mode === 'desa') {
      if (!filterDesa) return toast.error('Pilih filter Desa terlebih dahulu!')
      const ids = filtered.map(p => p.id)
      setBulkDeleteModal({ mode, label: `semua tiang Desa "${filterDesa}" (${ids.length} data)`, ids })
    } else if (mode === 'kecamatan') {
      if (!filterKecamatan) return toast.error('Pilih filter Kecamatan terlebih dahulu!')
      const ids = filtered.map(p => p.id)
      setBulkDeleteModal({ mode, label: `semua tiang Kecamatan "${filterKecamatan}" (${ids.length} data)`, ids })
    } else if (mode === 'all') {
      const ids = poles.map(p => p.id)
      setBulkDeleteModal({ mode, label: `SELURUH DATA TIANG (${ids.length} data)`, ids })
    }
    setBulkDeleteConfirmText('')
  }

  const handleBulkDelete = async () => {
    if (!bulkDeleteModal) return
    const { ids, mode, label } = bulkDeleteModal
    const required = mode === 'all' ? 'HAPUS SEMUA' : 'HAPUS'
    if (bulkDeleteConfirmText.trim().toUpperCase() !== required) {
      return toast.error(`Ketik "${required}" untuk konfirmasi!`)
    }
    setBulkDeleteModal(null)
    showProgress('Menghapus Data', `Menghapus ${ids.length} tiang...`, 10)
    try {
      const chunkSize = 100
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const pct = 10 + ((i / ids.length) * 88)
        showProgress('Menghapus Data', `Menghapus data ${i + 1} – ${Math.min(i + chunkSize, ids.length)} dari ${ids.length}...`, pct)
        const { error } = await supabase.from('network_poles').delete().in('id', chunk)
        if (error) throw error
      }
      showProgress('Selesai', 'Penghapusan berhasil!', 100)
      setTimeout(() => {
        hideProgress()
        toast.success(`${ids.length} tiang berhasil dihapus!`)
        setSelectedIds(new Set())
        fetchData()
      }, 500)
    } catch (e) {
      hideProgress()
      toast.error('Gagal menghapus: ' + e.message)
    }
  }

  const handleExtractCoords = () => {
    const coords = extractCoordsFromUrl(form.maps_url)
    if (coords) {
      setForm(f => ({ ...f, latitude: coords.latitude, longitude: coords.longitude }))
      toast.success('Koordinat berhasil diekstrak!')
    } else toast.error('Koordinat tidak ditemukan. Masukkan manual.')
  }

  // ── EXPORT EXCEL ──
  const handleExportExcel = () => {
    if (filtered.length === 0) return toast.error('Tidak ada data')
    showProgress('Export Excel', 'Menyiapkan file...', 50)
    setTimeout(() => {
      const rows = filtered.map((p, i) => ({
        'No': i + 1, 'Site': SITES.find(s => s.value === p.site)?.label || p.site,
        'ID Tiang': p.pole_id || '', 'Jenis Tiang': POLE_TYPES.find(t => t.value === p.pole_type)?.label || p.pole_type,
        'Provinsi': p.provinsi || '', 'Kabupaten/Kota': p.kabupaten || '', 'Kecamatan': p.kecamatan || '',
        'Desa/Kelurahan': p.desa || '', 'Maps URL': p.maps_url || '', 'Longitude': p.longitude || '',
        'Latitude': p.latitude || '', 'Keterangan': p.keterangan || '', 'Diinput Oleh': getUserName(p.created_by),
        'Edit Oleh': getUserName(p.updated_by), 'Tanggal Input': p.created_at ? format(new Date(p.created_at), 'dd/MM/yyyy HH:mm') : '',
        'Tanggal Update': p.updated_at ? format(new Date(p.updated_at), 'dd/MM/yyyy HH:mm') : '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Data Tiang')
      XLSX.writeFile(wb, `Data_Tiang_${format(new Date(), 'yyyyMMdd')}.xlsx`)
      hideProgress()
      toast.success('Export Excel berhasil!')
    }, 500)
  }

  const handleExportKMZ = async () => {
    const withCoords = filtered.filter(p => p.latitude && p.longitude)
    if (withCoords.length === 0) return toast.error('Tidak ada data dengan koordinat GPS')
    setKmzLoading(true)
    showProgress('Export KMZ', 'Membuat file Google Earth...', 50)
    try {
      await generateKMZ(withCoords, users)
      toast.success(`KMZ berhasil dibuat! (${withCoords.length} titik)`)
    } catch (e) { toast.error('Gagal membuat KMZ: ' + e.message) }
    finally { 
      setKmzLoading(false)
      hideProgress()
    }
  }

  const handleDownloadTemplate = () => {
    const template = [{
      'Site': 'banyumas', 'Jenis Tiang': 'tiang_7m', 'Provinsi': 'Jawa Tengah', 'Kabupaten/Kota': 'Banyumas',
      'Kecamatan': 'Purwokerto Selatan', 'Desa/Kelurahan': 'Tanjung', 'Maps URL': 'https://maps.app.goo.gl/contoh',
      'Longitude': '109.2345678', 'Latitude': '-7.4321234', 'Keterangan': 'Contoh keterangan',
    }]
    const ws = XLSX.utils.json_to_sheet(template)
    ws['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, 'Template_Import_Tiang.xlsx')
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
        const mapped = rows.map((r, i) => ({
          _rowNo: i + 2, site: r['Site']?.toLowerCase() || 'banyumas', pole_type: r['Jenis Tiang']?.toLowerCase() || 'tiang_7m',
          provinsi: r['Provinsi'] || '', kabupaten: r['Kabupaten/Kota'] || '', kecamatan: r['Kecamatan'] || '',
          desa: r['Desa/Kelurahan'] || '', maps_url: r['Maps URL'] || '', longitude: r['Longitude'] ? Number(r['Longitude']) : null,
          latitude: r['Latitude'] ? Number(r['Latitude']) : null, keterangan: r['Keterangan'] || '',
          _valid: !!r['Kecamatan'] && !!r['Desa/Kelurahan'],
        }))
        setImportRows(mapped)
        setIsImportModalOpen(true)
      } catch { toast.error('File tidak valid. Gunakan template yang disediakan.') }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleSaveImport = async () => {
    const valid = importRows.filter(r => r._valid)
    if (valid.length === 0) return toast.error('Tidak ada baris yang valid!')
    
    setIsImportModalOpen(false)
    showProgress('Memulai Import', 'Mempersiapkan data...', 5)
    
    try {
      const counts = {}
      for (const p of poles) {
        if (!p.desa) continue
        const key = `${p.site}_${p.desa.toUpperCase().trim()}`
        counts[key] = (counts[key] || 0) + 1
      }

      showProgress('Menyiapkan ID', 'Membuat pole ID untuk seluruh baris...', 15)
      const payloads = valid.map(row => {
        const key = `${row.site}_${row.desa.toUpperCase().trim()}`
        counts[key] = (counts[key] || 0) + 1
        
        const siteCode = SITE_CODE[row.site] || 'BMS'
        const desaSlug = row.desa.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').substring(0, 15)
        const poleId = idFormat.replace(/{SITE_CODE}/g, siteCode).replace(/{DESA}/g, desaSlug).replace(/{NO}/g, String(counts[key]).padStart(3, '0'))

        return {
          site: row.site, pole_type: row.pole_type, pole_id: poleId, provinsi: row.provinsi,
          kabupaten: row.kabupaten, kecamatan: row.kecamatan, desa: row.desa, maps_url: row.maps_url,
          longitude: row.longitude, latitude: row.latitude, keterangan: row.keterangan,
          created_by: profile.id, updated_by: profile.id,
        }
      })

      const chunkSize = 500
      let successCount = 0
      for (let i = 0; i < payloads.length; i += chunkSize) {
        const percent = 20 + ((i / payloads.length) * 80)
        showProgress('Menyimpan Data', `Mengirim baris ${i + 1} hingga ${Math.min(i + chunkSize, payloads.length)} ke server...`, percent)
        
        const chunk = payloads.slice(i, i + chunkSize)
        const { error } = await supabase.from('network_poles').insert(chunk)
        if (error) throw error
        successCount += chunk.length
      }

      showProgress('Selesai', 'Penyimpanan berhasil!', 100)
      setTimeout(() => {
        hideProgress()
        toast.success(`${successCount} tiang berhasil diimport!`)
        setImportRows([])
        fetchData()
      }, 500)
    } catch (e) {
      hideProgress()
      toast.error('Gagal import: ' + e.message)
    }
  }

  // ── FORMAT ID SETTINGS ──
  const handleSaveFormat = async () => {
    showProgress('Menyimpan Format', 'Menyimpan konfigurasi...', 50)
    try {
      const { error } = await supabase.from('app_settings').update({ pole_id_format: formatForm }).neq('branch_name', 'xxxx')
      if (error) throw error
      setIdFormat(formatForm)
      setIsFormatModalOpen(false)
      toast.success('Format ID berhasil disimpan!')
    } catch (e) {
      toast.error('Gagal menyimpan format: ' + e.message)
    } finally {
      hideProgress()
    }
  }

  const handleRetroactiveUpdate = () => {
    setConfirmRetroactive(true)
  }

  const doRetroactiveUpdate = async () => {
    setConfirmRetroactive(false)
    setIsFormatModalOpen(false)
    showProgress('Update ID Massal', 'Menghitung ulang format baru...', 10)
    
    try {
      const counts = {}
      const sortedPoles = [...poles].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      
      const payloads = sortedPoles.map(p => {
        const key = `${p.site}_${(p.desa || '').toUpperCase().trim()}`
        counts[key] = (counts[key] || 0) + 1
        
        const siteCode = SITE_CODE[p.site] || 'BMS'
        const desaSlug = (p.desa || '').toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').substring(0, 15)
        const newPoleId = formatForm
          .replace(/{SITE_CODE}/g, siteCode)
          .replace(/{DESA}/g, desaSlug)
          .replace(/{NO}/g, String(counts[key]).padStart(3, '0'))
          
        return { id: p.id, pole_id: newPoleId }
      })
      
      // Filter yang benar-benar berubah saja
      const toUpdate = payloads.filter(p => {
        const original = poles.find(op => op.id === p.id)
        return original && original.pole_id !== p.pole_id
      })

      if (toUpdate.length === 0) {
        hideProgress()
        return toast.success('Semua ID tiang sudah sesuai format baru!')
      }

      const chunkSize = 50
      let successCount = 0
      
      for (let i = 0; i < toUpdate.length; i += chunkSize) {
        const percent = 15 + ((i / toUpdate.length) * 85)
        showProgress('Update ID Massal', `Memperbarui ID ${i + 1}–${Math.min(i + chunkSize, toUpdate.length)} dari ${toUpdate.length}...`, percent)
        const chunk = toUpdate.slice(i, i + chunkSize)
        // Update satu per satu agar error bisa tertangkap
        for (const c of chunk) {
          const { error } = await supabase.from('network_poles').update({ pole_id: c.pole_id }).eq('id', c.id)
          if (error) throw error
        }
        successCount += chunk.length
      }

      showProgress('Selesai', 'Update massal berhasil!', 100)
      setTimeout(() => {
        hideProgress()
        toast.success(`${successCount} tiang berhasil diperbarui!`)
        fetchData()
      }, 500)

    } catch (e) {
      hideProgress()
      toast.error('Gagal update massal: ' + e.message)
    }
  }

  const poleIdPreview = !editingId && form.desa ? generatePoleId(form.site, form.desa, poles, idFormat) : null
  const dummyPreview = generatePoleId('banyumas', 'Tanjung', [], formatForm)

  return (
    <div className="page-container">
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 700 }}>
            <Antenna size={22} style={{ color: 'var(--accent)' }} /> Data Tiang
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Jaringan Fiber — Pencatatan & Manajemen Tiang</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['admin', 'superadmin'].includes(role) && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setIsFormatModalOpen(true)} title="Pengaturan Format ID Tiang">
                <SettingsIcon size={14} /> Format ID
              </button>
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
          <button className="btn btn-secondary btn-sm" onClick={handleExportKMZ} disabled={kmzLoading} title="Export ke KMZ (Google Earth)" style={{ color: 'var(--accent)', borderColor: 'rgba(var(--accent-rgb, 59,130,246),0.4)' }}>
            <Map size={14} /> {kmzLoading ? 'Memproses...' : 'KMZ'}
          </button>
          {['admin', 'superadmin', 'teknisi'].includes(role) && (
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <Plus size={14} /> Tambah Tiang
            </button>
          )}
        </div>
      </div>

      {/* ── SUMMARY CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Total Tiang', value: poles.length, color: 'var(--accent)' },
          { label: 'Tiang 7 m', value: poles.filter(p => p.pole_type === 'tiang_7m').length, color: 'var(--success)' },
          { label: 'Tiang 9 m', value: poles.filter(p => p.pole_type === 'tiang_9m').length, color: 'var(--warning)' },
          { label: 'Kecamatan', value: kecamatanList.length, color: 'var(--purple)' },
          { label: 'Ada Koordinat', value: poles.filter(p => p.latitude && p.longitude).length, color: '#22d3ee' },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: '12px 14px', borderTop: `3px solid ${card.color}` }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* ── FILTERS ── */}
      <div className="card" style={{ padding: '12px 14px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 auto', minWidth: '200px', maxWidth: '350px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            <input className="form-input" style={{ paddingLeft: '30px', height: '34px', fontSize: '13px', width: '100%' }} placeholder="Cari ID, Desa, Kecamatan..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(1) }} />
          </div>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '110px', width: 'auto' }} value={filterSite} onChange={e => { setFilterSite(e.target.value); setPage(1) }}><option value="">Semua Site</option>{SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '140px', width: 'auto' }} value={filterKecamatan} onChange={e => { setFilterKecamatan(e.target.value); setFilterDesa(''); setPage(1) }}><option value="">Semua Kecamatan</option>{kecamatanList.map(k => <option key={k} value={k}>{k}</option>)}</select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '140px', width: 'auto' }} value={filterDesa} onChange={e => { setFilterDesa(e.target.value); setPage(1) }}><option value="">Semua Desa</option>{desaList.map(d => <option key={d} value={d}>{d}</option>)}</select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '100px', width: 'auto' }} value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }}><option value="">Semua Jenis</option>{POLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          {(filterSite || filterKecamatan || filterDesa || filterType || searchQuery)
            ? <button className="btn btn-secondary btn-sm" style={{ height: '34px', whiteSpace: 'nowrap' }} onClick={() => { setFilterSite(''); setFilterKecamatan(''); setFilterDesa(''); setFilterType(''); setSearchQuery(''); setPage(1) }}>Reset</button>
            : <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>{filtered.length} data</div>
          }
        </div>
      </div>

      {/* ── BULK DELETE DROPDOWN (superadmin) ── */}
      {role === 'superadmin' && (
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: '10px' }}>
          <button
            className="btn btn-sm"
            style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => setBulkMenuOpen(o => !o)}
          >
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
                    <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}
                      onClick={() => { setBulkMenuOpen(false); openBulkDeleteModal('selected') }}>
                      <CheckSquare size={14} /> Hapus Yang Dipilih ({selectedIds.size})
                    </button>
                    <button className="dropdown-item" style={{ width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}
                      onClick={() => { clearSelection(); setBulkMenuOpen(false) }}>
                      <Square size={14} /> Batal Pilih
                    </button>
                    <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                  </>
                )}
                <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={() => { setBulkMenuOpen(false); openBulkDeleteModal('desa') }}>
                  <Eraser size={14} /> Hapus per Desa <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>(filter aktif)</span>
                </button>
                <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={() => { setBulkMenuOpen(false); openBulkDeleteModal('kecamatan') }}>
                  <Eraser size={14} /> Hapus per Kecamatan <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>(filter aktif)</span>
                </button>
                <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'rgba(239,68,68,0.08)', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={() => { setBulkMenuOpen(false); openBulkDeleteModal('all') }}>
                  <Trash2 size={14} /> Hapus SEMUA Data Tiang
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TABLE ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }} className="desktop-table">
          <table className="table" style={{ minWidth: '960px', fontSize: '13px' }}>
            <thead>
              <tr>
                {role === 'superadmin' && (
                  <th style={{ width: '36px', textAlign: 'center', cursor: 'pointer' }} onClick={toggleSelectAll}>
                    {paginated.length > 0 && paginated.every(p => selectedIds.has(p.id))
                      ? <CheckSquare size={14} style={{ color: 'var(--accent)' }} />
                      : <Square size={14} style={{ opacity: 0.4 }} />}
                  </th>
                )}
                <th style={{ width: '40px', textAlign: 'center' }}>No</th>
                <th style={{ cursor: 'pointer', width: '90px' }} onClick={() => handleSort('site')}><div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>Site <SortIcon col="site" /></div></th>
                <th style={{ cursor: 'pointer', minWidth: '200px' }} onClick={() => handleSort('pole_id')}><div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>ID Tiang <SortIcon col="pole_id" /></div></th>
                <th style={{ width: '90px' }}>Jenis</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kecamatan')}><div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>Kecamatan <SortIcon col="kecamatan" /></div></th>
                <th>Desa</th>
                <th style={{ width: '120px' }}>Koordinat</th>
                <th style={{ width: '55px' }}>Maps</th>
                <th>Keterangan</th>
                <th style={{ width: '100px' }}>Input Oleh</th>
                <th style={{ cursor: 'pointer', width: '100px' }} onClick={() => handleSort('created_at')}><div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>Tgl Input <SortIcon col="created_at" /></div></th>
                {['admin', 'superadmin'].includes(role) && <th style={{ width: '80px' }}>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Memuat data...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}><Antenna size={28} style={{ opacity: 0.25, marginBottom: '8px', display: 'block', margin: '0 auto 8px' }} />Belum ada data tiang</td></tr>
              ) : paginated.map((pole, idx) => (
                <tr key={pole.id} style={{ background: selectedIds.has(pole.id) ? 'rgba(239,68,68,0.06)' : undefined }}>
                  {role === 'superadmin' && (
                    <td style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSelect(pole.id)}>
                      {selectedIds.has(pole.id)
                        ? <CheckSquare size={14} style={{ color: 'var(--danger)' }} />
                        : <Square size={14} style={{ opacity: 0.3 }} />}
                    </td>
                  )}
                  <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '11px' }}>{(page - 1) * perPage + idx + 1}</td>
                  <td><span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '20px', background: 'var(--bg-primary)', border: '1px solid var(--border)', fontWeight: 600 }}>{SITES.find(s => s.value === pole.site)?.label || pole.site}</span></td>
                  <td><span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>{pole.pole_id || '-'}</span></td>
                  <td><span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '20px', fontWeight: 600, background: pole.pole_type === 'tiang_9m' ? 'rgba(251,191,36,0.15)' : 'rgba(16,185,129,0.12)', color: pole.pole_type === 'tiang_9m' ? 'var(--warning)' : 'var(--success)' }}>{POLE_TYPES.find(t => t.value === pole.pole_type)?.label}</span></td>
                  <td style={{ fontSize: '12px' }}>{pole.kecamatan || '-'}</td>
                  <td style={{ fontSize: '12px' }}>{pole.desa || '-'}</td>
                  <td>{pole.latitude && pole.longitude ? <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'monospace', lineHeight: '1.4' }}><div>Lat: {Number(pole.latitude).toFixed(5)}</div><div>Lon: {Number(pole.longitude).toFixed(5)}</div></div> : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>}</td>
                  <td>{pole.maps_url ? <a href={pole.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px' }}><MapPin size={12} /><ExternalLink size={11} /></a> : '-'}</td>
                  <td style={{ fontSize: '11px', color: 'var(--text-secondary)', maxWidth: '120px' }}><span title={pole.keterangan} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pole.keterangan || '-'}</span></td>
                  <td style={{ fontSize: '11px' }}><div style={{ fontWeight: 500 }}>{getUserName(pole.created_by)}</div>{pole.updated_by && pole.updated_by !== pole.created_by && <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Edit: {getUserName(pole.updated_by)}</div>}</td>
                  <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{pole.created_at ? format(new Date(pole.created_at), 'dd MMM yy', { locale: localeId }) : '-'}</td>
                  {['admin', 'superadmin'].includes(role) && (
                    <td><div style={{ display: 'flex', gap: '4px' }}><button className="btn btn-secondary btn-sm" style={{ padding: '4px 7px' }} onClick={() => openEdit(pole)}><Edit2 size={12} /></button><button className="btn btn-sm" style={{ padding: '4px 7px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)' }} onClick={() => setConfirmDelete(pole)}><Trash2 size={12} /></button></div></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="mobile-cards" style={{ display: 'none' }}>
          {loading ? <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat data...</div> : paginated.map((pole, idx) => (
            <div key={pole.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--accent)', fontWeight: 700 }}>{pole.pole_id || '-'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{SITES.find(s => s.value === pole.site)?.label} · <span style={{ color: pole.pole_type === 'tiang_9m' ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>{POLE_TYPES.find(t => t.value === pole.pole_type)?.label}</span></div>
                </div>
                {['admin', 'superadmin'].includes(role) && (
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}><button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => openEdit(pole)}><Edit2 size={12} /></button><button className="btn btn-sm" style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)' }} onClick={() => setConfirmDelete(pole)}><Trash2 size={12} /></button></div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '12px' }}>
                <div><span style={{ color: 'var(--text-secondary)' }}>Kecamatan: </span>{pole.kecamatan || '-'}</div><div><span style={{ color: 'var(--text-secondary)' }}>Desa: </span>{pole.desa || '-'}</div>
                {pole.latitude && <div><span style={{ color: 'var(--text-secondary)' }}>Lat: </span>{Number(pole.latitude).toFixed(5)}</div>}
                {pole.longitude && <div><span style={{ color: 'var(--text-secondary)' }}>Lon: </span>{Number(pole.longitude).toFixed(5)}</div>}
                {pole.maps_url && <div style={{ gridColumn: '1/-1' }}><a href={pole.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> Lihat Maps <ExternalLink size={11} /></a></div>}
                {pole.keterangan && <div style={{ gridColumn: '1/-1', color: 'var(--text-secondary)' }}>{pole.keterangan}</div>}
              </div>
            </div>
          ))}
        </div>
        <style>{`@media (max-width: 768px) { .desktop-table { display: none !important; } .mobile-cards { display: block !important; } }`}</style>
        
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', padding: '14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1).map((p, i, arr) => (
              <span key={p}>{i > 0 && arr[i - 1] !== p - 1 && <span style={{ color: 'var(--text-secondary)', padding: '0 2px' }}>…</span>}<button className={`btn btn-sm ${page === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPage(p)}>{p}</button></span>
            ))}
            <button className="btn btn-secondary btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
          </div>
        )}
      </div>

      {/* ══════ MODAL TAMBAH/EDIT ══════ */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '680px', maxWidth: '96vw', maxHeight: '93vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>{editingId ? 'Edit Data Tiang' : 'Tambah Tiang Baru'}</h3>
                {!editingId && poleIdPreview && <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--accent)', fontFamily: 'monospace' }}>ID: {poleIdPreview}</p>}
              </div>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div><label className="form-label">Site <span style={{ color: 'var(--danger)' }}>*</span></label><select className="form-input" value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))}>{SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                  <div><label className="form-label">Jenis Tiang <span style={{ color: 'var(--danger)' }}>*</span></label><select className="form-input" value={form.pole_type} onChange={e => setForm(f => ({ ...f, pole_type: e.target.value }))}>{POLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2px' }}><span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>📍 Lokasi Administratif</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div><label className="form-label">Provinsi</label><input className="form-input" value={form.provinsi} onChange={e => setForm(f => ({ ...f, provinsi: e.target.value }))} placeholder="Jawa Tengah" /></div>
                  <div><label className="form-label">Kabupaten/Kota</label><input className="form-input" value={form.kabupaten} onChange={e => setForm(f => ({ ...f, kabupaten: e.target.value }))} placeholder="Banyumas" /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div><label className="form-label">Kecamatan <span style={{ color: 'var(--danger)' }}>*</span></label><input className="form-input" value={form.kecamatan} onChange={e => setForm(f => ({ ...f, kecamatan: e.target.value }))} placeholder="Purwokerto Selatan" /></div>
                  <div><label className="form-label">Desa/Kelurahan <span style={{ color: 'var(--danger)' }}>*</span></label><input className="form-input" value={form.desa} onChange={e => setForm(f => ({ ...f, desa: e.target.value }))} placeholder="Tanjung" /></div>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2px' }}><span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>🗺️ Koordinat GPS</span></div>
                <div>
                  <label className="form-label">URL Google Maps</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input className="form-input" style={{ flex: 1 }} value={form.maps_url} onChange={e => setForm(f => ({ ...f, maps_url: e.target.value }))} placeholder="Tempel link Google Maps..." />
                    <button className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={handleExtractCoords} type="button"><MapPin size={13} /> Ambil Koord</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div><label className="form-label">Longitude</label><input className="form-input" type="number" step="any" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} placeholder="109.2345678" /></div>
                  <div><label className="form-label">Latitude</label><input className="form-input" type="number" step="any" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} placeholder="-7.4321234" /></div>
                </div>
                <div><label className="form-label">Keterangan</label><textarea className="form-input" rows={2} style={{ resize: 'vertical' }} value={form.keterangan} onChange={e => setForm(f => ({ ...f, keterangan: e.target.value }))} placeholder="Catatan tambahan..." /></div>
              </div>
            </div>
            <div className="modal-footer" style={{ flexShrink: 0 }}><button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button><button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? '...' : editingId ? '✓ Simpan Perubahan' : '✓ Tambah Tiang'}</button></div>
          </div>
        </div>
      )}

      {/* ══════ MODAL IMPORT ══════ */}
      {isImportModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '780px', maxWidth: '96vw', maxHeight: '93vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="modal-header">
              <div><h3 style={{ margin: 0 }}>Preview Import Data Tiang</h3><p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>{importRows.filter(r => r._valid).length} baris valid · {importRows.filter(r => !r._valid).length} baris tidak valid</p></div>
              <button className="btn-close" onClick={() => setIsImportModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ fontSize: '12px', minWidth: '600px' }}>
                  <thead><tr><th>Baris</th><th>Site</th><th>Jenis</th><th>Kecamatan</th><th>Desa</th><th>Lat</th><th>Lon</th><th>Status</th></tr></thead>
                  <tbody>
                    {importRows.map(row => (
                      <tr key={row._rowNo} style={{ opacity: row._valid ? 1 : 0.45 }}>
                        <td style={{ color: 'var(--text-secondary)' }}>{row._rowNo}</td><td>{SITES.find(s => s.value === row.site)?.label || row.site}</td><td>{POLE_TYPES.find(t => t.value === row.pole_type)?.label || row.pole_type}</td>
                        <td>{row.kecamatan || <span style={{ color: 'var(--danger)' }}>Kosong!</span>}</td><td>{row.desa || <span style={{ color: 'var(--danger)' }}>Kosong!</span>}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{row.latitude || '-'}</td><td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{row.longitude || '-'}</td>
                        <td>{row._valid ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Valid</span> : <span style={{ color: 'var(--danger)', fontWeight: 600 }}>✗ Dilewati</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer" style={{ flexShrink: 0, padding: '16px 24px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}><button className="btn btn-secondary" onClick={() => { setIsImportModalOpen(false); setImportRows([]) }}>Batal</button><button className="btn btn-primary" onClick={handleSaveImport}>✓ Lanjutkan Import</button></div>
          </div>
        </div>
      )}
      
      {/* ══════ MODAL FORMAT ID ══════ */}
      {isFormatModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '560px', maxWidth: '96vw', maxHeight: '93vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Pengaturan Format ID</h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Ubah cara sistem menamai tiang baru secara otomatis</p>
              </div>
              <button className="btn-close" onClick={() => setIsFormatModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                <div className="alert alert-warning" style={{ margin: 0, padding: '12px', background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '10px' }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                    <strong>Perhatian:</strong> Mengubah format ID bisa ditujukan untuk <strong>tiang baru saja</strong> (Simpan Format Saja), atau Anda bisa memperbarui <strong>seluruh data tiang lama secara serentak</strong> (Update Retroaktif).
                  </div>
                </div>

                <div>
                  <label className="form-label">Template ID</label>
                  <input className="form-input" style={{ fontFamily: 'monospace', fontSize: '14px', padding: '10px', height: 'auto' }} value={formatForm} onChange={e => setFormatForm(e.target.value)} />
                  
                  <div style={{ marginTop: '8px', padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Variabel Tersedia:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      <span className="badge" style={{ fontFamily: 'monospace', background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: '11px' }}>{'{SITE_CODE}'}</span> <span style={{ fontSize: '11px', color: 'var(--text-secondary)', alignSelf: 'center' }}>= Kode Site (BMS, CLP)</span>
                      <span className="badge" style={{ fontFamily: 'monospace', background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: '11px', marginLeft: '6px' }}>{'{DESA}'}</span> <span style={{ fontSize: '11px', color: 'var(--text-secondary)', alignSelf: 'center' }}>= Nama desa slug</span>
                      <span className="badge" style={{ fontFamily: 'monospace', background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: '11px', marginLeft: '6px' }}>{'{NO}'}</span> <span style={{ fontSize: '11px', color: 'var(--text-secondary)', alignSelf: 'center' }}>= Nomor urut</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="form-label">Preview Contoh (Tanjung)</label>
                  <div style={{ padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'monospace', color: 'var(--accent)', fontSize: '15px', fontWeight: 700, textAlign: 'center' }}>
                    {dummyPreview}
                  </div>
                </div>

              </div>
            </div>
            <div className="modal-footer" style={{ flexShrink: 0, padding: '16px 24px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <button className="btn" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '12px' }} onClick={handleRetroactiveUpdate} title="Ubah juga semua tiang yang sudah ada sebelumnya mengikuti format baru ini">
                <AlertTriangle size={13} style={{ marginRight: '4px' }} /> Update Semua ID Lama
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => setIsFormatModalOpen(false)}>Batal</button>
                <button className="btn btn-primary" onClick={handleSaveFormat}>✓ Simpan Format Baru</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL KONFIRMASI HAPUS SATUAN ══════ */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '400px', maxWidth: '96vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, color: 'var(--danger)' }}>⚠ Hapus Tiang</h3>
              <button className="btn-close" onClick={() => setConfirmDelete(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px 24px' }}>
              <p style={{ margin: 0 }}>Hapus tiang <strong style={{ color: 'var(--accent)' }}>{confirmDelete.pole_id}</strong>?</p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>Tindakan ini tidak bisa dibatalkan.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Batal</button>
              <button style={{ background: 'var(--danger)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleDelete(confirmDelete)}>Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL BULK DELETE (superadmin) ══════ */}
      {bulkDeleteModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '480px', maxWidth: '96vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, color: 'var(--danger)' }}>🗑 Hapus Data Massal</h3>
              <button className="btn-close" onClick={() => setBulkDeleteModal(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px 24px' }}>
              <div style={{ padding: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                <p style={{ margin: 0, fontSize: '13px' }}>Anda akan menghapus <strong style={{ color: 'var(--danger)' }}>{bulkDeleteModal.label}</strong>.</p>
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Tindakan ini <strong>tidak dapat dibatalkan</strong>. Semua data yang dihapus akan hilang permanen.</p>
              </div>
              <label className="form-label" style={{ color: 'var(--danger)' }}>
                Ketik <strong>{bulkDeleteModal.mode === 'all' ? 'HAPUS SEMUA' : 'HAPUS'}</strong> untuk konfirmasi:
              </label>
              <input
                className="form-input"
                style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1px' }}
                value={bulkDeleteConfirmText}
                onChange={e => setBulkDeleteConfirmText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBulkDelete()}
                placeholder={bulkDeleteModal.mode === 'all' ? 'HAPUS SEMUA' : 'HAPUS'}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setBulkDeleteModal(null)}>Batal</button>
              <button
                style={{
                  background: bulkDeleteConfirmText.trim().toUpperCase() === (bulkDeleteModal.mode === 'all' ? 'HAPUS SEMUA' : 'HAPUS') ? 'var(--danger)' : 'rgba(239,68,68,0.3)',
                  color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 'var(--radius-md)', fontWeight: 600,
                  cursor: bulkDeleteConfirmText.trim().toUpperCase() === (bulkDeleteModal.mode === 'all' ? 'HAPUS SEMUA' : 'HAPUS') ? 'pointer' : 'not-allowed'
                }}
                onClick={handleBulkDelete}
              >
                Ya, Hapus Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL KONFIRMASI RETROACTIVE UPDATE ══════ */}
      {confirmRetroactive && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '460px', maxWidth: '96vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, color: 'var(--warning)' }}>⚠️ Update ID Massal</h3>
              <button className="btn-close" onClick={() => setConfirmRetroactive(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px 24px' }}>
              <div style={{ padding: '12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.5' }}>Ini akan mengubah <strong>SEMUA ID tiang yang sudah ada</strong> mengikuti format baru, dihitung ulang berurutan dari 001 per desa berdasarkan tanggal input terlama.</p>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>Contoh: tiang desa Bangsa akan menjadi BANGSA/001, BANGSA/002, BANGSA/003, dst.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmRetroactive(false)}>Batal</button>
              <button style={{ background: 'var(--warning)', color: '#000', border: 'none', padding: '8px 18px', borderRadius: 'var(--radius-md)', fontWeight: 700, cursor: 'pointer' }} onClick={doRetroactiveUpdate}>
                Ya, Update Semua ID
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

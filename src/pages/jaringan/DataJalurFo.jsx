import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import Pagination from '../../components/common/Pagination'
import { Plus, X, Edit2, Trash2, MapPin, Search, Download, ChevronDown, ChevronUp, ExternalLink, Upload, FileSpreadsheet, CheckSquare, Square, Eraser, Cable, Globe } from 'lucide-react'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'

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
  jalur_id_manual: '',
  route_waypoints: null,
  warna_jalur: '#FF0000'
}

function generateItemId(site, desa, existingItems) {
  if (!desa) return ''
  const siteCode = SITE_CODE[site] || 'BMS'
  const desaSlug = desa.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').substring(0, 15)
  
  const sameItems = existingItems.filter(p => {
    if (p.site !== site || !p.jalur_id) return false
    const parts = p.jalur_id.split('/')
    if (parts.length >= 5) {
      return parts[3] === desaSlug
    }
    return false
  })
  
  let maxNo = 0
  for (const p of sameItems) {
    const parts = p.jalur_id.split('/')
    const noStr = parts[parts.length - 1]
    const no = parseInt(noStr, 10)
    if (!isNaN(no)) maxNo = Math.max(maxNo, no)
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


function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = x => x * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
function calcPolylineLength(waypoints) {
  let total = 0
  for (let i = 1; i < waypoints.length; i++)
    total += haversineDistance(waypoints[i-1].lat, waypoints[i-1].lon, waypoints[i].lat, waypoints[i].lon)
  return Math.round(total)
}
function kmlColorToHex(kmlColor) {
  if (!kmlColor || kmlColor.length < 6) return '#FF0000'
  const hex = kmlColor.padStart(8, 'ff')
  const r = hex.substring(6, 8), g = hex.substring(4, 6), b = hex.substring(2, 4)
  return ('#' + r + g + b).toUpperCase()
}
function hexToKmlColor(hex) {
  if (!hex || hex.length < 7) return 'ff0000ff'
  const r = hex.substring(1,3), g = hex.substring(3,5), b = hex.substring(5,7)
  return 'ff' + b + g + r
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
  const [isKmzModalOpen, setIsKmzModalOpen] = useState(false)
  const [kmzRows, setKmzRows] = useState([])
  const kmzRef = useRef(null)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })

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
      jalur_id_manual: '',
      route_waypoints: item.route_waypoints || null,
      warna_jalur: item.warna_jalur || '#FF0000'
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
        route_waypoints: form.route_waypoints || null,
        warna_jalur: form.warna_jalur || '#FF0000',
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

  const handleExportExcel = () => {
    const dataToExport = filtered.map(p => ({
      'Jalur ID': p.jalur_id,
      'Nama Jalur': p.nama_jalur,
      Site: p.site,
      'Panjang (m)': p.panjang_meter,
      'Tipe Kabel': p.tipe_kabel,
      Kecamatan: p.kecamatan,
      Desa: p.desa,
      Keterangan: p.keterangan,
      'Diinput Oleh': getUserName(p.created_by),
      Tanggal: format(new Date(p.created_at), 'dd MMM yyyy HH:mm', { locale: localeId })
    }))
    const ws = XLSX.utils.json_to_sheet(dataToExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data Jalur FO')
    XLSX.writeFile(wb, `Data_Jalur_FO_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`)
  }


  const handleImportKmz = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const arrayBuffer = await file.arrayBuffer()
      const zip = await JSZip.loadAsync(arrayBuffer)
      const kmlFile = Object.values(zip.files).find(f => f.name.endsWith('.kml'))
      if (!kmlFile) { toast.error('File KMZ tidak valid (tidak ada .kml di dalamnya)'); return }
      const kmlText = await kmlFile.async('string')
      const parser = new DOMParser()
      const xml = parser.parseFromString(kmlText, 'text/xml')
      const placemarks = Array.from(xml.querySelectorAll('Placemark'))
      const lines = []
      for (const pm of placemarks) {
        // LineString is only for lines, not points
        if (!pm.querySelector('LineString')) continue
        
        const lineEl = pm.querySelector('LineString coordinates') || pm.querySelector('coordinates')
        if (!lineEl) continue
        const rawCoords = lineEl.textContent.trim().split(/\s+/)
        const waypoints = rawCoords.map(c => {
          const [lon, lat] = c.split(',').map(Number)
          return (isNaN(lat) || isNaN(lon)) ? null : { lat, lon }
        }).filter(Boolean)
        if (waypoints.length < 2) continue
        const name = pm.querySelector('name')?.textContent?.trim() || 'Jalur FO'
        
        let rawDesc = pm.querySelector('description')?.textContent?.trim() || ''
        // Kadang description dari google earth berisi tag HTML. Kita hilangkan tag-nya.
        if (rawDesc) {
           const div = document.createElement('div')
           div.innerHTML = rawDesc
           rawDesc = div.textContent || div.innerText || ''
        }
        const description = rawDesc
        
        // Extract color from StyleMap or Style
        let color = '#FF0000'
        let styleUrl = pm.querySelector('styleUrl')?.textContent?.trim()?.replace('#', '')
        
        if (styleUrl) {
          // Check if it's a StyleMap
          const styleMap = xml.querySelector(`StyleMap[id="${styleUrl}"]`)
          if (styleMap) {
            const pairs = Array.from(styleMap.querySelectorAll('Pair'))
            const normalPair = pairs.find(p => p.querySelector('key')?.textContent === 'normal') || pairs[0]
            if (normalPair) {
              const normalUrl = normalPair.querySelector('styleUrl')?.textContent?.trim()?.replace('#', '')
              if (normalUrl) styleUrl = normalUrl
            }
          }
        }
        
        const styleEls = Array.from(xml.querySelectorAll('Style'))
        const matchedStyle = styleEls.find(s => s.getAttribute('id') === styleUrl)
        const lineColor = (matchedStyle || pm).querySelector('LineStyle color')?.textContent?.trim()
        if (lineColor) color = kmlColorToHex(lineColor)
        
        const panjang = calcPolylineLength(waypoints)
        lines.push({ nama_jalur: name, warna_jalur: color, waypoints, panjang, description, _selected: true, _id: Math.random().toString(36).slice(2) })
      }
      if (lines.length === 0) { toast.error('Tidak ditemukan jalur garis (LineString) di file KMZ ini'); return }
      setKmzRows(lines)
      setIsKmzModalOpen(true)
      toast.success(`Ditemukan ${lines.length} jalur dari file KMZ`)
    } catch(err) {
      toast.error('Gagal baca KMZ: ' + err.message)
    }
    if (kmzRef.current) kmzRef.current.value = ''
  }

  const processKmzImport = async () => {
    const toImport = kmzRows.filter(r => r._selected)
    if (!toImport.length) return
    setSaving(true)
    setImportProgress({ current: 0, total: toImport.length })
    let successCount = 0
    try {
      let localItems = [...items]
      const allPayloads = []
      
      for (const r of toImport) {
        // Gunakan nama_jalur dari KMZ apa adanya sebagai jalur_id.
        // Jika kosong, gunakan string fallback saja.
        const jId = r.nama_jalur.trim() || `Jalur-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
        
        // Preserve user-edited fields from existing DB record if ID matches
        const existing = items.find(i => i.jalur_id === jId)

        const payload = {
          jalur_id: jId,
          nama_jalur: r.nama_jalur,
          site: r.site || existing?.site || 'banyumas',
          panjang_meter: r.panjang,
          route_waypoints: r.waypoints,
          warna_jalur: r.warna_jalur,
          tipe_kabel: existing?.tipe_kabel || 'ADSS',
          provinsi: existing?.provinsi || 'Jawa Tengah',
          kabupaten: existing?.kabupaten || 'Banyumas',
          kecamatan: existing?.kecamatan || '',
          desa: existing?.desa || '',
          keterangan: r.description || existing?.keterangan || '',
          created_by: existing ? existing.created_by : profile.id
        }
        allPayloads.push(payload)
      }

      // Deduplicate by jalur_id - keep last occurrence (latest from KMZ)
      const dedupMap = new Map()
      for (const p of allPayloads) dedupMap.set(p.jalur_id, p)
      const uniquePayloads = Array.from(dedupMap.values())

      const chunkSize = 50
      for (let i = 0; i < uniquePayloads.length; i += chunkSize) {
        const chunk = uniquePayloads.slice(i, i + chunkSize)
        // Upsert so it UPDATES existing rows if ID already exists in DB
        const { error } = await supabase.from('network_jalur_fo').upsert(chunk, { onConflict: 'jalur_id' })
        if (error) {
          console.error("KMZ Insert Error:", error)
          throw new Error(error.message || 'Gagal menyimpan batch data')
        }
        successCount += chunk.length
        setImportProgress({ current: Math.min(i + chunkSize, allPayloads.length), total: allPayloads.length })
      }

      toast.success(`${successCount} jalur berhasil diimport dari KMZ!`)
      setIsKmzModalOpen(false)
      fetchData()
    } catch(e) { toast.error('Gagal import KMZ: ' + e.message) }
    finally {
      setSaving(false)
      setTimeout(() => setImportProgress({ current: 0, total: 0 }), 500)
    }
  }

  const handleExportKmz = async () => {
    const toExport = filtered.filter(item => item.route_waypoints?.length > 1)
    if (!toExport.length) { toast.error('Tidak ada jalur dengan data waypoints untuk di-export KMZ'); return }
    const kmlLines = toExport.map(item => {
      const color = hexToKmlColor(item.warna_jalur || '#FF0000')
      const coordStr = (item.route_waypoints || []).map(p => `${p.lon},${p.lat},0`).join(' ')
      return `    <Placemark>
      <name>${item.nama_jalur || item.jalur_id}</name>
      <description><![CDATA[${item.keterangan || ''}]]></description>
      <Style><LineStyle><color>${color}</color><width>3</width></LineStyle></Style>
      <LineString><coordinates>${coordStr}</coordinates></LineString>
    </Placemark>`
    }).join('\n')
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Data Jalur FO Maintory</name>
${kmlLines}
  </Document>
</kml>`
    const zip = new JSZip()
    zip.file('jalur_fo.kml', kml)
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `Jalur_FO_${new Date().toISOString().slice(0,10)}.kmz`
    a.click(); URL.revokeObjectURL(url)
    toast.success(`${toExport.length} jalur diekspor ke KMZ!`)
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
    setImportProgress({ current: 0, total: importRows.length })
    let successCount = 0
    try {
      let localItems = [...items]
      const allPayloads = []

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
        allPayloads.push(payload)
        localItems.push({ site: r.site, desa: r.desa, jalur_id: jId })
      }

      const chunkSize = 50
      for (let i = 0; i < allPayloads.length; i += chunkSize) {
        const chunk = allPayloads.slice(i, i + chunkSize)
        const { error } = await supabase.from('network_jalur_fo').insert(chunk)
        if (error) {
          console.error("Excel Insert Error:", error)
          throw new Error(error.message || 'Gagal menyimpan batch data')
        }
        successCount += chunk.length
        setImportProgress({ current: Math.min(i + chunkSize, allPayloads.length), total: allPayloads.length })
      }

      toast.success(`${successCount} dari ${importRows.length} baris berhasil diimpor!`)
      setIsImportModalOpen(false)
      fetchData()
    } catch (e) { toast.error(e.message || 'Gagal impor data') }
    finally {
      setSaving(false)
      setTimeout(() => setImportProgress({ current: 0, total: 0 }), 500)
    }
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
          <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Globe size={14} /> Import KMZ
            <input ref={kmzRef} type="file" accept=".kmz,.kml" style={{ display: 'none' }} onChange={handleImportKmz} />
          </label>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setExcelMenuOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Download size={14} /> Export <ChevronDown size={13} style={{ transform: excelMenuOpen ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
            </button>
            {excelMenuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setExcelMenuOpen(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', minWidth: '180px', overflow: 'hidden' }}>
                  <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setExcelMenuOpen(false); handleExportExcel() }}><Download size={13} /> Export ke Excel</button>
                  <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setExcelMenuOpen(false); handleExportKmz() }}><Globe size={13} /> Export ke KMZ (Google Earth)</button>
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
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('panjang_meter')}>Panjang (m) <SortIcon col="panjang_meter" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('tipe_kabel')}>Tipe Kabel <SortIcon col="tipe_kabel" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kecamatan')}>Kecamatan <SortIcon col="kecamatan" /></th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('desa')}>Desa <SortIcon col="desa" /></th>
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
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {item.warna_jalur && <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: item.warna_jalur, flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }} />}
                          <span style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{item.jalur_id}</span>
                        </div>
                      </td>
                      <td>
                        <div>
                          {item.nama_jalur || '-'}
                          {item.route_waypoints?.length > 1 && <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.route_waypoints.length} titik koordinat</div>}
                        </div>
                      </td>
                      <td>{item.panjang_meter ? item.panjang_meter + ' m' : '-'}</td>
                      <td>{item.tipe_kabel || '-'}</td>
                      <td>{item.kecamatan || '-'}</td>
                      <td>{item.desa || '-'}</td>
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
                  <label className="form-label">Warna Jalur</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="color" value={form.warna_jalur || '#FF0000'} onChange={e => setForm(f => ({ ...f, warna_jalur: e.target.value }))} style={{ height: '34px', width: '50px', padding: '2px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent' }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{form.warna_jalur || '#FF0000'}</span>
                  </div>
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

      {/* KMZ IMPORT PREVIEW MODAL */}
      {isKmzModalOpen && (
        <div className="modal-overlay" onClick={() => setIsKmzModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '760px', width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Globe size={20} style={{ color: 'var(--accent)' }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px' }}>Import KMZ — {kmzRows.length} jalur ditemukan</h3>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>Hanya garis (LineString) yang diimport. Titik/pin diabaikan otomatis.</p>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setIsKmzModalOpen(false)}><X size={18} /></button>
            </div>

            {/* Set all site bar */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Set semua ke:</span>
              <select className="form-input" style={{ height: '30px', fontSize: '12px', maxWidth: '180px', padding: '0 8px' }}
                onChange={e => { if (e.target.value) setKmzRows(rows => rows.map(r => ({ ...r, site: e.target.value }))) }}>
                <option value="">-- Pilih site --</option>
                {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox"
                  id="kmz-select-all"
                  checked={kmzRows.length > 0 && kmzRows.every(r => r._selected)}
                  onChange={e => setKmzRows(rows => rows.map(r => ({ ...r, _selected: e.target.checked })))}
                />
                <label htmlFor="kmz-select-all" style={{ fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  Pilih semua ({kmzRows.length})
                </label>
              </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {kmzRows.map((r, i) => (
                <div key={r._id}
                  onClick={() => setKmzRows(rows => rows.map((row, ri) => ri === i ? { ...row, _selected: !row._selected } : row))}
                  style={{
                    display: 'grid', gridTemplateColumns: '28px 6px 1fr auto auto', gap: '10px', alignItems: 'center',
                    padding: '10px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    border: '1px solid ' + (r._selected ? 'rgba(59,130,246,0.4)' : 'var(--border)'),
                    background: r._selected ? 'rgba(59,130,246,0.06)' : 'var(--bg-primary)',
                    transition: 'all 0.15s'
                  }}>
                  {/* Checkbox */}
                  <input type="checkbox" checked={r._selected}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setKmzRows(rows => rows.map((row, ri) => ri === i ? { ...row, _selected: e.target.checked } : row))}
                    style={{ width: '15px', height: '15px' }}
                  />
                  {/* Color swatch */}
                  <div style={{ width: '6px', height: '36px', borderRadius: '4px', background: r.warna_jalur, flexShrink: 0 }} />
                  {/* Info */}
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nama_jalur}</div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '3px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>📍 {r.waypoints.length} titik</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>📏 {r.panjang >= 1000 ? (r.panjang / 1000).toFixed(2) + ' km' : r.panjang + ' m'}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{r.warna_jalur}</span>
                    </div>
                  </div>
                  {/* Site selector */}
                  <select className="form-input"
                    onClick={e => e.stopPropagation()}
                    style={{ height: '30px', fontSize: '12px', padding: '0 8px', minWidth: '150px', flexShrink: 0,
                      borderColor: r._selected && !r.site ? 'var(--danger)' : undefined }}
                    value={r.site || ''}
                    onChange={e => setKmzRows(rows => rows.map((row, ri) => ri === i ? { ...row, site: e.target.value } : row))}>
                    <option value="">-- Pilih Site --</option>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Warning */}
            {kmzRows.filter(r => r._selected).some(r => !r.site) && (
              <div style={{ margin: '0 16px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--danger)' }}>
                ⚠️ Ada jalur yang dipilih belum diisi sitanya. Lengkapi semua kolom Site sebelum import.
              </div>
            )}

            {/* Footer */}
            <div className="modal-footer" style={{ flexShrink: 0, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {saving && importProgress.total > 0 && (
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    <span>Mengimport data...</span>
                    <span>{importProgress.current} / {importProgress.total}</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--accent)', width: `${(importProgress.current / importProgress.total) * 100}%`, transition: 'width 0.2s' }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {kmzRows.filter(r => r._selected).length} dari {kmzRows.length} jalur dipilih
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-secondary" onClick={() => setIsKmzModalOpen(false)} disabled={saving}>Batal</button>
                  <button className="btn btn-primary"
                    disabled={saving || kmzRows.filter(r => r._selected).length === 0 || kmzRows.filter(r => r._selected).some(r => !r.site)}
                    onClick={processKmzImport}>
                    {saving ? 'Mengimport...' : `Import ${kmzRows.filter(r => r._selected).length} Jalur`}
                  </button>
                </div>
              </div>
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
            <div className="modal-footer" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {saving && importProgress.total > 0 && (
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    <span>Mengimport data...</span>
                    <span>{importProgress.current} / {importProgress.total}</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--accent)', width: `${(importProgress.current / importProgress.total) * 100}%`, transition: 'width 0.2s' }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
                <button className="btn btn-secondary" onClick={() => setIsImportModalOpen(false)} disabled={saving}>Batal</button>
                <button className="btn btn-primary" onClick={processImport} disabled={saving}>
                  {saving ? 'Mengimport...' : 'Import ' + importRows.filter(r => r._selected && !r._error).length + ' data'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
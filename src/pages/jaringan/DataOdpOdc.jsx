import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useProgress } from '../../contexts/ProgressContext'
import toast from 'react-hot-toast'
import {
  Plus, X, Edit2, Trash2, MapPin, Search, Download,
  ChevronDown, ChevronUp, ExternalLink, Antenna, Upload,
  FileSpreadsheet, Map, Settings as SettingsIcon, AlertTriangle,
  CheckSquare, Square, Eraser, Scissors, RotateCcw, RefreshCw
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
const DEVICE_TYPES = [
  { value: 'ODP', label: 'ODP (Optical Distribution Point)' },
  { value: 'ODC', label: 'ODC (Optical Distribution Cabinet)' },
]
// Kapasitas port berdasarkan jenis perangkat
const ODP_CAPACITIES = [
  { value: '8 Port', label: '8 Port' },
  { value: '16 Port', label: '16 Port' },
  { value: '24 Port', label: '24 Port' },
]
const ODC_CAPACITIES = [
  { value: '48 Port', label: '48 Port' },
  { value: '96 Port', label: '96 Port' },
  { value: '144 Port', label: '144 Port' },
  { value: '288 Port', label: '288 Port' },
]
const EMPTY_FORM = {
  site: 'banyumas', type: 'ODP', jenis_box: '', kapasitas: '',
  pole_id: '', divisi: '',
  jenis_kabel_power: '', core_power: '', jarak_ke_olt: '', pon: '',
  provinsi: 'Jawa Tengah', kabupaten: 'Banyumas',
  kecamatan: '', desa: '', maps_url: '',
  longitude: '', latitude: '', keterangan: '',
  parent_odc: '', // ID induk ODC jika ini ODP
}
const DEFAULT_FORMAT = 'NAT/{SITE_CODE}/{DESA}/{TYPE}/{NO}'

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function generateDeviceId(site, desa, type, existingDevices, formatTemplate = DEFAULT_FORMAT, parentOdcId = null) {
  if (!desa || !type) return ''
  const siteCode = SITE_CODE[site] || 'BMS'
  const desaSlug = desa.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').substring(0, 15)
  const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  
  let sameDevices
  if (parentOdcId && type === 'ODP') {
     sameDevices = existingDevices.filter(p => p.device_id && p.device_id.startsWith(`${parentOdcId}/ODP`))
  } else {
     sameDevices = existingDevices.filter(
       p => p.site === site && p.type === type && p.desa?.toUpperCase().trim() === desa.toUpperCase().trim() && p.device_id
     )
  }

  let maxNo = 0
  for (const p of sameDevices) {
    let match
    if (parentOdcId && type === 'ODP') {
        const regex = new RegExp(`^${escapeRegExp(parentOdcId)}/ODP/(\\d+)`, 'i')
        match = p.device_id.match(regex)
    } else {
        match = p.device_id.match(new RegExp(`${type}\\s+(\\d+)`, 'i'))
        if (!match) match = p.device_id.match(new RegExp(`${type}/(\\d+)`, 'i'))
    }

    if (match && match[1]) {
      const num = parseInt(match[1], 10)
      if (num > maxNo) maxNo = num
    } else {
      const fallback = p.device_id.match(/\d+$/)
      if (fallback) {
        const num = parseInt(fallback[0], 10)
        if (num > maxNo) maxNo = num
      }
    }
  }

  if (maxNo === 0) maxNo = sameDevices.length
  const no = String(maxNo + 1).padStart(3, '0')
  
  if (parentOdcId && type === 'ODP') {
      return `${parentOdcId}/ODP/${no}`
  }

  return formatTemplate
    .replace(/{SITE_CODE}/g, siteCode)
    .replace(/{DESA}/g, desaSlug)
    .replace(/{TYPE}/g, type)
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

function getDistanceFromLatLonInm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity
  const R = 6371e3 // Radius bumi dalam meter
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

/** Konversi Decimal ke format DMS string, misal: 7°36'53.21"S */
function decimalToDMS(dec, isLat) {
  if (dec === null || dec === undefined || isNaN(dec)) return '';
  const absDec = Math.abs(dec);
  const d = Math.floor(absDec);
  const mDec = (absDec - d) * 60;
  const m = Math.floor(mDec);
  const s = ((mDec - m) * 60).toFixed(2);
  const dir = dec < 0 ? (isLat ? 'S' : 'W') : (isLat ? 'N' : 'E');
  return `${d}°${m}'${s}"${dir}`;
}

function parseDMS(dmsStr) {
  if (!dmsStr) return null;
  const str = String(dmsStr).trim();
  // Regex untuk menangkap derajat, menit, detik, dan arah (N, S, E, W)
  const regex = /(-?\d+)[°\s]+(\d+)['\s]+([\d.]+)[″"\s]*([NSEW]?)/i;
  const match = str.match(regex);
  if (!match) return null;
  const [_, d, m, s, dir] = match;
  let dec = Math.abs(parseInt(d)) + parseInt(m) / 60 + parseFloat(s) / 3600;
  const upperDir = (dir || '').toUpperCase();
  if (upperDir === 'S' || upperDir === 'W' || parseInt(d) < 0) dec = -dec;
  // Format menjadi 7 digit desimal
  return Number(dec.toFixed(7));
}

// ─── KMZ GENERATION ──────────────────────────────────────────────────────────
async function generateKMZ(devices, users) {
  const getUserName = (uid) => users.find(u => u.id === uid)?.full_name || 'Unknown'
  const escapeXml = (unsafe) => String(unsafe || '').replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case '\'': return '&apos;'
      case '"': return '&quot;'
      default: return c
    }
  })

  // Kelompokkan odpOdc per desa
  const byDesa = {}
  for (const p of devices) {
    if (!p.latitude || !p.longitude) continue
    const desaKey = p.desa || 'Tanpa Desa'
    if (!byDesa[desaKey]) byDesa[desaKey] = []
    byDesa[desaKey].push(p)
  }

  const makePlacemark = (p) => {
    let lat = Number(p.latitude)
    let lon = Number(p.longitude)
    // Auto-swap jika koordinat terbalik
    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
      const temp = lat; lat = lon; lon = temp
    }
    return `
      <Placemark>
        <name>${escapeXml(p.device_id || 'ODP/ODC')}</name>
        <description><![CDATA[
          <b>Site:</b> ${SITES.find(s => s.value === p.site)?.label || p.site}<br/>
          <b>Jenis:</b> ${p.type || '-'}<br/>
          <b>Kapasitas:</b> ${p.kapasitas || '-'}<br/>
          <b>Jenis Kabel Power:</b> ${p.jenis_kabel_power || '-'}<br/>
          <b>Core Power:</b> ${p.core_power || '-'}<br/>
          <b>PON:</b> ${p.pon || '-'}<br/>
          <b>Jarak ke OLT/Server:</b> ${p.jarak_ke_olt ? p.jarak_ke_olt + ' meter' : '-'}<br/>
          <b>Kecamatan:</b> ${p.kecamatan || '-'}<br/>
          <b>Desa:</b> ${p.desa || '-'}<br/>
          <b>Jalan/Gang:</b> ${p.jalan || '-'}<br/>
          <b>Keterangan:</b> ${p.keterangan || '-'}<br/>
          <b>Diinput Oleh:</b> ${getUserName(p.created_by)}<br/>
          ${p.maps_url ? `<a href="${p.maps_url}">Lihat di Google Maps</a>` : ''}
        ]]></description>
        <styleUrl>#${p.type === 'ODC' ? 'odc_icon' : 'odp_icon'}</styleUrl>
        <Point><coordinates>${lon},${lat},0</coordinates></Point>
      </Placemark>`
  }

  // Buat folder per desa
  const folders = Object.entries(byDesa)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([desa, odpOdcList]) => `
    <Folder>
      <name>Desa ${escapeXml(desa)}</name>
      <open>0</open>
      ${odpOdcList.map(p => makePlacemark(p)).join('\n')}
    </Folder>`).join('\n')

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Data ODP &amp; ODC Maintory - ${format(new Date(), 'dd MMM yyyy')}</name>
    <description>Export Data ODP &amp; ODC Jaringan Fiber — ${devices.length} titik</description>
    <Style id="odp_icon">
      <IconStyle><scale>1.2</scale><Icon><href>files/icon_odp.png</href></Icon><hotSpot x="0.5" y="0" xunits="fraction" yunits="fraction"/></IconStyle>
      <LabelStyle><color>ffccff00</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="odc_icon">
      <IconStyle><scale>1.4</scale><Icon><href>files/icon_odc.png</href></Icon><hotSpot x="0.5" y="0" xunits="fraction" yunits="fraction"/></IconStyle>
      <LabelStyle><color>ffff6600</color><scale>0.9</scale></LabelStyle>
    </Style>
    ${folders}
  </Document>
</kml>`

  const zip = new JSZip()
  zip.file('doc.kml', kml)
  try {
    const iconRespOdp = await fetch('/icon_odp.png')
    const iconBlobOdp = await iconRespOdp.blob()
    zip.folder('files').file('icon_odp.png', iconBlobOdp)
  } catch {}
  try {
    const iconRespOdc = await fetch('/icon_odc.png')
    const iconBlobOdc = await iconRespOdc.blob()
    zip.folder('files').file('icon_odc.png', iconBlobOdc)
  } catch {}

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Data ODP & ODC ${format(new Date(), 'dd-MM-yyyy')}.kmz`
  a.click()
  URL.revokeObjectURL(url)
}


// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function DataOdpOdc() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const { showProgress, hideProgress } = useProgress()
  const importRef = useRef(null)

  const [devices, setDevices] = useState([])
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
  const [networkPoles, setNetworkPoles] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [proximityWarning, setProximityWarning] = useState(null)
  
  const [isKmzModalOpen, setIsKmzModalOpen] = useState(false)
  const [kmzFilterKecamatan, setKmzFilterKecamatan] = useState('')
  const [kmzFilterDesa, setKmzFilterDesa] = useState('')

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmRetroactive, setConfirmRetroactive] = useState(false)
  
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

  // Cabut ODP/ODC
  const [filterStatus, setFilterStatus] = useState('active') // 'active' | 'dismantled' | 'all'
  const [cabutModal, setCabutModal] = useState(null) // device yang akan dicabut
  const [cabutNotes, setCabutNotes] = useState('')
  const [cabutDate, setCabutDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [cabutSaving, setCabutSaving] = useState(false)
  const [syncingPoles, setSyncingPoles] = useState(false)

  // Pagination
  const [page, setPage] = useState(1)
  const perPage = 15

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Supabase membatasi maksimal 1000 baris per request. 
      // Karena data odpOdc bisa ribuan, kita harus fetch berulang (pagination) sampai habis.
      let allPoles = []
      let from = 0
      const step = 1000
      
      while (true) {
        const { data, error } = await supabase
          .from('network_odp_odc')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true }) // Mencegah bug pagination skip data jika created_at kembar
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

      let allNetworkPoles = []
      let poleFrom = 0
      while (true) {
        const { data, error } = await supabase
          .from('network_poles')
          .select('id, pole_id, latitude, longitude, desa, kecamatan')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .order('id', { ascending: true })
          .range(poleFrom, poleFrom + step - 1)
          
        if (error) throw error
        if (data && data.length > 0) {
          allNetworkPoles = [...allNetworkPoles, ...data]
          if (data.length < step) break
          poleFrom += step
        } else {
          break
        }
      }

      const [usersRes, settingsRes] = await Promise.all([
        supabase.from('users').select('id, full_name'),
        supabase.from('app_settings').select('device_id_format').maybeSingle()
      ])
      
      setDevices(allPoles)
      if (usersRes.data) setUsers(usersRes.data)
      if (settingsRes.data?.device_id_format) {
        setIdFormat(settingsRes.data.device_id_format)
        setFormatForm(settingsRes.data.device_id_format)
      }
      setNetworkPoles(allNetworkPoles)
    } catch { toast.error('Gagal memuat data') }
    finally { setLoading(false) }
  }

  const getUserName = (uid) => users.find(u => u.id === uid)?.full_name || '-'

  const kecamatanList = useMemo(() => [...new Set(devices.map(p => p.kecamatan).filter(Boolean))].sort(), [devices])
  const desaList = useMemo(() => {
    let list = devices
    if (filterKecamatan) list = list.filter(p => p.kecamatan === filterKecamatan)
    return [...new Set(list.map(p => p.desa).filter(Boolean))].sort()
  }, [devices, filterKecamatan])

  const kmzDesaList = useMemo(() => {
    let list = devices
    if (kmzFilterKecamatan) list = list.filter(p => p.kecamatan === kmzFilterKecamatan)
    return [...new Set(list.map(p => p.desa).filter(Boolean))].sort()
  }, [devices, kmzFilterKecamatan])

  // ── CASCADING OPTIONS UNTUK FORM TAMBAH/EDIT ──
  const provinsiOpts = useMemo(() => [...new Set(devices.map(p => p.provinsi).filter(Boolean))].sort(), [devices])
  const kabupatenOpts = useMemo(() => {
    let list = devices
    if (form.provinsi) list = list.filter(p => p.provinsi === form.provinsi)
    return [...new Set(list.map(p => p.kabupaten).filter(Boolean))].sort()
  }, [devices, form.provinsi])
  const kecamatanOpts = useMemo(() => {
    let list = devices
    if (form.kabupaten) list = list.filter(p => p.kabupaten === form.kabupaten)
    return [...new Set(list.map(p => p.kecamatan).filter(Boolean))].sort()
  }, [devices, form.kabupaten])
  const desaOpts = useMemo(() => {
    let list = devices
    if (form.kecamatan) list = list.filter(p => p.kecamatan === form.kecamatan)
    return [...new Set(list.map(p => p.desa).filter(Boolean))].sort()
  }, [devices, form.kecamatan])

  const filtered = useMemo(() => {
    let data = [...devices]
    // Filter status odpOdc (aktif / dicabut / semua)
    if (filterStatus === 'active') data = data.filter(p => !p.status || p.status === 'active')
    else if (filterStatus === 'dismantled') data = data.filter(p => p.status === 'dismantled')
    if (filterSite) data = data.filter(p => p.site === filterSite)
    if (filterKecamatan) data = data.filter(p => p.kecamatan === filterKecamatan)
    if (filterDesa) data = data.filter(p => p.desa === filterDesa)
    if (filterType) data = data.filter(p => p.type === filterType)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      data = data.filter(p => p.device_id?.toLowerCase().includes(q) || p.desa?.toLowerCase().includes(q) || p.kecamatan?.toLowerCase().includes(q) || p.keterangan?.toLowerCase().includes(q))
    }
    data.sort((a, b) => {
      let va = a[sortKey] ?? '', vb = b[sortKey] ?? ''
      if (va === vb) {
        let ida = a.device_id ?? '', idb = b.device_id ?? ''
        return ida > idb ? 1 : (ida < idb ? -1 : 0)
      }
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
    })
    return data
  }, [devices, filterStatus, filterSite, filterKecamatan, filterDesa, filterType, searchQuery, sortKey, sortDir])

  const paginated = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page])
  const totalPages = Math.ceil(filtered.length / perPage)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const SortIcon = ({ col }) => sortKey !== col ? <ChevronDown size={11} style={{ opacity: 0.3 }} /> : sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setIsModalOpen(true) }
  const openEdit = (device) => {
    setEditingId(device.id)
    setForm({
      site: device.site || 'banyumas', type: device.type || 'ODP',
      provinsi: device.provinsi || '', kabupaten: device.kabupaten || '',
      kecamatan: device.kecamatan || '', desa: device.desa || '',
      maps_url: device.maps_url || '', longitude: device.longitude || '',
      latitude: device.latitude || '', keterangan: device.keterangan || '',
      jenis_kabel_power: device.jenis_kabel_power || '', core_power: device.core_power || '', pon: device.pon || '',
      jarak_ke_olt: device.jarak_ke_olt || '',
    })
    setIsModalOpen(true)
  }

  const findNearestPole = (lat, lon) => {
    if (!lat || !lon || networkPoles.length === 0) return null
    let nearestPole = null
    let nearestDist = Infinity
    for (const p of networkPoles) {
      if (!p.latitude || !p.longitude) continue
      const dist = getDistanceFromLatLonInm(Number(p.latitude), Number(p.longitude), lat, lon)
      if (dist < nearestDist) {
        nearestDist = dist
        nearestPole = { ...p, _dist: dist }
      }
    }
    // Only link if the nearest pole is within 10m radius
    return nearestPole && nearestDist <= 10 ? nearestPole : null
  }

  const executeSave = async () => {
    setSaving(true)
    setProximityWarning(null)
    showProgress('Menyimpan ODP/ODC', 'Mengirim data ke server...', 50)
    try {
      const lat = form.latitude ? Number(form.latitude) : null
      const lon = form.longitude ? Number(form.longitude) : null

      // Smart nearest-pole auto-link
      let linked_pole_id = form.pole_id || null
      if (lat && lon) {
        const nearestPole = findNearestPole(lat, lon)
        if (nearestPole) linked_pole_id = nearestPole.id
      }

      const payload = {
        ...form,
        longitude: lon,
        latitude: lat,
        pole_id: linked_pole_id,
        updated_by: profile.id,
      }
      if (editingId) {
        const { error } = await supabase.from('network_odp_odc').update(payload).eq('id', editingId)
        if (error) throw error
        const poleInfo = linked_pole_id ? ` (Tiang: ${networkPoles.find(p => p.id === linked_pole_id)?.pole_id || linked_pole_id})` : ''
        toast.success(`Data ODP/ODC diperbarui!${poleInfo}`)
      } else {
        const deviceId = generateDeviceId(form.site, form.desa, form.type, devices, idFormat, form.parent_odc)
        const { error } = await supabase.from('network_odp_odc').insert({ ...payload, device_id: deviceId, created_by: profile.id })
        if (error) throw error
        const poleInfo = linked_pole_id ? ` → Terpasang di Tiang: ${networkPoles.find(p => p.id === linked_pole_id)?.pole_id || linked_pole_id}` : ''
        toast.success(`${deviceId} ditambahkan!${poleInfo}`)
      }
      setIsModalOpen(false)
      fetchData()
    } catch (e) { toast.error(e.message || 'Terjadi kesalahan') }
    finally { 
      setSaving(false)
      hideProgress()
    }
  }

  const handleSyncPoles = async () => {
    if (networkPoles.length === 0) return toast.error('Data tiang belum dimuat. Tunggu sebentar dan coba lagi.')
    
    const needsSync = devices.filter(d => d.latitude && d.longitude)
    if (needsSync.length === 0) return toast.info('Tidak ada ODP/ODC dengan koordinat GPS.')
    
    setSyncingPoles(true)
    showProgress('Sinkronisasi Tiang', `Mencari tiang terdekat (radius 50m) untuk ${needsSync.length} ODP/ODC...`, 10)
    
    let updates = []
    const SYNC_RADIUS_M = 50  // radius lebih longgar untuk sinkronisasi manual
    
    for (const d of needsSync) {
      const lat = Number(d.latitude)
      const lon = Number(d.longitude)
      let nearestDist = Infinity
      let nearestPole = null
      for (const p of networkPoles) {
        if (!p.latitude || !p.longitude) continue
        const dist = getDistanceFromLatLonInm(Number(p.latitude), Number(p.longitude), lat, lon)
        if (dist < nearestDist) {
          nearestDist = dist
          nearestPole = p
        }
      }
      if (nearestPole && nearestDist <= SYNC_RADIUS_M) {
        updates.push({
          id: d.id,
          device_id: d.device_id,
          pole_id: nearestPole.id,
          pole_label: nearestPole.pole_id || nearestPole.id,
          dist: Math.round(nearestDist),
          latitude: Number(nearestPole.latitude),
          longitude: Number(nearestPole.longitude),
        })
      }
    }
    
    if (updates.length === 0) {
      setSyncingPoles(false)
      hideProgress()
      return toast.info(`Tidak ada tiang ditemukan dalam radius ${SYNC_RADIUS_M}m dari ODP/ODC manapun.`)
    }
    
    showProgress('Sinkronisasi Tiang', `Menyimpan ${updates.length} sinkronisasi...`, 50)
    
    try {
      const chunkSize = 10
      const totalChunks = Math.ceil(updates.length / chunkSize)
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize)
        await Promise.all(chunk.map(u => 
          supabase.from('network_odp_odc').update({
            pole_id: u.pole_id,
            latitude: u.latitude,
            longitude: u.longitude,
            updated_by: profile.id
          }).eq('id', u.id)
        ))
        // Update progress: 50% → 95% selama proses simpan
        const chunkIndex = Math.floor(i / chunkSize) + 1
        const pct = 50 + Math.round((chunkIndex / totalChunks) * 45)
        showProgress('Sinkronisasi Tiang', `Menyimpan... (${Math.min(i + chunkSize, updates.length)}/${updates.length} data)`, pct)
      }
      toast.success(`✅ ${updates.length} ODP/ODC berhasil disinkronkan ke tiang terdekat!`)
      fetchData()
    } catch (err) {
      toast.error('Gagal melakukan sinkronisasi: ' + err.message)
      console.error(err)
    } finally {
      setSyncingPoles(false)
      hideProgress()
    }
  }

  const handleSave = async (bypassProximity = false) => {
    if (!form.kecamatan.trim()) return toast.error('Kecamatan wajib diisi!')
    if (!form.desa.trim()) return toast.error('Desa/Kelurahan wajib diisi!')
    
    // Cek Proximity (Jarak ODP/ODC) jika ada koordinat
    if (!bypassProximity && form.latitude && form.longitude) {
      const lat = Number(form.latitude)
      const lon = Number(form.longitude)
      let nearestDist = Infinity
      let nearestPole = null
      let conflictCount = 0

      for (const p of devices) {
        if (editingId && p.id === editingId) continue // Jangan cek diri sendiri saat edit
        if (!p.latitude || !p.longitude) continue
        
        const dist = getDistanceFromLatLonInm(lat, lon, Number(p.latitude), Number(p.longitude))
        if (dist <= 10) {
          conflictCount++
          if (dist < nearestDist) {
            nearestDist = dist
            nearestPole = p
          }
        }
      }

      if (conflictCount > 0) {
        setProximityWarning({
          count: conflictCount,
          dist: nearestDist,
          deviceId: nearestPole?.device_id || 'Unknown',
        })
        return // Hentikan proses simpan dan tampilkan modal warning
      }
    }

    await executeSave()
  }

  const handleDelete = async (device) => {
    showProgress('Menghapus ODP/ODC', 'Menghapus data...', 50)
    try {
      const { error } = await supabase.from('network_odp_odc').delete().eq('id', device.id)
      if (error) throw error
      toast.success('Data odpOdc dihapus')
      setConfirmDelete(null)
      fetchData()
    } catch { toast.error('Gagal menghapus data') }
    finally { hideProgress() }
  }

  const handleCabut = async () => {
    if (!cabutModal) return
    setCabutSaving(true)
    showProgress('Mencabut ODP/ODC', 'Menyimpan data pencabutan...', 50)
    try {
      const { error } = await supabase.from('network_odp_odc').update({
        status: 'dismantled',
        dismantled_at: cabutDate ? new Date(cabutDate).toISOString() : new Date().toISOString(),
        dismantled_notes: cabutNotes.trim() || null,
        dismantled_by: profile.id,
        updated_by: profile.id,
      }).eq('id', cabutModal.id)
      if (error) throw error
      toast.success(`ODP/ODC ${cabutModal.device_id} dicatat sebagai dicabut!`)
      setCabutModal(null)
      setCabutNotes('')
      fetchData()
    } catch (e) { toast.error(e.message || 'Gagal mencatat pencabutan') }
    finally { setCabutSaving(false); hideProgress() }
  }

  const handlePulihkan = async (device) => {
    showProgress('Memulihkan ODP/ODC', 'Memperbarui status...', 50)
    try {
      const { error } = await supabase.from('network_odp_odc').update({
        status: 'active',
        dismantled_at: null,
        dismantled_notes: null,
        dismantled_by: null,
        updated_by: profile.id,
      }).eq('id', device.id)
      if (error) throw error
      toast.success(`ODP/ODC ${device.device_id} dipulihkan kembali ke aktif!`)
      fetchData()
    } catch (e) { toast.error(e.message || 'Gagal memulihkan odpOdc') }
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
      setBulkDeleteModal({ mode, label: `${selectedIds.size} odpOdc yang dipilih`, filter: null })
    } else if (mode === 'desa') {
      if (!filterDesa) return toast.error('Pilih filter Desa terlebih dahulu!')
      setBulkDeleteModal({ mode, label: `semua odpOdc Desa "${filterDesa}"`, filter: { col: 'desa', val: filterDesa } })
    } else if (mode === 'kecamatan') {
      if (!filterKecamatan) return toast.error('Pilih filter Kecamatan terlebih dahulu!')
      setBulkDeleteModal({ mode, label: `semua odpOdc Kecamatan "${filterKecamatan}"`, filter: { col: 'kecamatan', val: filterKecamatan } })
    } else if (mode === 'all') {
      setBulkDeleteModal({ mode, label: `SELURUH DATA ODP/ODC`, filter: null })
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
        // Fetch ALL matching IDs from server (bypassing the 1000 limit)
        showProgress('Menyiapkan Data', `Mengambil daftar ID dari server...`, 10)
        let from = 0
        const step = 1000
        while (true) {
          let query = supabase.from('network_odp_odc').select('id').range(from, from + step - 1)
          if (filter) query = query.eq(filter.col, filter.val)
          
          const { data, error } = await query
          if (error) throw error
          if (!data || data.length === 0) break
          
          targetIds = [...targetIds, ...data.map(d => d.id)]
          if (data.length < step) break
          from += step
        }
      }

      if (targetIds.length === 0) {
        hideProgress()
        return toast.error('Tidak ada data yang cocok untuk dihapus!')
      }

      const chunkSize = 200
      for (let i = 0; i < targetIds.length; i += chunkSize) {
        const chunk = targetIds.slice(i, i + chunkSize)
        const pct = 20 + ((i / targetIds.length) * 70)
        showProgress('Menghapus Data', `Menghapus data ${i + 1} – ${Math.min(i + chunkSize, targetIds.length)} dari total ${targetIds.length} di server...`, pct)
        const { error } = await supabase.from('network_odp_odc').delete().in('id', chunk)
        if (error) throw error
      }

      if (mode === 'all') {
        showProgress('Memverifikasi', 'Memeriksa hasil penghapusan...', 92)
        const { count: remaining } = await supabase.from('network_odp_odc').select('id', { count: 'exact', head: true })
        
        hideProgress()
        if (remaining && remaining > 0) {
          toast.error(`⚠️ Penghapusan TIDAK LENGKAP! Masih ada ${remaining} odpOdc tersisa di database. Ulangi Hapus Semua sekali lagi.`, { duration: 8000 })
        } else {
          toast.success(`Seluruh data odpOdc berhasil dikosongkan (0 odpOdc tersisa)!`)
        }
      } else {
        hideProgress()
        toast.success(`${targetIds.length} odpOdc berhasil dihapus!`)
      }
      
      setSelectedIds(new Set())
      fetchData()
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
      const rows = filtered.map((p, i) => {
        const lat = p.latitude ? Number(p.latitude) : null
        const lon = p.longitude ? Number(p.longitude) : null
        return {
          'No': i + 1, 'Site': SITES.find(s => s.value === p.site)?.label || p.site,
          'ID ODP/ODC': p.device_id || '', 'Jenis ODP/ODC': DEVICE_TYPES.find(t => t.value === p.type)?.label || p.type,
          'Kapasitas': p.kapasitas || '',
          'Jenis Kabel Power': p.jenis_kabel_power || '', 'Core Power': p.core_power || '', 'PON': p.pon || '', 'Jarak ke OLT/Server (m)': p.jarak_ke_olt || '',
          'Provinsi': p.provinsi || '', 'Kabupaten/Kota': p.kabupaten || '', 'Kecamatan': p.kecamatan || '',
          'Desa/Kelurahan': p.desa || '', 'Jalan/Gang/Dusun': p.jalan || '', 'Maps URL': p.maps_url || '',
          'Latitude ( Decimal )': lat || '', 'Longitude ( Decimal )': lon || '',
          'Latitude ( dms )': lat ? decimalToDMS(lat, true) : '',
          'Longitude ( dms )': lon ? decimalToDMS(lon, false) : '',
          'Keterangan': p.keterangan || '', 'Diinput Oleh': getUserName(p.created_by),
          'Edit Oleh': getUserName(p.updated_by), 'Tanggal Input': p.created_at ? format(new Date(p.created_at), 'dd/MM/yyyy HH:mm') : '',
          'Tanggal Update': p.updated_at ? format(new Date(p.updated_at), 'dd/MM/yyyy HH:mm') : '',
        }
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Data ODP & ODC')
      XLSX.writeFile(wb, `Data ODP & ODC ${format(new Date(), 'dd-MM-yyyy')}.xlsx`)
      hideProgress()
      toast.success('Export Excel berhasil!')
    }, 500)
  }

  const openKmzModal = () => {
    setKmzFilterKecamatan('')
    setKmzFilterDesa('')
    setIsKmzModalOpen(true)
  }

  const handleExportKMZ = async () => {
    let targetData = [...devices]
    if (kmzFilterKecamatan) targetData = targetData.filter(p => p.kecamatan === kmzFilterKecamatan)
    if (kmzFilterDesa) targetData = targetData.filter(p => p.desa === kmzFilterDesa)

    const withCoords = targetData.filter(p => p.latitude && p.longitude)
    if (withCoords.length === 0) return toast.error('Tidak ada data dengan koordinat GPS pada filter tersebut')
    
    setIsKmzModalOpen(false)
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
    const template = [
      {
        'Site': 'BANYUMAS', 'Jenis ODP/ODC': 'ODP', 'Induk ODC': '1', 'Jenis Box': 'Box 8', 'Kapasitas': '8 Port',
        'Jenis Kabel Power': '1C', 'Core Power': 'Core 1-8', 'PON': 'PON 1/3', 'Jarak ke OLT/Server (m)': '1.500',
        'Provinsi': 'JAWA TENGAH', 'Kabupaten/Kota': 'CILACAP',
        'Kecamatan': 'KROYA', 'Desa/Kelurahan': 'MUJUR', 'Jalan/Gang/Dusun': 'Gg. BIMA',
        'Maps URL': '',
        'Latitude ( Decimal )': '',
        'Longitude ( Decimal )': '',
        'Latitude ( dms )': `7°36'52.20"S`,
        'Longitude ( dms )': `109°15'43.10"E`,
        'Keterangan': 'Contoh ODP: Induk ODC diisi angka 1 (akan mencari ODC 001 di desa tsb)'
      },
      {
        'Site': 'BANYUMAS', 'Jenis ODP/ODC': 'ODC', 'Induk ODC': '', 'Jenis Box': 'Box 144', 'Kapasitas': '144 Port',
        'Jenis Kabel Power': 'PE 24C', 'Core Power': 'Core 1-12', 'PON': 'PON 5', 'Jarak ke OLT/Server (m)': '2.000',
        'Provinsi': 'JAWA TENGAH', 'Kabupaten/Kota': 'BANYUMAS',
        'Kecamatan': 'PURWOKERTO SELATAN', 'Desa/Kelurahan': 'TANJUNG', 'Jalan/Gang/Dusun': 'Jl. Pahlawan',
        'Maps URL': '',
        'Latitude ( Decimal )': '-7.4321234',
        'Longitude ( Decimal )': '109.2345678',
        'Latitude ( dms )': '',
        'Longitude ( dms )': '',
        'Keterangan': 'Contoh: isi Decimal saja, DMS & Maps URL otomatis terisi'
      },
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 50 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, `Template Import ODP/ODC ${format(new Date(), 'dd-MM-yyyy')}.xlsx`)
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
        
        const mapped = []
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]

          let lat = Number(r['LATITUDE (LINTANG)'] || r['Latitude ( Decimal )'] || r['Latitude']) || null
          let lon = Number(r['LONGITUDE (BUJUR)'] || r['Longitude ( Decimal )'] || r['Longitude']) || null

          if (!lat || !lon) {
            let latDms = r['Latitude ( dms )'] || r['Latitude (dms)']
            let lonDms = r['Longitude ( dms )'] || r['Longitude (dms)']
            if (latDms && lonDms) {
              lat = parseDMS(latDms)
              lon = parseDMS(lonDms)
            }
          }

          if (!lat || !lon) {
            let mapsUrl = r['Maps URL'] || r['Maps'] || r['URL Google Maps']
            if (mapsUrl) {
              const extracted = extractCoordsFromUrl(mapsUrl)
              if (extracted) {
                lat = Number(extracted.latitude)
                lon = Number(extracted.longitude)
              }
            }
          }
          
          let typeStr = String(
            r['Jenis ODP/ODC'] || r['JENIS ODP/ODC'] || 
            r['Jenis'] || r['JENIS'] || r['Type'] || r['TYPE'] ||
            r['JENIS PASSIVE SPLITTER (ODP/FAT/ODU)'] || ''
          ).toUpperCase().trim()
          let type = typeStr.includes('ODC') ? 'ODC' : 'ODP'

          // Get Device ID from either ODC or ODP column based on template
          let device_id = ''
          if (type === 'ODC') {
             device_id = String(r['ODC'] || r['PERANGKAT PASIF'] || '')
          } else {
             device_id = String(r['ODP'] || r['PERANGKAT PASIF'] || '')
          }

          // if not from template, check standard 'device_id' or 'ID' column
          if (!device_id) device_id = String(r['device_id'] || r['ID'] || '')

          let siteStr = String(r['site'] || r['Site'] || 'Banyumas').toLowerCase()
          let siteVal = SITES.find(s => s.label.toLowerCase() === siteStr || s.value === siteStr)?.value || 'banyumas'

          let desa = String(r['Desa/Kelurahan'] || r['DESA/KELURAHAN'] || r['Desa'] || r['desa'] || '').toUpperCase()
          let kecamatan = String(r['Kecamatan'] || r['kecamatan'] || '').toUpperCase()
          let divisi = String(r['DEIVISI'] || r['DIVISI'] || '')
          let jenis_box = String(r['Jenis Box'] || r['JENIS BOX'] || r['Box'] || r['BOX'] || '')
          let kapasitas = String(r['Kapasitas'] || r['KAPASITAS'] || '')
          let jenis_kabel_power = String(r['Jenis Kabel Power'] || r['JENIS KABEL POWER'] || '')
          let core_power = String(r['Core Power'] || r['CORE POWER'] || '')
          let pon = String(r['PON'] || r['Pon'] || r['pon'] || '')
          let jarak_ke_olt = String(r['Jarak ke OLT/Server (m)'] || r['Jarak ke OLT'] || '')
          
          let provinsi = String(r['Provinsi'] || r['PROVINSI'] || '')
          let kabupaten = String(r['Kabupaten/Kota'] || r['Kabupaten'] || r['KABUPATEN'] || '')
          let jalan = String(r['Jalan/Gang/Dusun'] || r['Jalan'] || r['JALAN'] || '')
          let mapsUrlFallback = String(r['Maps URL'] || r['Maps'] || r['URL Google Maps'] || '')
          let keterangan = String(r['Keterangan'] || r['KETERANGAN'] || '')

          let linked_pole_id = null
          let linked_pole_label = null
          if (lat && lon && networkPoles.length > 0) {
            let nearestDist = Infinity
            let nearestPole = null
            for (const p of networkPoles) {
              if (!p.latitude || !p.longitude) continue
              const dist = getDistanceFromLatLonInm(Number(p.latitude), Number(p.longitude), lat, lon)
              if (dist < nearestDist) {
                nearestDist = dist
                nearestPole = p
              }
            }
            if (nearestPole && nearestDist <= 10) {
              linked_pole_id = nearestPole.id
              linked_pole_label = `${nearestPole.pole_id || nearestPole.id} (~${Math.round(nearestDist)}m)`
              lat = Number(nearestPole.latitude)
              lon = Number(nearestPole.longitude)
            }
          }

          const isValid = !!(desa && lat && lon)

          let proximityWarning = null
          if (isValid && lat && lon) {
            const veryCloseDb = devices.filter(d =>
              d.type === type &&
              getDistanceFromLatLonInm(Number(d.latitude), Number(d.longitude), lat, lon) < 1
            )
            const veryCloseExcel = mapped.filter(m =>
              m.type === type &&
              m.latitude && m.longitude &&
              getDistanceFromLatLonInm(m.latitude, m.longitude, lat, lon) < 1
            )
            const totalClose = veryCloseDb.length + veryCloseExcel.length
            if (totalClose > 0) proximityWarning = `Jarak < 1m dengan ${totalClose} ${type} lain (duplikat lokasi)`
          }

          mapped.push({
            _rowNo: i + 2,
            _valid: isValid,
            _selected: isValid && !proximityWarning,
            _proximityWarning: proximityWarning,
            site: siteVal,
            type,
            device_id,
            induk_odc,
            divisi,
            jenis_box,
            kapasitas,
            jenis_kabel_power,
            core_power,
            pon,
            jarak_ke_olt,
            provinsi,
            kabupaten,
            kecamatan,
            desa,
            jalan,
            maps_url: mapsUrlFallback,
            latitude: lat,
            longitude: lon,
            keterangan,
            pole_id: linked_pole_id,
            _poleLabel: linked_pole_label
          })
        }
        setImportRows(mapped)
        setIsImportModalOpen(true)
      } catch (err) {
        toast.error('Gagal membaca file Excel')
        console.error(err)
      }
      if (importRef.current) importRef.current.value = ''
    }
    reader.readAsArrayBuffer(file)
  }

  const handleSaveImport = async () => {
    const valid = importRows.filter(r => r._selected)
    if (valid.length === 0) return toast.error('Tidak ada baris yang dipilih untuk diimport!')
    
    setIsImportModalOpen(false)
    showProgress('Memulai Import', 'Memvalidasi data di server...', 5)
    
    try {
      showProgress('Memulai Import', 'Menghitung odpOdc existing dari database...', 8)
      let freshPoles = []
      let from = 0
      const step = 1000
      while (true) {
        const { data, error } = await supabase
          .from('network_odp_odc')
          .select('id, device_id, site, desa, type')
          .order('id', { ascending: true })
          .range(from, from + step - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        freshPoles = [...freshPoles, ...data]
        if (data.length < step) break
        from += step
      }

      showProgress('Menyiapkan ID', `Database punya ${freshPoles.length} odpOdc. Membuat device ID...`, 15)
      
      const payloadDevices = [...freshPoles]
      const payloads = valid.map(row => {
        const siteCode = SITE_CODE[row.site] || 'BMS'
        const desaSlug = row.desa.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').substring(0, 15)
        
        let deviceId = row.device_id
        if (!deviceId) {
           let parentOdcId = null
           if (row.type === 'ODP' && row.induk_odc) {
              const odcNoStr = String(row.induk_odc).padStart(3, '0')
              if (String(row.induk_odc).includes('/ODC/')) {
                 parentOdcId = row.induk_odc
              } else {
                 parentOdcId = idFormat.replace(/{SITE_CODE}/g, siteCode).replace(/{DESA}/g, desaSlug).replace(/{TYPE}/g, 'ODC').replace(/{NO}/g, odcNoStr)
              }
           }
           deviceId = generateDeviceId(row.site, row.desa, row.type, payloadDevices, idFormat, parentOdcId)
        }

        payloadDevices.push({
           site: row.site, desa: row.desa, type: row.type, device_id: deviceId
        })

        return {
          site: row.site, type: row.type, device_id: deviceId, parent_odc: row.induk_odc || null,
          provinsi: row.provinsi, kapasitas: row.kapasitas || null, divisi: row.divisi || null, 
          jenis_box: row.jenis_box || null, jenis_kabel_power: row.jenis_kabel_power || null, 
          core_power: row.core_power || null, pon: row.pon || null, jarak_ke_olt: row.jarak_ke_olt || null,
          pole_id: row.pole_id || null, kabupaten: row.kabupaten, kecamatan: row.kecamatan, 
          desa: row.desa, maps_url: row.maps_url, longitude: row.longitude, latitude: row.latitude, 
          keterangan: row.keterangan, created_by: profile.id, updated_by: profile.id,
        }
      })

      const chunkSize = 500
      let successCount = 0
      for (let i = 0; i < payloads.length; i += chunkSize) {
        const percent = 20 + ((i / payloads.length) * 80)
        showProgress('Menyimpan Data', `Mengirim baris ${i + 1} hingga ${Math.min(i + chunkSize, payloads.length)} ke server...`, percent)
        const chunk = payloads.slice(i, i + chunkSize)
        const { error } = await supabase.from('network_odp_odc').insert(chunk)
        if (error) throw error
        successCount += chunk.length
      }

      showProgress('Selesai', 'Penyimpanan berhasil!', 100)
      setTimeout(() => {
        hideProgress()
        toast.success(`${successCount} odpOdc berhasil diimport!`)
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
      const { error } = await supabase.from('app_settings').update({ device_id_format: formatForm }).neq('branch_name', 'xxxx')
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
      const sortedPoles = [...devices].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      
      const payloads = sortedPoles.map(p => {
        const key = `${p.site}_${(p.desa || '').toUpperCase().trim()}_${p.type}`
        counts[key] = (counts[key] || 0) + 1
        
        const siteCode = SITE_CODE[p.site] || 'BMS'
        const desaSlug = (p.desa || '').toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').substring(0, 15)
        const newPoleId = formatForm
          .replace(/{SITE_CODE}/g, siteCode)
          .replace(/{DESA}/g, desaSlug)
          .replace(/{TYPE}/g, p.type)
          .replace(/{NO}/g, String(counts[key]).padStart(3, '0'))
          
        return { id: p.id, device_id: newPoleId }
      })
      
      const toUpdate = payloads.filter(p => {
        const original = devices.find(op => op.id === p.id)
        return original && original.device_id !== p.device_id
      })

      if (toUpdate.length === 0) {
        hideProgress()
        return toast.success('Semua ID odpOdc sudah sesuai format baru!')
      }

      const chunkSize = 50
      let successCount = 0
      
      for (let i = 0; i < toUpdate.length; i += chunkSize) {
        const percent = 15 + ((i / toUpdate.length) * 85)
        showProgress('Update ID Massal', `Memperbarui ID ${i + 1}–${Math.min(i + chunkSize, toUpdate.length)} dari ${toUpdate.length}...`, percent)
        const chunk = toUpdate.slice(i, i + chunkSize)
        for (const c of chunk) {
          const { error } = await supabase.from('network_odp_odc').update({ device_id: c.device_id }).eq('id', c.id)
          if (error) throw error
        }
        successCount += chunk.length
      }

      showProgress('Selesai', 'Update massal berhasil!', 100)
      setTimeout(() => {
        hideProgress()
        toast.success(`${successCount} odpOdc berhasil diperbarui!`)
        fetchData()
      }, 500)

    } catch (e) {
      hideProgress()
      toast.error('Gagal update massal: ' + e.message)
    }
  }

  const deviceIdPreview = !editingId && form.desa ? generateDeviceId(form.site, form.desa, form.type, devices, idFormat, form.parent_odc) : null
  const dummyPreview = generateDeviceId('banyumas', 'Tanjung', 'ODP', [], formatForm)

  return (
    <div className="page-container">
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 700 }}>
            <img src="/icon_odp.png" alt="odpOdc" style={{ width: '24px', height: '24px', objectFit: 'contain' }} /> Data ODP & ODC
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Jaringan Fiber — Pencatatan & Manajemen ODP/ODC</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['admin', 'superadmin'].includes(role) && (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => { setEditingId(null); setForm({...EMPTY_FORM}); setIsModalOpen(true); setProximityWarning(null) }} title="Tambah Data ODP/ODC Baru">
                <Plus size={14} /> Tambah
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setIsFormatModalOpen(true)} title="Pengaturan Format ID ODP/ODC">
                <SettingsIcon size={14} /> Format ID
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleSyncPoles} disabled={syncingPoles} title="Sinkronisasikan ulang ODP/ODC tanpa tiang dengan tiang terdekat">
                <RefreshCw size={14} className={syncingPoles ? 'spin' : ''} /> Sinkron Tiang
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
          <button className="btn btn-secondary btn-sm" onClick={openKmzModal} disabled={kmzLoading} title="Export ke KMZ (Google Earth)" style={{ color: 'var(--accent)', borderColor: 'rgba(var(--accent-rgb, 59,130,246),0.4)' }}>
            <Map size={14} /> {kmzLoading ? 'Memproses...' : 'KMZ'}
          </button>
        </div>
      </div>

      {/* ── SUMMARY CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Total ODP/ODC', value: devices.filter(p => !p.status || p.status === 'active').length, color: 'var(--accent)' },
          { label: 'Total ODP', value: devices.filter(p => p.type === 'ODP' && (!p.status || p.status === 'active')).length, color: 'var(--success)' },
          { label: 'Total ODC', value: devices.filter(p => p.type === 'ODC' && (!p.status || p.status === 'active')).length, color: '#6366f1' },
          { label: 'Kecamatan', value: kecamatanList.length, color: 'var(--purple)' },
          { label: 'Ada Koordinat', value: devices.filter(p => p.latitude && p.longitude && (!p.status || p.status === 'active')).length, color: '#22d3ee' },
          { label: 'Dicabut', value: devices.filter(p => p.status === 'dismantled').length, color: 'var(--danger)', clickable: true },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: '12px 14px', borderTop: `3px solid ${card.color}`, cursor: card.clickable ? 'pointer' : undefined }}
            onClick={card.clickable ? () => setFilterStatus(s => s === 'dismantled' ? 'active' : 'dismantled') : undefined}>
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
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', padding: '3px', border: '1px solid var(--border)' }}>
            {[{ v: 'active', label: 'Aktif' }, { v: 'dismantled', label: 'Dicabut' }, { v: 'all', label: 'Semua' }].map(opt => (
              <button key={opt.v} onClick={() => { setFilterStatus(opt.v); setPage(1) }}
                style={{ padding: '4px 12px', fontSize: '12px', fontWeight: 600, borderRadius: 'calc(var(--radius-md) - 2px)', border: 'none', cursor: 'pointer', transition: '0.15s',
                  background: filterStatus === opt.v ? (opt.v === 'dismantled' ? 'var(--danger)' : 'var(--accent)') : 'transparent',
                  color: filterStatus === opt.v ? '#fff' : 'var(--text-secondary)' }}>{opt.label}</button>
            ))}
          </div>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '110px', width: 'auto' }} value={filterSite} onChange={e => { setFilterSite(e.target.value); setPage(1) }}><option value="">Semua Site</option>{SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '140px', width: 'auto' }} value={filterKecamatan} onChange={e => { setFilterKecamatan(e.target.value); setFilterDesa(''); setPage(1) }}><option value="">Semua Kecamatan</option>{kecamatanList.map(k => <option key={k} value={k}>{k}</option>)}</select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '140px', width: 'auto' }} value={filterDesa} onChange={e => { setFilterDesa(e.target.value); setPage(1) }}><option value="">Semua Desa</option>{desaList.map(d => <option key={d} value={d}>{d}</option>)}</select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '100px', width: 'auto' }} value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }}><option value="">Semua Jenis</option>{DEVICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
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
                  <Trash2 size={14} /> Hapus SEMUA Data ODP & ODC
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
                <th style={{ cursor: 'pointer', minWidth: '200px' }} onClick={() => handleSort('device_id')}><div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>ID ODP/ODC <SortIcon col="device_id" /></div></th>
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
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}><Antenna size={28} style={{ opacity: 0.25, marginBottom: '8px', display: 'block', margin: '0 auto 8px' }} />Belum ada data odpOdc</td></tr>
              ) : paginated.map((device, idx) => {
                const isDismantled = device.status === 'dismantled'
                return (
                <tr key={device.id} style={{ background: isDismantled ? 'rgba(239,68,68,0.06)' : selectedIds.has(device.id) ? 'rgba(239,68,68,0.06)' : undefined, opacity: isDismantled ? 0.85 : 1 }}>
                  {role === 'superadmin' && (
                    <td style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSelect(device.id)}>
                      {selectedIds.has(device.id)
                        ? <CheckSquare size={14} style={{ color: 'var(--danger)' }} />
                        : <Square size={14} style={{ opacity: 0.3 }} />}
                    </td>
                  )}
                  <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '11px' }}>{(page - 1) * perPage + idx + 1}</td>
                  <td><span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '20px', background: 'var(--bg-primary)', border: '1px solid var(--border)', fontWeight: 600 }}>{SITES.find(s => s.value === device.site)?.label || device.site}</span></td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: isDismantled ? 'var(--danger)' : 'var(--accent)', fontWeight: 600, textDecoration: isDismantled ? 'line-through' : 'none' }}>{device.device_id || '-'}</span>
                    {device.parent_odc && <div style={{ fontSize: '10px', color: '#6366f1', marginTop: '1px' }}>Induk: {device.parent_odc}</div>}
                    {isDismantled && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 6px', borderRadius: '20px', background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', fontWeight: 700, border: '1px solid rgba(239,68,68,0.3)' }}>DICABUT</span>}
                    {isDismantled && device.dismantled_at && <div style={{ fontSize: '10px', color: 'var(--danger)', opacity: 0.7, marginTop: '1px' }}>{format(new Date(device.dismantled_at), 'dd MMM yyyy', { locale: localeId })}</div>}
                  </td>
                  <td><span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '20px', fontWeight: 600, background: device.type === 'ODC' ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.12)', color: device.type === 'ODC' ? '#6366f1' : 'var(--success)' }}>{device.type || '-'}{device.kapasitas ? ` · ${device.kapasitas}` : ''}</span></td>
                  <td style={{ fontSize: '12px' }}>{device.kecamatan || '-'}</td>
                  <td style={{ fontSize: '12px' }}>{device.desa || '-'}</td>
                  <td>{device.latitude && device.longitude ? <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'monospace', lineHeight: '1.4' }}><div>Lat: {Number(device.latitude).toFixed(5)}</div><div>Lon: {Number(device.longitude).toFixed(5)}</div></div> : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>}</td>
                  <td>{device.maps_url ? <a href={device.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px' }}><MapPin size={12} /><ExternalLink size={11} /></a> : '-'}</td>
                  <td style={{ fontSize: '11px', color: 'var(--text-secondary)', maxWidth: '150px' }}>
                    {device.pole_id && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '20px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          📡 {networkPoles.find(p => p.id === device.pole_id)?.pole_id || device.pole_id}
                        </span>
                      </div>
                    )}
                    {device.pon && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '20px', background: 'rgba(168,85,247,0.12)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          🔌 {device.pon}
                        </span>
                      </div>
                    )}
                    <span title={device.keterangan} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.keterangan || (!device.pole_id && !device.pon ? '-' : '')}</span>
                    {isDismantled && device.dismantled_notes && <span title={device.dismantled_notes} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--danger)', fontStyle: 'italic', fontSize: '10px' }}>Cabut: {device.dismantled_notes}</span>}
                  </td>
                  <td style={{ fontSize: '11px' }}><div style={{ fontWeight: 500 }}>{getUserName(device.created_by)}</div>{device.updated_by && device.updated_by !== device.created_by && <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Edit: {getUserName(device.updated_by)}</div>}</td>
                  <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{device.created_at ? format(new Date(device.created_at), 'dd MMM yy', { locale: localeId }) : '-'}</td>
                  {['admin', 'superadmin'].includes(role) && (
                    <td><div style={{ display: 'flex', gap: '4px' }}>
                      {!isDismantled && <button className="btn btn-secondary btn-sm" style={{ padding: '4px 7px' }} onClick={() => openEdit(device)}><Edit2 size={12} /></button>}
                      {!isDismantled && <button className="btn btn-sm" title="Cabut ODP/ODC" style={{ padding: '4px 7px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)' }} onClick={() => { setCabutModal(device); setCabutNotes(''); setCabutDate(format(new Date(), 'yyyy-MM-dd')) }}><Scissors size={12} /></button>}
                      {isDismantled && <button className="btn btn-sm" title="Pulihkan ODP/ODC" style={{ padding: '4px 7px', background: 'rgba(16,185,129,0.1)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)' }} onClick={() => handlePulihkan(device)}><RotateCcw size={12} /></button>}
                      {role === 'superadmin' && <button className="btn btn-sm" style={{ padding: '4px 7px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)' }} onClick={() => setConfirmDelete(device)}><Trash2 size={12} /></button>}
                    </div></td>
                  )}
                </tr>
              )})}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="mobile-cards" style={{ display: 'none' }}>
          {loading ? <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat data...</div> : paginated.map((device, idx) => (
            <div key={device.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--accent)', fontWeight: 700 }}>{device.device_id || '-'}</div>
                  {device.parent_odc && <div style={{ fontSize: '10px', color: '#6366f1', marginTop: '1px' }}>Induk: {device.parent_odc}</div>}
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{SITES.find(s => s.value === device.site)?.label} · <span style={{ color: device.type === 'ODC' ? '#6366f1' : 'var(--success)', fontWeight: 600 }}>{device.type}{device.kapasitas ? ` · ${device.kapasitas}` : ''}</span></div>
                </div>
                {['admin', 'superadmin'].includes(role) && (
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}><button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => openEdit(device)}><Edit2 size={12} /></button><button className="btn btn-sm" style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)' }} onClick={() => setConfirmDelete(device)}><Trash2 size={12} /></button></div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '12px' }}>
                <div><span style={{ color: 'var(--text-secondary)' }}>Kecamatan: </span>{device.kecamatan || '-'}</div><div><span style={{ color: 'var(--text-secondary)' }}>Desa: </span>{device.desa || '-'}</div>
                {device.latitude && <div><span style={{ color: 'var(--text-secondary)' }}>Lat: </span>{Number(device.latitude).toFixed(5)}</div>}
                {device.longitude && <div><span style={{ color: 'var(--text-secondary)' }}>Lon: </span>{Number(device.longitude).toFixed(5)}</div>}
                {device.maps_url && <div style={{ gridColumn: '1/-1' }}><a href={device.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> Lihat Maps <ExternalLink size={11} /></a></div>}
                {device.pon && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text-secondary)' }}>PON: </span><span style={{ color: '#c084fc', fontWeight: 600 }}>{device.pon}</span></div>}
                {device.keterangan && <div style={{ gridColumn: '1/-1', color: 'var(--text-secondary)' }}>{device.keterangan}</div>}
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
                <h3 style={{ margin: 0 }}>{editingId ? 'Edit Data ODP & ODC' : 'Tambah ODP/ODC Baru'}</h3>
                {!editingId && deviceIdPreview && <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--accent)', fontFamily: 'monospace' }}>ID: {deviceIdPreview}</p>}
              </div>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                  <div><label className="form-label">Site <span style={{ color: 'var(--danger)' }}>*</span></label><select className="form-input" value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))}>{SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                  <div>
                    <label className="form-label">Jenis Perangkat <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <select className="form-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, jenis_box: '', kapasitas: '', parent_odc: '' }))}>
                      {DEVICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  {form.type === 'ODP' && (
                    <div>
                      <label className="form-label">Induk ODC (Opsional)</label>
                      <select className="form-input" value={form.parent_odc} onChange={e => setForm(f => ({ ...f, parent_odc: e.target.value }))}>
                        <option value="">Tidak ada induk / Standar</option>
                        {devices.filter(d => d.type === 'ODC' && d.desa?.toUpperCase() === form.desa?.toUpperCase() && d.site === form.site).map(odc => (
                          <option key={odc.id} value={odc.device_id}>{odc.device_id}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="form-label">Jenis Box</label>
                    <select className="form-input" value={form.jenis_box} onChange={e => setForm(f => ({ ...f, jenis_box: e.target.value }))}>
                      <option value="">-- Pilih Jenis Box --</option>
                      {(form.type === 'ODC'
                        ? ['Box 16', 'Box 24', 'Box 48', 'Box 96', 'Box 144', 'Box 288']
                        : ['Box 8', 'Box 16', 'Box 24']
                      ).map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Kapasitas</label>
                    <select className="form-input" value={form.kapasitas} onChange={e => setForm(f => ({ ...f, kapasitas: e.target.value }))}>
                      <option value="">-- Pilih Kapasitas --</option>
                      {(form.type === 'ODC' ? ODC_CAPACITIES : ODP_CAPACITIES).map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2px' }}><span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>📍 Lokasi Administratif</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <SearchableSelect
                    label="Provinsi"
                    value={form.provinsi}
                    onChange={v => setForm(f => ({ ...f, provinsi: v, kabupaten: '', kecamatan: '', desa: '' }))}
                    options={provinsiOpts}
                    placeholder="Cari/ketik provinsi..."
                  />
                  <SearchableSelect
                    label="Kabupaten/Kota"
                    value={form.kabupaten}
                    onChange={v => setForm(f => ({ ...f, kabupaten: v, kecamatan: '', desa: '' }))}
                    options={kabupatenOpts}
                    placeholder="Cari/ketik kabupaten..."
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <SearchableSelect
                    label="Kecamatan"
                    required
                    value={form.kecamatan}
                    onChange={v => setForm(f => ({ ...f, kecamatan: v, desa: '' }))}
                    options={kecamatanOpts}
                    placeholder="Cari/ketik kecamatan..."
                  />
                  <SearchableSelect
                    label="Desa/Kelurahan"
                    required
                    value={form.desa}
                    onChange={v => setForm(f => ({ ...f, desa: v }))}
                    options={desaOpts}
                    placeholder="Cari/ketik desa..."
                  />
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2px' }}><span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>🔌 Detail Jaringan Kabel</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '14px' }}>
                  <div>
                    <label className="form-label">Jenis Kabel Power</label>
                    <select className="form-input" value={form.jenis_kabel_power} onChange={e => setForm(f => ({ ...f, jenis_kabel_power: e.target.value }))}>
                      <option value="">-- Pilih --</option>
                      <option value="1C">1C</option>
                      <option value="4C">4C</option>
                      <option value="PE 12C">PE 12C</option>
                      <option value="PE 24C">PE 24C</option>
                      <option value="ADSS 24C">ADSS 24C</option>
                      <option value="ADSS 48C">ADSS 48C</option>
                    </select>
                  </div>
                  <div><label className="form-label">Core Power</label><input className="form-input" value={form.core_power} onChange={e => setForm(f => ({ ...f, core_power: e.target.value }))} placeholder="Contoh: Core 1-8" /></div>
                  <div>
                    <label className="form-label">PON (Port OLT)</label>
                    <input className="form-input" value={form.pon} onChange={e => setForm(f => ({ ...f, pon: e.target.value }))} placeholder="Contoh: PON 1/3/5" />
                  </div>
                  <div>
                    <label className="form-label">Jarak ke OLT/Server (meter)</label>
                    <input className="form-input" type="text" value={form.jarak_ke_olt} onChange={e => {
                      const num = e.target.value.replace(/\D/g, '');
                      setForm(f => ({ ...f, jarak_ke_olt: num ? Number(num).toLocaleString('id-ID') : '' }))
                    }} placeholder="Contoh: 1.500" />
                  </div>
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
            
            {proximityWarning && (
              <div style={{ padding: '0 24px' }}>
                <div className="alert alert-warning" style={{ margin: 0, padding: '16px', background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', gap: '12px' }}>
                  <AlertTriangle size={24} style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                    <strong style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Peringatan Jarak Berdekatan!</strong>
                    Ditemukan <strong>{proximityWarning.count} odpOdc</strong> dalam radius 10 meter.<br/>
                    ODP/ODC terdekat berjarak <strong>{proximityWarning.dist} meter</strong> (ID: <span style={{ fontFamily: 'monospace' }}>{proximityWarning.deviceId}</span>).<br/>
                    <span style={{ color: 'var(--text-secondary)' }}>Apakah Anda yakin ingin tetap menyimpan odpOdc ini?</span>
                  </div>
                </div>
              </div>
            )}

            <div className="modal-footer" style={{ flexShrink: 0, marginTop: proximityWarning ? '16px' : '0' }}>
              <button className="btn btn-secondary" onClick={() => { setIsModalOpen(false); setProximityWarning(null); }}>Batal</button>
              {proximityWarning ? (
                <button className="btn btn-primary" disabled={saving} onClick={() => handleSave(true)} style={{ background: 'var(--warning)', borderColor: 'var(--warning)' }}>
                  {saving ? '...' : '⚠️ Ya, Lanjut Simpan'}
                </button>
              ) : (
                <button className="btn btn-primary" disabled={saving} onClick={() => handleSave(false)}>
                  {saving ? '...' : editingId ? '✓ Simpan Perubahan' : '✓ Tambah ODP/ODC'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL IMPORT ══════ */}
      {isImportModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '1200px', maxWidth: '98vw', maxHeight: '93vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Preview Import Data ODP & ODC</h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  <span>✅ {importRows.filter(r => r._valid).length} valid</span>
                  <span>·</span>
                  <span>❌ {importRows.filter(r => !r._valid).length} tidak valid</span>
                  {importRows.filter(r => r._proximityWarning && !r._selected).length > 0 && (
                    <span style={{ color: 'var(--warning)', fontWeight: 600, background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.3)' }}>
                      ⚠️ {importRows.filter(r => r._proximityWarning && !r._selected).length} berdekatan
                    </span>
                  )}
                  {importRows.filter(r => r._valid && !r._poleLabel).length > 0 && (
                    <span style={{ color: '#f97316', fontWeight: 600, background: 'rgba(249,115,22,0.12)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(249,115,22,0.3)' }}>
                      📍 {importRows.filter(r => r._valid && !r._poleLabel).length} tanpa tiang
                    </span>
                  )}
                  {importRows.filter(r => r._valid && r._poleLabel).length > 0 && (
                    <span style={{ color: 'var(--success)', fontWeight: 600, background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.25)' }}>
                      🗼 {importRows.filter(r => r._valid && r._poleLabel).length} ada tiang
                    </span>
                  )}
                </p>
              </div>
              <button className="btn-close" onClick={() => setIsImportModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ fontSize: '12px', minWidth: '1000px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>
                        <input type="checkbox" 
                          checked={importRows.length > 0 && importRows.filter(r => r._valid).every(r => r._selected)}
                          onChange={(e) => {
                            const val = e.target.checked
                            setImportRows(rows => rows.map(r => r._valid ? { ...r, _selected: val } : r))
                          }}
                        />
                      </th>
                      <th>Baris</th><th>Site</th><th>Jenis</th><th>Kecamatan</th><th>Desa</th><th>Tiang Terdekat</th><th>Lat</th><th>Lon</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map(row => (
                      <Fragment key={row._rowNo}>
                        <tr style={{
                          opacity: row._valid ? 1 : 0.45,
                          background: row._proximityWarning && !row._selected
                            ? 'rgba(239, 68, 68, 0.1)'
                            : (row._valid && !row._poleLabel ? 'rgba(249, 115, 22, 0.05)' : 'transparent'),
                          borderLeft: row._proximityWarning && !row._selected
                            ? '4px solid var(--danger)'
                            : (row._valid && !row._poleLabel ? '4px solid #f97316' : '4px solid transparent')
                        }}>
                          <td style={{ textAlign: 'center' }}>
                            <input type="checkbox" disabled={!row._valid} checked={row._selected || false}
                              onChange={(e) => {
                                const val = e.target.checked
                                setImportRows(rows => rows.map(r => r._rowNo === row._rowNo ? { ...r, _selected: val } : r))
                              }}
                            />
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontWeight: row._proximityWarning && !row._selected ? 'bold' : 'normal' }}>{row._rowNo}</td><td>{SITES.find(s => s.value === row.site)?.label || row.site}</td><td>{DEVICE_TYPES.find(t => t.value === row.type)?.label || row.type}</td>
                          <td>{row.kecamatan || <span style={{ color: 'var(--danger)' }}>Kosong!</span>}</td><td>{row.desa || <span style={{ color: 'var(--danger)' }}>Kosong!</span>}</td>
                          <td style={{ fontSize: '11px', fontWeight: 600, color: row._poleLabel ? 'var(--success)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{row._poleLabel || <span style={{ color: 'var(--text-secondary)' }}>Tidak ditemukan</span>}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{row.latitude || '-'}</td><td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{row.longitude || '-'}</td>
                          <td>
                            {row._valid ? (
                              row._proximityWarning ? (
                                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>⚠️ Cek Jarak!</span>
                              ) : (
                                <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Valid</span>
                              )
                            ) : <span style={{ color: 'var(--danger)', fontWeight: 600 }}>✗ Dilewati</span>}
                          </td>
                        </tr>
                        {row._proximityWarning && !row._selected && (
                          <tr style={{ background: 'rgba(245, 158, 11, 0.15)' }}>
                            <td style={{ borderLeft: '4px solid var(--warning)' }}></td>
                            <td colSpan="8" style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--warning)', borderBottom: '1px solid rgba(245, 158, 11, 0.2)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                                <div>
                                  <strong style={{ fontSize: '13px' }}>DUPLIKAT / BERDEKATAN:</strong> {row._proximityWarning}.<br/>
                                  <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Jika ini memang 2 odpOdc fisik yang berbeda tapi berdekatan posisinya, silakan <strong>Centang</strong> kotak di sebelah kiri untuk tetap mengimportnya.</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer" style={{ flexShrink: 0, padding: '16px 24px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}><button className="btn btn-secondary" onClick={() => { setIsImportModalOpen(false); setImportRows([]) }}>Batal</button><button className="btn btn-primary" disabled={importRows.filter(r => r._selected).length === 0} onClick={handleSaveImport}>✓ Import {importRows.filter(r => r._selected).length} Baris</button></div>
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
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Ubah cara sistem menamai odpOdc baru secara otomatis</p>
              </div>
              <button className="btn-close" onClick={() => setIsFormatModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                <div className="alert alert-warning" style={{ margin: 0, padding: '12px', background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '10px' }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                    <strong>Perhatian:</strong> Mengubah format ID bisa ditujukan untuk <strong>odpOdc baru saja</strong> (Simpan Format Saja), atau Anda bisa memperbarui <strong>seluruh data odpOdc lama secara serentak</strong> (Update Retroaktif).
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
              <button className="btn" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '12px' }} onClick={handleRetroactiveUpdate} title="Ubah juga semua odpOdc yang sudah ada sebelumnya mengikuti format baru ini">
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
              <h3 style={{ margin: 0, color: 'var(--danger)' }}>⚠ Hapus ODP/ODC</h3>
              <button className="btn-close" onClick={() => setConfirmDelete(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px 24px' }}>
              <p style={{ margin: 0 }}>Hapus odpOdc <strong style={{ color: 'var(--accent)' }}>{confirmDelete.device_id}</strong>?</p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>Tindakan ini tidak bisa dibatalkan.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Batal</button>
              <button style={{ background: 'var(--danger)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleDelete(confirmDelete)}>Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL CABUT ODP/ODC ══════ */}
      {cabutModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '460px', maxWidth: '96vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}><Scissors size={18} /> Catat Pencabutan ODP/ODC</h3>
              <button className="btn-close" onClick={() => setCabutModal(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px 24px' }}>
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: '16px' }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '14px', color: 'var(--danger)' }}>{cabutModal.device_id}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {cabutModal.kecamatan} · {cabutModal.desa} {cabutModal.jalan ? `· ${cabutModal.jalan}` : ''}
                </div>
              </div>
              <p style={{ margin: '0 0 6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                ODP/ODC ini akan dicatat sebagai <strong style={{ color: 'var(--danger)' }}>Dicabut</strong>.
                ID odpOdc tetap tersimpan dan bisa dilihat di filter <em>Dicabut</em>.
              </p>
              <div style={{ marginTop: '14px' }}>
                <div style={{ marginBottom: '10px' }}>
                  <label className="form-label">Tanggal Pencabutan</label>
                  <input
                    type="date"
                    className="form-input"
                    value={cabutDate}
                    onChange={e => setCabutDate(e.target.value)}
                  />
                </div>
                <label className="form-label">Alasan / Catatan Pencabutan <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(opsional)</span></label>
                <textarea
                  className="form-input" rows={3}
                  style={{ resize: 'vertical' }}
                  placeholder="Contoh: ODP/ODC rusak/patah, dipindahkan ke lokasi lain, proyek jalan, dll."
                  value={cabutNotes}
                  onChange={e => setCabutNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setCabutModal(null)}>Batal</button>
              <button
                disabled={cabutSaving}
                style={{ background: 'var(--danger)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={handleCabut}
              >
                <Scissors size={14} /> {cabutSaving ? 'Menyimpan...' : 'Ya, Catat Sebagai Dicabut'}
              </button>
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
                <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.5' }}>Ini akan mengubah <strong>SEMUA ID odpOdc yang sudah ada</strong> mengikuti format baru, dihitung ulang berurutan dari 001 per desa berdasarkan tanggal input terlama.</p>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>Contoh: odpOdc desa Bangsa akan menjadi BANGSA/001, BANGSA/002, BANGSA/003, dst.</p>
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
      {/* KMZ EXPORT MODAL */}
      {isKmzModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>Export KMZ</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>
              Pilih cakupan data yang ingin diexport ke file Google Earth (KMZ).
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Kecamatan (Opsional)</label>
                <select className="input" value={kmzFilterKecamatan} onChange={e => { setKmzFilterKecamatan(e.target.value); setKmzFilterDesa('') }}>
                  <option value="">Semua Kecamatan</option>
                  {kecamatanList.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Desa/Kelurahan (Opsional)</label>
                <select className="input" value={kmzFilterDesa} onChange={e => setKmzFilterDesa(e.target.value)} disabled={!kmzFilterKecamatan}>
                  <option value="">Semua Desa</option>
                  {kmzDesaList.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={() => setIsKmzModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleExportKMZ} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Map size={16} /> Export Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  Plus, X, Edit2, Trash2, MapPin, Search, Download,
  ChevronDown, ChevronUp, ExternalLink, Antenna, Upload,
  FileSpreadsheet, Map
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

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function generatePoleId(site, desa, existingPoles) {
  if (!desa) return ''
  const siteCode = SITE_CODE[site] || 'BMS'
  const desaSlug = desa.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').substring(0, 15)
  const count = existingPoles.filter(
    p => p.site === site && p.desa?.toUpperCase().trim() === desa.toUpperCase().trim()
  ).length
  return `NAT/${siteCode}/POLE/${desaSlug}/${String(count + 1).padStart(3, '0')}`
}

function extractCoordsFromUrl(url) {
  if (!url) return null
  const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { latitude: m[1], longitude: m[2] }
  // Also try ?q= format
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
      <Point>
        <coordinates>${p.longitude},${p.latitude},0</coordinates>
      </Point>
    </Placemark>`).join('\n')

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Data Tiang Maintory - ${format(new Date(), 'dd MMM yyyy')}</name>
    <description>Export Data Tiang Jaringan Fiber</description>
    <Style id="tiang_icon">
      <IconStyle>
        <scale>1.2</scale>
        <Icon>
          <href>files/icon_tiang.png</href>
        </Icon>
        <hotSpot x="0.5" y="0" xunits="fraction" yunits="fraction"/>
      </IconStyle>
      <LabelStyle>
        <color>ffffffff</color>
        <scale>0.8</scale>
      </LabelStyle>
    </Style>
    ${placemarks}
  </Document>
</kml>`

  // Fetch icon and embed in KMZ
  const zip = new JSZip()
  zip.file('doc.kml', kml)

  try {
    const iconResp = await fetch('/icon_tiang.png')
    const iconBlob = await iconResp.blob()
    zip.folder('files').file('icon_tiang.png', iconBlob)
  } catch {
    // Skip icon if fetch fails
  }

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
  const importRef = useRef(null)

  const [poles, setPoles] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [kmzLoading, setKmzLoading] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSite, setFilterSite] = useState('')
  const [filterKecamatan, setFilterKecamatan] = useState('')
  const [filterType, setFilterType] = useState('')

  // Sorting
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importRows, setImportRows] = useState([])
  const [importSaving, setImportSaving] = useState(false)

  // Pagination
  const [page, setPage] = useState(1)
  const perPage = 15

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [polesRes, usersRes] = await Promise.all([
        supabase.from('network_poles').select('*').order('created_at', { ascending: false }),
        supabase.from('users').select('id, full_name'),
      ])
      if (polesRes.data) setPoles(polesRes.data)
      if (usersRes.data) setUsers(usersRes.data)
    } catch { toast.error('Gagal memuat data') }
    finally { setLoading(false) }
  }

  const getUserName = (uid) => users.find(u => u.id === uid)?.full_name || '-'

  const kecamatanList = useMemo(() => {
    const set = new Set(poles.map(p => p.kecamatan).filter(Boolean))
    return [...set].sort()
  }, [poles])

  const filtered = useMemo(() => {
    let data = [...poles]
    if (filterSite) data = data.filter(p => p.site === filterSite)
    if (filterKecamatan) data = data.filter(p => p.kecamatan === filterKecamatan)
    if (filterType) data = data.filter(p => p.pole_type === filterType)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      data = data.filter(p =>
        p.pole_id?.toLowerCase().includes(q) ||
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
  }, [poles, filterSite, filterKecamatan, filterType, searchQuery, sortKey, sortDir])

  const paginated = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page])
  const totalPages = Math.ceil(filtered.length / perPage)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const SortIcon = ({ col }) =>
    sortKey !== col
      ? <ChevronDown size={11} style={{ opacity: 0.3 }} />
      : sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />

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
        const poleId = generatePoleId(form.site, form.desa, poles)
        const { error } = await supabase.from('network_poles').insert({ ...payload, pole_id: poleId, created_by: profile.id })
        if (error) throw error
        toast.success(`Tiang ${poleId} ditambahkan!`)
      }
      setIsModalOpen(false)
      fetchData()
    } catch (e) { toast.error(e.message || 'Terjadi kesalahan') }
    finally { setSaving(false) }
  }

  const handleDelete = async (pole) => {
    try {
      const { error } = await supabase.from('network_poles').delete().eq('id', pole.id)
      if (error) throw error
      toast.success('Data tiang dihapus')
      setConfirmDelete(null)
      fetchData()
    } catch { toast.error('Gagal menghapus data') }
  }

  const handleExtractCoords = () => {
    const coords = extractCoordsFromUrl(form.maps_url)
    if (coords) {
      setForm(f => ({ ...f, latitude: coords.latitude, longitude: coords.longitude }))
      toast.success('Koordinat berhasil diekstrak!')
    } else {
      toast.error('Koordinat tidak ditemukan. Masukkan manual.')
    }
  }

  // ── EXPORT EXCEL ──
  const handleExportExcel = () => {
    if (filtered.length === 0) return toast.error('Tidak ada data')
    const rows = filtered.map((p, i) => ({
      'No': i + 1,
      'Site': SITES.find(s => s.value === p.site)?.label || p.site,
      'ID Tiang': p.pole_id || '',
      'Jenis Tiang': POLE_TYPES.find(t => t.value === p.pole_type)?.label || p.pole_type,
      'Provinsi': p.provinsi || '',
      'Kabupaten/Kota': p.kabupaten || '',
      'Kecamatan': p.kecamatan || '',
      'Desa/Kelurahan': p.desa || '',
      'Maps URL': p.maps_url || '',
      'Longitude': p.longitude || '',
      'Latitude': p.latitude || '',
      'Keterangan': p.keterangan || '',
      'Diinput Oleh': getUserName(p.created_by),
      'Edit Oleh': getUserName(p.updated_by),
      'Tanggal Input': p.created_at ? format(new Date(p.created_at), 'dd/MM/yyyy HH:mm') : '',
      'Tanggal Update': p.updated_at ? format(new Date(p.updated_at), 'dd/MM/yyyy HH:mm') : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data Tiang')
    XLSX.writeFile(wb, `Data_Tiang_${format(new Date(), 'yyyyMMdd')}.xlsx`)
    toast.success('Export Excel berhasil!')
  }

  // ── EXPORT KMZ ──
  const handleExportKMZ = async () => {
    const withCoords = filtered.filter(p => p.latitude && p.longitude)
    if (withCoords.length === 0) return toast.error('Tidak ada data dengan koordinat GPS')
    setKmzLoading(true)
    try {
      await generateKMZ(withCoords, users)
      toast.success(`KMZ berhasil dibuat! (${withCoords.length} titik)`)
    } catch (e) {
      toast.error('Gagal membuat KMZ: ' + e.message)
    } finally { setKmzLoading(false) }
  }

  // ── DOWNLOAD TEMPLATE ──
  const handleDownloadTemplate = () => {
    const template = [{
      'Site': 'banyumas', 'Jenis Tiang': 'tiang_7m',
      'Provinsi': 'Jawa Tengah', 'Kabupaten/Kota': 'Banyumas',
      'Kecamatan': 'Purwokerto Selatan', 'Desa/Kelurahan': 'Tanjung',
      'Maps URL': 'https://maps.app.goo.gl/contoh',
      'Longitude': '109.2345678', 'Latitude': '-7.4321234',
      'Keterangan': 'Contoh keterangan',
    }]
    const ws = XLSX.utils.json_to_sheet(template)
    // Style header
    ws['!cols'] = [
      { wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 18 },
      { wch: 22 }, { wch: 20 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 30 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    // Tambah sheet info
    const info = [
      { 'Kolom': 'Site', 'Nilai Valid': 'banyumas / cilacap / cilacap_herman' },
      { 'Kolom': 'Jenis Tiang', 'Nilai Valid': 'tiang_7m / tiang_9m' },
      { 'Kolom': 'Provinsi', 'Nilai Valid': 'Nama provinsi (bebas teks)' },
      { 'Kolom': 'Kabupaten/Kota', 'Nilai Valid': 'Nama kabupaten (bebas teks)' },
      { 'Kolom': 'Kecamatan', 'Nilai Valid': 'WAJIB DIISI' },
      { 'Kolom': 'Desa/Kelurahan', 'Nilai Valid': 'WAJIB DIISI' },
      { 'Kolom': 'Maps URL', 'Nilai Valid': 'Link Google Maps (opsional)' },
      { 'Kolom': 'Longitude', 'Nilai Valid': 'Angka desimal, cth: 109.2345' },
      { 'Kolom': 'Latitude', 'Nilai Valid': 'Angka desimal, cth: -7.4321' },
      { 'Kolom': 'Keterangan', 'Nilai Valid': 'Catatan (opsional)' },
    ]
    const ws2 = XLSX.utils.json_to_sheet(info)
    XLSX.utils.book_append_sheet(wb, ws2, 'Panduan')
    XLSX.writeFile(wb, 'Template_Import_Tiang.xlsx')
    toast.success('Template berhasil diunduh!')
  }

  // ── PARSE IMPORT FILE ──
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
          _rowNo: i + 2,
          site: r['Site']?.toLowerCase() || 'banyumas',
          pole_type: r['Jenis Tiang']?.toLowerCase() || 'tiang_7m',
          provinsi: r['Provinsi'] || '',
          kabupaten: r['Kabupaten/Kota'] || '',
          kecamatan: r['Kecamatan'] || '',
          desa: r['Desa/Kelurahan'] || '',
          maps_url: r['Maps URL'] || '',
          longitude: r['Longitude'] ? Number(r['Longitude']) : null,
          latitude: r['Latitude'] ? Number(r['Latitude']) : null,
          keterangan: r['Keterangan'] || '',
          _valid: !!r['Kecamatan'] && !!r['Desa/Kelurahan'],
        }))
        setImportRows(mapped)
        setIsImportModalOpen(true)
      } catch {
        toast.error('File tidak valid. Gunakan template yang disediakan.')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleSaveImport = async () => {
    const valid = importRows.filter(r => r._valid)
    if (valid.length === 0) return toast.error('Tidak ada baris yang valid!')
    setImportSaving(true)
    try {
      let successCount = 0
      for (const row of valid) {
        const poleId = generatePoleId(row.site, row.desa, [...poles])
        const { error } = await supabase.from('network_poles').insert({
          site: row.site, pole_type: row.pole_type,
          pole_id: poleId, provinsi: row.provinsi,
          kabupaten: row.kabupaten, kecamatan: row.kecamatan,
          desa: row.desa, maps_url: row.maps_url,
          longitude: row.longitude, latitude: row.latitude,
          keterangan: row.keterangan,
          created_by: profile.id, updated_by: profile.id,
        })
        if (!error) successCount++
      }
      toast.success(`${successCount} tiang berhasil diimport!`)
      setIsImportModalOpen(false)
      setImportRows([])
      fetchData()
    } catch (e) {
      toast.error('Gagal import: ' + e.message)
    } finally { setImportSaving(false) }
  }

  const poleIdPreview = !editingId && form.desa ? generatePoleId(form.site, form.desa, poles) : null

  return (
    <div className="page-container">
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 700 }}>
            <Antenna size={22} style={{ color: 'var(--accent)' }} />
            Data Tiang
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Jaringan Fiber — Pencatatan & Manajemen Tiang
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportKMZ}
            disabled={kmzLoading}
            title="Export ke KMZ (Google Earth)"
            style={{ color: 'var(--accent)', borderColor: 'rgba(var(--accent-rgb, 59,130,246),0.4)' }}
          >
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
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 auto', minWidth: '200px', maxWidth: '350px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            <input
              className="form-input"
              style={{ paddingLeft: '30px', height: '34px', fontSize: '13px', width: '100%' }}
              placeholder="Cari ID, Desa, Kecamatan..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
            />
          </div>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '110px', width: 'auto' }} value={filterSite} onChange={e => { setFilterSite(e.target.value); setPage(1) }}>
            <option value="">Semua Site</option>
            {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '140px', width: 'auto' }} value={filterKecamatan} onChange={e => { setFilterKecamatan(e.target.value); setPage(1) }}>
            <option value="">Semua Kecamatan</option>
            {kecamatanList.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <select className="form-input" style={{ height: '34px', fontSize: '13px', minWidth: '100px', width: 'auto' }} value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }}>
            <option value="">Semua Jenis</option>
            {POLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {(filterSite || filterKecamatan || filterType || searchQuery)
            ? <button className="btn btn-secondary btn-sm" style={{ height: '34px', whiteSpace: 'nowrap' }} onClick={() => { setFilterSite(''); setFilterKecamatan(''); setFilterType(''); setSearchQuery(''); setPage(1) }}>Reset</button>
            : <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>{filtered.length} data</div>
          }
        </div>
        {/* Mobile: stack filters */}
        <style>{`
          @media (max-width: 768px) {
            .tiang-filter-grid {
              grid-template-columns: 1fr 1fr !important;
            }
            .tiang-filter-grid > :first-child {
              grid-column: 1 / -1;
            }
          }
          @media (max-width: 480px) {
            .tiang-filter-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>

      {/* ── TABLE (desktop) / CARDS (mobile) ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {/* Desktop table */}
        <div style={{ overflowX: 'auto' }} className="desktop-table">
          <table className="table" style={{ minWidth: '960px', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>No</th>
                <th style={{ cursor: 'pointer', width: '90px' }} onClick={() => handleSort('site')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>Site <SortIcon col="site" /></div>
                </th>
                <th style={{ cursor: 'pointer', minWidth: '200px' }} onClick={() => handleSort('pole_id')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>ID Tiang <SortIcon col="pole_id" /></div>
                </th>
                <th style={{ width: '90px' }}>Jenis</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kecamatan')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>Kecamatan <SortIcon col="kecamatan" /></div>
                </th>
                <th>Desa</th>
                <th style={{ width: '120px' }}>Koordinat</th>
                <th style={{ width: '55px' }}>Maps</th>
                <th>Keterangan</th>
                <th style={{ width: '100px' }}>Input Oleh</th>
                <th style={{ cursor: 'pointer', width: '100px' }} onClick={() => handleSort('created_at')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>Tgl Input <SortIcon col="created_at" /></div>
                </th>
                {['admin', 'superadmin'].includes(role) && <th style={{ width: '80px' }}>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Memuat data...</td></tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    <Antenna size={28} style={{ opacity: 0.25, marginBottom: '8px', display: 'block', margin: '0 auto 8px' }} />
                    Belum ada data tiang
                  </td>
                </tr>
              ) : paginated.map((pole, idx) => (
                <tr key={pole.id}>
                  <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '11px' }}>{(page - 1) * perPage + idx + 1}</td>
                  <td>
                    <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '20px', background: 'var(--bg-primary)', border: '1px solid var(--border)', fontWeight: 600 }}>
                      {SITES.find(s => s.value === pole.site)?.label || pole.site}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>
                      {pole.pole_id || '-'}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      fontSize: '11px', padding: '2px 7px', borderRadius: '20px', fontWeight: 600,
                      background: pole.pole_type === 'tiang_9m' ? 'rgba(251,191,36,0.15)' : 'rgba(16,185,129,0.12)',
                      color: pole.pole_type === 'tiang_9m' ? 'var(--warning)' : 'var(--success)',
                    }}>
                      {POLE_TYPES.find(t => t.value === pole.pole_type)?.label}
                    </span>
                  </td>
                  <td style={{ fontSize: '12px' }}>{pole.kecamatan || '-'}</td>
                  <td style={{ fontSize: '12px' }}>{pole.desa || '-'}</td>
                  <td>
                    {pole.latitude && pole.longitude ? (
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'monospace', lineHeight: '1.4' }}>
                        <div>Lat: {Number(pole.latitude).toFixed(5)}</div>
                        <div>Lon: {Number(pole.longitude).toFixed(5)}</div>
                      </div>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>}
                  </td>
                  <td>
                    {pole.maps_url
                      ? <a href={pole.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px' }}>
                          <MapPin size={12} /><ExternalLink size={11} />
                        </a>
                      : '-'}
                  </td>
                  <td style={{ fontSize: '11px', color: 'var(--text-secondary)', maxWidth: '120px' }}>
                    <span title={pole.keterangan} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pole.keterangan || '-'}
                    </span>
                  </td>
                  <td style={{ fontSize: '11px' }}>
                    <div style={{ fontWeight: 500 }}>{getUserName(pole.created_by)}</div>
                    {pole.updated_by && pole.updated_by !== pole.created_by && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>Edit: {getUserName(pole.updated_by)}</div>
                    )}
                  </td>
                  <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {pole.created_at ? format(new Date(pole.created_at), 'dd MMM yy', { locale: localeId }) : '-'}
                  </td>
                  {['admin', 'superadmin'].includes(role) && (
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '4px 7px' }} onClick={() => openEdit(pole)}><Edit2 size={12} /></button>
                        <button className="btn btn-sm" style={{ padding: '4px 7px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)' }} onClick={() => setConfirmDelete(pole)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="mobile-cards" style={{ display: 'none' }}>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat data...</div>
          ) : paginated.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Antenna size={28} style={{ opacity: 0.25, marginBottom: '8px' }} />
              <div>Belum ada data tiang</div>
            </div>
          ) : paginated.map((pole, idx) => (
            <div key={pole.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--accent)', fontWeight: 700 }}>{pole.pole_id || '-'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {SITES.find(s => s.value === pole.site)?.label} ·{' '}
                    <span style={{ color: pole.pole_type === 'tiang_9m' ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
                      {POLE_TYPES.find(t => t.value === pole.pole_type)?.label}
                    </span>
                  </div>
                </div>
                {['admin', 'superadmin'].includes(role) && (
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => openEdit(pole)}><Edit2 size={12} /></button>
                    <button className="btn btn-sm" style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)' }} onClick={() => setConfirmDelete(pole)}><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '12px' }}>
                <div><span style={{ color: 'var(--text-secondary)' }}>Kecamatan: </span>{pole.kecamatan || '-'}</div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Desa: </span>{pole.desa || '-'}</div>
                {pole.latitude && <div><span style={{ color: 'var(--text-secondary)' }}>Lat: </span>{Number(pole.latitude).toFixed(5)}</div>}
                {pole.longitude && <div><span style={{ color: 'var(--text-secondary)' }}>Lon: </span>{Number(pole.longitude).toFixed(5)}</div>}
                {pole.maps_url && <div style={{ gridColumn: '1/-1' }}>
                  <a href={pole.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} /> Lihat Maps <ExternalLink size={11} />
                  </a>
                </div>}
                {pole.keterangan && <div style={{ gridColumn: '1/-1', color: 'var(--text-secondary)' }}>{pole.keterangan}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Responsive style */}
        <style>{`
          @media (max-width: 768px) {
            .desktop-table { display: none !important; }
            .mobile-cards { display: block !important; }
          }
        `}</style>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', padding: '14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .map((p, i, arr) => (
                <span key={p}>
                  {i > 0 && arr[i - 1] !== p - 1 && <span style={{ color: 'var(--text-secondary)', padding: '0 2px' }}>…</span>}
                  <button className={`btn btn-sm ${page === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPage(p)}>{p}</button>
                </span>
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
                {!editingId && poleIdPreview && (
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--accent)', fontFamily: 'monospace' }}>ID: {poleIdPreview}</p>
                )}
              </div>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label">Site <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-input" value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Jenis Tiang <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-input" value={form.pole_type} onChange={e => setForm(f => ({ ...f, pole_type: e.target.value }))}>
                    {POLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>📍 Lokasi Administratif</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label">Provinsi</label>
                  <input className="form-input" value={form.provinsi} onChange={e => setForm(f => ({ ...f, provinsi: e.target.value }))} placeholder="Jawa Tengah" />
                </div>
                <div>
                  <label className="form-label">Kabupaten/Kota</label>
                  <input className="form-input" value={form.kabupaten} onChange={e => setForm(f => ({ ...f, kabupaten: e.target.value }))} placeholder="Banyumas" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label">Kecamatan <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" value={form.kecamatan} onChange={e => setForm(f => ({ ...f, kecamatan: e.target.value }))} placeholder="Purwokerto Selatan" />
                </div>
                <div>
                  <label className="form-label">Desa/Kelurahan <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" value={form.desa} onChange={e => setForm(f => ({ ...f, desa: e.target.value }))} placeholder="Tanjung" />
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>🗺️ Koordinat GPS</span>
              </div>
              <div>
                <label className="form-label">URL Google Maps</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input className="form-input" style={{ flex: 1 }} value={form.maps_url} onChange={e => setForm(f => ({ ...f, maps_url: e.target.value }))} placeholder="Tempel link Google Maps..." />
                  <button className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={handleExtractCoords} type="button">
                    <MapPin size={13} /> Ambil Koord
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Paste URL Maps lalu klik "Ambil Koord" untuk isi otomatis.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label">Longitude</label>
                  <input className="form-input" type="number" step="any" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} placeholder="109.2345678" />
                </div>
                <div>
                  <label className="form-label">Latitude</label>
                  <input className="form-input" type="number" step="any" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} placeholder="-7.4321234" />
                </div>
              </div>
              <div>
                <label className="form-label">Keterangan</label>
                <textarea className="form-input" rows={2} style={{ resize: 'vertical' }} value={form.keterangan} onChange={e => setForm(f => ({ ...f, keterangan: e.target.value }))} placeholder="Catatan tambahan..." />
              </div>
              </div>
            </div>
            <div className="modal-footer" style={{ flexShrink: 0, padding: '16px 24px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? '...' : editingId ? '✓ Simpan Perubahan' : '✓ Tambah Tiang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL IMPORT ══════ */}
      {isImportModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '780px', maxWidth: '96vw', maxHeight: '93vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Preview Import Data Tiang</h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {importRows.filter(r => r._valid).length} baris valid · {importRows.filter(r => !r._valid).length} baris tidak valid (dilewati)
                </p>
              </div>
              <button className="btn-close" onClick={() => setIsImportModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ fontSize: '12px', minWidth: '600px' }}>
                  <thead>
                    <tr>
                      <th>Baris</th>
                      <th>Site</th>
                      <th>Jenis</th>
                      <th>Kecamatan</th>
                      <th>Desa</th>
                      <th>Lat</th>
                      <th>Lon</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map(row => (
                      <tr key={row._rowNo} style={{ opacity: row._valid ? 1 : 0.45 }}>
                        <td style={{ color: 'var(--text-secondary)' }}>{row._rowNo}</td>
                        <td>{SITES.find(s => s.value === row.site)?.label || row.site}</td>
                        <td>{POLE_TYPES.find(t => t.value === row.pole_type)?.label || row.pole_type}</td>
                        <td>{row.kecamatan || <span style={{ color: 'var(--danger)' }}>Kosong!</span>}</td>
                        <td>{row.desa || <span style={{ color: 'var(--danger)' }}>Kosong!</span>}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{row.latitude || '-'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{row.longitude || '-'}</td>
                        <td>
                          {row._valid
                            ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Valid</span>
                            : <span style={{ color: 'var(--danger)', fontWeight: 600 }}>✗ Dilewati</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer" style={{ flexShrink: 0, padding: '16px 24px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => { setIsImportModalOpen(false); setImportRows([]) }}>Batal</button>
              <button className="btn btn-primary" disabled={importSaving || importRows.filter(r => r._valid).length === 0} onClick={handleSaveImport}>
                {importSaving ? 'Menyimpan...' : `✓ Import ${importRows.filter(r => r._valid).length} Tiang`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL KONFIRMASI HAPUS ══════ */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '400px', maxWidth: '96vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, color: 'var(--danger)' }}>⚠ Hapus Tiang</h3>
              <button className="btn-close" onClick={() => setConfirmDelete(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p>Hapus tiang <strong style={{ color: 'var(--accent)' }}>{confirmDelete.pole_id}</strong>?</p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Aksi ini tidak bisa dibatalkan.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Batal</button>
              <button style={{ background: 'var(--danger)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleDelete(confirmDelete)}>
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

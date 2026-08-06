import { useState, useRef } from 'react'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  FileSpreadsheet, Map as MapIcon, Upload, RefreshCw,
  CheckCircle, Loader, Info, Pause, Play, Square, AlertCircle,
  Link, AlertTriangle, Download
} from 'lucide-react'

// ── HELPERS ────────────────────────────────────────────────────────────────────

/** Delay helper */
function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

/** Parse KMZ -> array of { name, lat, lon } */
async function parseKMZ(file) {
  const zip = await JSZip.loadAsync(file)
  const kmlFile = Object.keys(zip.files).find(n => n.endsWith('.kml'))
  if (!kmlFile) throw new Error('Tidak ada file .kml di dalam KMZ ini.')
  const kmlText = await zip.files[kmlFile].async('text')
  const doc = new DOMParser().parseFromString(kmlText, 'application/xml')
  return [...doc.querySelectorAll('Placemark')].map(pm => {
    const name = pm.querySelector('name')?.textContent?.trim() || ''
    const coordText = pm.querySelector('coordinates')?.textContent?.trim() || ''
    const parts = coordText.split(',')
    if (parts.length < 2) return null
    let lon = parseFloat(parts[0]), lat = parseFloat(parts[1])
    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) { const t = lat; lat = lon; lon = t }
    if (isNaN(lat) || isNaN(lon)) return null
    return { name, lat, lon }
  }).filter(Boolean)
}

/** Strip prefix "Kecamatan ", "Desa ", dll */
const cleanName = (s) => (s || '').replace(/^(Kecamatan|Desa|Kelurahan|Kabupaten|Kota)\s+/i, '').trim()

/** BigDataCloud reverse geocode */
async function fetchBDC(lat, lon) {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return {}
    const d = await res.json()
    const admin = d.localityInfo?.administrative || []
    const lvl = (n) => cleanName(admin.find(a => a.adminLevel === n)?.name || '')
    const provinsi  = lvl(4) || cleanName(d.principalSubdivision || '')
    const kabupaten = lvl(5) || cleanName(d.city || '')
    const kec6 = lvl(6)
    const kec7 = lvl(7)
    const des8 = lvl(8)
    const kecamatan = kec6 || (des8 ? kec7 : '')
    const desa      = des8 || (!kec6 ? kec7 : '') || cleanName(d.locality || '')
    return { provinsi, kabupaten, kecamatan, desa, locality: cleanName(d.locality || '') }
  } catch { return {} }
}

/** Cache & mutex queue untuk Nominatim (maks 1 req/s) */
const nomCache = new Map()
let nomLock = Promise.resolve()

async function fetchNominatimSafe(lat, lon, zoom) {
  const z = zoom || 18
  const latR = Math.round(parseFloat(lat) * 100) / 100
  const lonR = Math.round(parseFloat(lon) * 100) / 100
  const key = `${z}_${latR}_${lonR}`
  if (nomCache.has(key)) return nomCache.get(key)

  return new Promise(resolve => {
    nomLock = nomLock.then(async () => {
      if (nomCache.has(key)) { resolve(nomCache.get(key)); return }
      await delay(1100)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=id&zoom=${z}&addressdetails=1`,
          { headers: { 'User-Agent': 'MaintoryApp/1.0' }, signal: AbortSignal.timeout(8000) }
        )
        if (!res.ok) throw new Error('Failed')
        const d = await res.json()
        const a = d.address || {}
        const data = {
          provinsi:  a.state || '',
          kabupaten: cleanName(a.county || a.city || ''),
          kecamatan: cleanName(a.municipality || a.district || a.city_district || a.borough || a.town || (z < 18 ? a.village : '') || ''),
          desa:      cleanName(a.village || a.hamlet || a.quarter || a.neighbourhood || a.suburb || ''),
        }
        nomCache.set(key, data)
        resolve(data)
      } catch { resolve({}) }
    })
  })
}

/** Gabungkan BDC + Nominatim, dengan fallback zoom 12 jika kecamatan kosong */
async function reverseGeocode(lat, lon) {
  const [bdcR, nomR] = await Promise.allSettled([fetchBDC(lat, lon), fetchNominatimSafe(lat, lon, 18)])
  const b = bdcR.status === 'fulfilled' ? bdcR.value : {}
  const n = nomR.status === 'fulfilled' ? nomR.value : {}

  let kecamatan = n.kecamatan || b.kecamatan || ''
  const desa = n.desa || b.desa || ''

  if (!kecamatan) {
    const fallback = await fetchNominatimSafe(lat, lon, 12)
    if (fallback.kecamatan) {
      kecamatan = fallback.kecamatan
    } else if (b.locality && b.locality !== desa) {
      kecamatan = b.locality
    }
  }

  return {
    provinsi:  b.provinsi  || n.provinsi  || '',
    kabupaten: b.kabupaten || n.kabupaten || '',
    kecamatan,
    desa,
  }
}

/** Buat KMZ dari baris data Excel */
async function buildKMZ(rows) {
  const byDesa = {}
  for (const r of rows) {
    const lat = Number(r['Latitude'] || 0)
    const lon = Number(r['Longitude'] || 0)
    if (!lat || !lon) continue
    const desa = r['Desa/Kelurahan'] || 'Tanpa Desa'
    if (!byDesa[desa]) byDesa[desa] = []
    byDesa[desa].push(r)
  }
  const makePM = (r) => {
    let lat = Number(r['Latitude']), lon = Number(r['Longitude'])
    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) { const t = lat; lat = lon; lon = t }
    return `<Placemark>
        <name>${r['ID Tiang'] || r['Desa/Kelurahan'] || 'Tiang'}</name>
        <description><![CDATA[<b>Site:</b> ${r['Site'] || ''}<br/><b>Jenis:</b> ${r['Jenis Tiang'] || ''}<br/><b>Kecamatan:</b> ${r['Kecamatan'] || ''}<br/><b>Desa:</b> ${r['Desa/Kelurahan'] || ''}<br/><b>Ket:</b> ${r['Keterangan'] || ''}]]></description>
        <styleUrl>#tiang_icon</styleUrl>
        <Point><coordinates>${lon},${lat},0</coordinates></Point>
      </Placemark>`
  }
  const folders = Object.entries(byDesa)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([desa, list]) => `<Folder><name>Desa ${desa}</name><open>0</open>${list.map(makePM).join('')}</Folder>`)
    .join('')
  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <name>Data Tiang - ${format(new Date(), 'dd MMM yyyy')}</name>
    <Style id="tiang_icon"><IconStyle><scale>1.2</scale><Icon><href>files/icon_tiang.png</href></Icon><hotSpot x="0.5" y="0" xunits="fraction" yunits="fraction"/></IconStyle><LabelStyle><color>ffffffff</color><scale>0.8</scale></LabelStyle></Style>
    ${folders}</Document></kml>`
  const zip = new JSZip()
  zip.file('doc.kml', kml)
  try { const b = await (await fetch('/icon_tiang.png')).blob(); zip.folder('files').file('icon_tiang.png', b) } catch {}
  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

// ── URL PARSER ──────────────────────────────────────────────────────────────────
function extractCoordsFromMapsUrl(url) {
  if (!url) return null
  // Format: @lat,lon
  const m1 = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m1) return { lat: parseFloat(m1[1]), lon: parseFloat(m1[2]) }
  // Format: ?q=lat,lon
  const m2 = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m2) return { lat: parseFloat(m2[1]), lon: parseFloat(m2[2]) }
  // Format: /maps/place/.../lat,lon
  const m3 = url.match(/(-?\d+\.\d{5,}),(-?\d+\.\d{5,})/)
  if (m3) return { lat: parseFloat(m3[1]), lon: parseFloat(m3[2]) }
  return null
}

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function KonversiTiang() {
  const [mode, setMode] = useState('kmz2excel')

  // KMZ → Excel state
  const [kmzFile, setKmzFile] = useState(null)
  const [kmzRows, setKmzRows] = useState([])
  const [geocoding, setGeocoding] = useState(false)
  const [paused, setPaused] = useState(false)
  const [geocoded, setGeocoded] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [failCount, setFailCount] = useState(0)

  // Excel → KMZ state
  const [excelFile, setExcelFile] = useState(null)
  const [excelRows, setExcelRows] = useState([])
  const [excelParsed, setExcelParsed] = useState(false)
  const [exporting, setExporting] = useState(false)

  // URL → Excel state
  const [urlInput, setUrlInput] = useState('')
  const [urlRows, setUrlRows] = useState([])
  const [urlProcessing, setUrlProcessing] = useState(false)
  const [urlProgress, setUrlProgress] = useState({ done: 0, total: 0 })
  const [urlDone, setUrlDone] = useState(false)
  const urlStopRef = useRef(false)

  const SITES = [
    { value: 'banyumas', label: 'Banyumas' },
    { value: 'cilacap', label: 'Cilacap' },
    { value: 'cilacap_herman', label: 'Cilacap (Herman)' },
  ]
  const POLE_TYPES = [
    { value: 'tiang_7m', label: 'Tiang 7 m' },
    { value: 'tiang_9m', label: 'Tiang 9 m' },
  ]

  const kmzRef   = useRef()
  const excelRef = useRef()
  const pauseRef = useRef(false)
  const stopRef  = useRef(false)

  // ── KMZ → EXCEL ──────────────────────────────────────────────────────────────
  const handleKmzUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setKmzFile(file)
    setKmzRows([])
    setGeocoded(false)
    setPaused(false)
    setProgress({ done: 0, total: 0 })
    setFailCount(0)
    try {
      const marks = await parseKMZ(file)
      const rows = marks.map(m => ({ ...m, provinsi: '', kabupaten: '', kecamatan: '', desa: '', status: 'pending' }))
      setKmzRows(rows)
      setProgress({ done: 0, total: rows.length })
      toast.success(`${rows.length} titik ditemukan. Klik Mulai Geocode.`)
    } catch (err) {
      toast.error(err.message || 'Gagal membaca KMZ')
    }
    e.target.value = ''
  }

  const handleGeocode = async () => {
    if (!kmzRows.length) return
    stopRef.current  = false
    pauseRef.current = false
    setGeocoding(true)
    setPaused(false)
    setGeocoded(false)
    setFailCount(0)

    const results = kmzRows.map(r => ({ ...r }))
    let fails = 0
    const BATCH = 10

    for (let i = 0; i < results.length; i += BATCH) {
      if (stopRef.current) break
      while (pauseRef.current && !stopRef.current) await delay(200)
      if (stopRef.current) break

      const chunk = results.slice(i, i + BATCH)
      const geoResults = await Promise.all(chunk.map(r => reverseGeocode(r.lat, r.lon)))

      geoResults.forEach((geo, bi) => {
        const idx = i + bi
        results[idx] = { ...results[idx], ...geo, status: 'done' }
        if (!geo.provinsi && !geo.kabupaten) fails++
      })

      setKmzRows([...results])
      setProgress({ done: Math.min(i + BATCH, results.length), total: results.length })
      setFailCount(fails)
    }

    const stopped = stopRef.current
    setGeocoding(false)
    setPaused(false)
    if (!stopped) {
      setGeocoded(true)
      toast.success(`Geocoding selesai! ${fails > 0 ? `${fails} titik tidak ditemukan lokasinya.` : 'Semua titik berhasil.'}`)
    } else {
      toast('Geocoding dihentikan.')
    }
  }

  const handlePause = () => {
    pauseRef.current = !pauseRef.current
    setPaused(pauseRef.current)
  }

  const handleStop = () => {
    stopRef.current = true
    pauseRef.current = false
    setPaused(false)
  }

  const handleExportExcel = () => {
    const data = kmzRows.map((r, i) => ({
      'No': i + 1,
      'Site': 'banyumas',
      'Jenis Tiang': 'tiang_7m',
      'ID Tiang': '',
      'Provinsi': r.provinsi || '',
      'Kabupaten/Kota': r.kabupaten || '',
      'Kecamatan': r.kecamatan || '',
      'Desa/Kelurahan': r.desa || '',
      'Maps URL': `https://maps.google.com/?q=${r.lat},${r.lon}`,
      'Longitude': r.lon,
      'Latitude': r.lat,
      'Keterangan': r.name || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const cols = Object.keys(data[0] || {}).map(k => ({ wch: Math.max(k.length + 2, 12) }))
    ws['!cols'] = cols
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data Tiang')
    XLSX.writeFile(wb, `Data_Tiang_from_KMZ_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`)
    toast.success('File Excel berhasil didownload!')
  }

  // ── URL → EXCEL ───────────────────────────────────────────────────────────────
  const handleProcessUrls = async () => {
    const lines = urlInput.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) return toast.error('Tidak ada URL yang dimasukkan!')

    // Parse all URLs first
    const parsed = lines.map((url, i) => {
      const coords = extractCoordsFromMapsUrl(url)
      return {
        _idx: i,
        url,
        lat: coords?.lat ?? null,
        lon: coords?.lon ?? null,
        valid: !!coords,
        site: 'banyumas',
        pole_type: 'tiang_7m',
        keterangan: '',
        provinsi: '', kabupaten: '', kecamatan: '', desa: '',
        status: coords ? 'pending' : 'invalid',
      }
    })

    const invalidCount = parsed.filter(r => !r.valid).length
    if (invalidCount > 0) toast(`⚠️ ${invalidCount} URL tidak bisa diekstrak koordinatnya.`, { duration: 5000 })

    setUrlRows([...parsed])
    setUrlDone(false)
    setUrlProcessing(true)
    urlStopRef.current = false
    setUrlProgress({ done: 0, total: parsed.filter(r => r.valid).length })

    const results = [...parsed]
    const validItems = results.filter(r => r.valid)
    const BATCH = 8
    let done = 0

    for (let i = 0; i < validItems.length; i += BATCH) {
      if (urlStopRef.current) break
      const chunk = validItems.slice(i, i + BATCH)
      const geoResults = await Promise.all(chunk.map(r => reverseGeocode(r.lat, r.lon)))
      geoResults.forEach((geo, bi) => {
        const item = chunk[bi]
        const idx = results.findIndex(r => r._idx === item._idx)
        if (idx !== -1) {
          results[idx] = { ...results[idx], ...geo, status: 'done' }
        }
        done++
      })
      setUrlRows([...results])
      setUrlProgress({ done, total: validItems.length })
    }

    setUrlProcessing(false)
    if (!urlStopRef.current) {
      setUrlDone(true)
      toast.success('Geocoding selesai! Periksa hasilnya lalu Download Excel.')
    } else {
      toast('Proses dihentikan.')
    }
  }

  const handleUrlCellEdit = (idx, field, value) => {
    setUrlRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  const handleExportUrlExcel = () => {
    const validRows = urlRows.filter(r => r.valid)
    if (validRows.length === 0) return toast.error('Tidak ada data untuk diexport!')
    const data = validRows.map(r => ({
      'Site': r.site,
      'Jenis Tiang': r.pole_type,
      'Provinsi': r.provinsi || '',
      'Kabupaten/Kota': r.kabupaten || '',
      'Kecamatan': r.kecamatan || '',
      'Desa/Kelurahan': r.desa || '',
      'Maps URL': r.url,
      'Latitude': r.lat ?? '',
      'Longitude': r.lon ?? '',
      'Keterangan': r.keterangan || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [15, 12, 16, 18, 22, 22, 40, 14, 14, 30].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template Import')
    XLSX.writeFile(wb, `Template_Import_dari_URL_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`)
    toast.success('File Excel berhasil didownload!')
  }

  // ── EXCEL → KMZ ──────────────────────────────────────────────────────────────
  const handleExcelUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setExcelFile(file)
    setExcelRows([])
    setExcelParsed(false)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { raw: false })
        setExcelRows(rows)
        setExcelParsed(true)
        toast.success(`${rows.length} baris siap dikonversi.`)
      } catch { toast.error('Gagal membaca Excel') }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const handleExportKMZ = async () => {
    if (!excelRows.length) return
    setExporting(true)
    try {
      const blob = await buildKMZ(excelRows)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Data_Tiang_${format(new Date(), 'yyyyMMdd')}.kmz`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('File KMZ berhasil didownload!')
    } catch (err) {
      toast.error(err.message || 'Gagal membuat KMZ')
    } finally { setExporting(false) }
  }

  // ── RENDER ────────────────────────────────────────────────────────────────────
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const doneCount  = kmzRows.filter(r => r.status === 'done').length
  const emptyCount = kmzRows.filter(r => r.status === 'done' && !r.provinsi && !r.kabupaten).length

  return (
    <div className="page-container">
      {/* HEADER */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 700 }}>
          <RefreshCw size={22} style={{ color: 'var(--accent)' }} />
          Konversi Data Tiang
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Konversi antara format KMZ (Google Earth) dan Excel
        </p>
      </div>

      {/* MODE SWITCHER */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '28px', padding: '4px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', width: 'fit-content' }}>
        {[
          { key: 'kmz2excel', label: 'KMZ → Excel', icon: <FileSpreadsheet size={15} /> },
          { key: 'excel2kmz', label: 'Excel → KMZ', icon: <MapIcon size={15} /> },
          { key: 'url2excel', label: 'URL Maps → Excel', icon: <Link size={15} /> },
        ].map(m => (
          <button key={m.key} onClick={() => setMode(m.key)} style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            padding: '9px 20px', borderRadius: 'var(--radius-md)',
            border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
            background: mode === m.key ? 'var(--accent)' : 'transparent',
            color: mode === m.key ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.2s',
          }}>{m.icon} {m.label}</button>
        ))}
      </div>

      {/* ═══════════ MODE: KMZ → EXCEL ═══════════ */}
      {mode === 'kmz2excel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Info */}
          <div style={{ display: 'flex', gap: '10px', padding: '14px 16px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 'var(--radius-md)' }}>
            <Info size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
              Upload file <strong>.kmz</strong>. Sistem membaca koordinat setiap titik lalu mengisi otomatis
              <strong> Provinsi, Kabupaten, Kecamatan, Desa</strong> via reverse geocoding.
              Kolom <strong>ID Tiang dikosongkan</strong> — akan terisi otomatis saat diimport ke Data Tiang.
            </div>
          </div>

          {/* Upload zone */}
          <div
            onClick={() => !geocoding && kmzRef.current?.click()}
            style={{
              border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)',
              padding: '36px', textAlign: 'center',
              cursor: geocoding ? 'default' : 'pointer',
              background: 'var(--bg-secondary)', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { if (!geocoding) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(59,130,246,0.04)' } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-secondary)' }}
          >
            <input ref={kmzRef} type="file" accept=".kmz" style={{ display: 'none' }} onChange={handleKmzUpload} />
            <Upload size={32} style={{ color: 'var(--accent)', marginBottom: '10px' }} />
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{kmzFile ? kmzFile.name : 'Klik untuk upload file KMZ'}</p>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Format: .kmz dari Google Earth</p>
          </div>

          {/* Progress + Controls */}
          {kmzRows.length > 0 && (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>
                    {geocoding ? (paused ? '⏸ Dijeda...' : '⚡ Geocoding...') : geocoded ? '✅ Selesai' : '🕒 Siap diproses'}
                  </span>
                  <span style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {progress.done}/{progress.total} titik
                    {emptyCount > 0 && <span style={{ color: 'var(--warning)', marginLeft: '8px' }}>⚠ {emptyCount} lokasi tidak ditemukan</span>}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!geocoding && !geocoded && (
                    <button className="btn btn-primary btn-sm" onClick={handleGeocode} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapIcon size={14} /> Mulai Geocode
                    </button>
                  )}
                  {geocoding && (
                    <>
                      <button className="btn btn-secondary btn-sm" onClick={handlePause} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {paused ? <><Play size={13} /> Lanjutkan</> : <><Pause size={13} /> Jeda</>}
                      </button>
                      <button className="btn btn-sm" onClick={handleStop} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' }}>
                        <Square size={13} /> Hentikan
                      </button>
                    </>
                  )}
                  {geocoded && (
                    <>
                      <button className="btn btn-secondary btn-sm" onClick={handleGeocode} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <RefreshCw size={13} /> Ulangi
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={handleExportExcel} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--success, #22c55e)' }}>
                        <FileSpreadsheet size={13} /> Download Excel
                      </button>
                    </>
                  )}
                  {!geocoding && !geocoded && progress.done > 0 && (
                    <button className="btn btn-primary btn-sm" onClick={handleExportExcel} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--success, #22c55e)' }}>
                      <FileSpreadsheet size={13} /> Download Sebagian
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ background: 'var(--border)', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: paused ? 'var(--warning)' : geocoded ? 'var(--success, #22c55e)' : 'var(--accent)',
                  borderRadius: '999px', transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                <span>{pct}%</span>
                <span>
                  {geocoding && !paused && progress.total > 0 && (() => {
                    const remaining = progress.total - progress.done
                    const batches = Math.ceil(remaining / 5)
                    const secs = batches * 1.5
                    return secs < 60 ? `~${Math.ceil(secs)} dtk tersisa` : `~${Math.ceil(secs / 60)} mnt tersisa`
                  })()}
                </span>
              </div>
            </div>
          )}

          {/* Table Preview */}
          {kmzRows.length > 0 && (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>Preview — {kmzRows.length} Titik</span>
                <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--success)' }}>✓ {doneCount} selesai</span>
                  {emptyCount > 0 && <span style={{ color: 'var(--warning)' }}>⚠ {emptyCount} kosong</span>}
                  <span>{kmzRows.length - doneCount} pending</span>
                </div>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                      {['No', 'Nama (KMZ)', 'Lat', 'Lon', 'Provinsi', 'Kabupaten', 'Kecamatan', 'Desa', '✓'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {kmzRows.map((r, i) => {
                      const hasGeo = r.provinsi || r.kabupaten || r.kecamatan
                      const isEmpty = r.status === 'done' && !hasGeo
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isEmpty ? 'rgba(245,158,11,0.05)' : 'transparent' }}>
                          <td style={{ padding: '7px 12px', color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ padding: '7px 12px', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || '-'}</td>
                          <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: '11px' }}>{r.lat.toFixed(5)}</td>
                          <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: '11px' }}>{r.lon.toFixed(5)}</td>
                          <td style={{ padding: '7px 12px' }}>{r.provinsi || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                          <td style={{ padding: '7px 12px' }}>{r.kabupaten || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                          <td style={{ padding: '7px 12px' }}>{r.kecamatan || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                          <td style={{ padding: '7px 12px' }}>{r.desa || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                          <td style={{ padding: '7px 12px' }}>
                            {r.status !== 'done' ? <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>…</span>
                              : isEmpty ? <AlertCircle size={13} style={{ color: 'var(--warning)' }} />
                                : <CheckCircle size={13} style={{ color: 'var(--success)' }} />}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ MODE: EXCEL → KMZ ═══════════ */}
      {mode === 'excel2kmz' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '10px', padding: '14px 16px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 'var(--radius-md)' }}>
            <Info size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
              Upload file <strong>.xlsx</strong> format Data Tiang (kolom: <strong>Longitude, Latitude, ID Tiang, Desa/Kelurahan</strong>, dll).
              Hasil KMZ akan memiliki <strong>folder per desa</strong> seperti export dari halaman Data Tiang.
            </div>
          </div>

          <div
            onClick={() => excelRef.current?.click()}
            style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '36px', textAlign: 'center', cursor: 'pointer', background: 'var(--bg-secondary)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--success)'; e.currentTarget.style.background = 'rgba(34,197,94,0.04)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-secondary)' }}
          >
            <input ref={excelRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelUpload} />
            <Upload size={32} style={{ color: 'var(--success)', marginBottom: '10px' }} />
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{excelFile ? excelFile.name : 'Klik untuk upload file Excel (.xlsx)'}</p>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Kolom: Site, ID Tiang, Longitude, Latitude, Desa/Kelurahan, dst</p>
          </div>

          {excelParsed && excelRows.length > 0 && (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>Preview — {excelRows.length} Baris</span>
                  <span style={{ marginLeft: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {[...new Set(excelRows.map(r => r['Desa/Kelurahan']).filter(Boolean))].length} desa
                  </span>
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleExportKMZ} disabled={exporting} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {exporting ? <Loader size={14} /> : <MapIcon size={14} />}
                  {exporting ? 'Membuat KMZ...' : 'Download KMZ'}
                </button>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                      {['No', 'ID Tiang', 'Site', 'Jenis', 'Kecamatan', 'Desa/Kelurahan', 'Lat', 'Lon'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelRows.slice(0, 50).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '7px 12px', color: 'var(--text-muted)' }}>{i + 1}</td>
                        <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--accent)' }}>{r['ID Tiang'] || '(kosong)'}</td>
                        <td style={{ padding: '7px 12px' }}>{r['Site'] || '-'}</td>
                        <td style={{ padding: '7px 12px' }}>{r['Jenis Tiang'] || '-'}</td>
                        <td style={{ padding: '7px 12px' }}>{r['Kecamatan'] || '-'}</td>
                        <td style={{ padding: '7px 12px' }}>{r['Desa/Kelurahan'] || '-'}</td>
                        <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: '11px' }}>{r['Latitude'] || '-'}</td>
                        <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: '11px' }}>{r['Longitude'] || '-'}</td>
                      </tr>
                    ))}
                    {excelRows.length > 50 && (
                      <tr><td colSpan={8} style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>... dan {excelRows.length - 50} baris lainnya</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ MODE: URL → EXCEL ═══════════ */}
      {mode === 'url2excel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Info Box */}
          <div style={{ display: 'flex', gap: '10px', padding: '14px 16px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 'var(--radius-md)' }}>
            <Info size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Tempelkan URL Google Maps satu per baris. Sistem akan mengekstrak koordinat dan mengisi otomatis
              <strong> Provinsi, Kabupaten, Kecamatan, Desa</strong> via reverse geocoding.<br/>
              <strong>Format URL yang didukung:</strong> <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>https://maps.google.com/?q=-7.62,109.25</code> atau <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>https://www.google.com/maps/@-7.62,109.25,...</code><br/>
              <span style={{ color: 'var(--warning)' }}>⚠️ URL pendek (goo.gl) tidak didukung.</span> Buka URL pendeknya di browser, salin URL panjang dari address bar, lalu tempel di sini.
            </div>
          </div>

          {/* URL Input */}
          <div className="card" style={{ padding: '20px' }}>
            <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '10px' }}>
              Daftar URL Google Maps (1 URL per baris)
            </label>
            <textarea
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder={'https://maps.google.com/?q=-7.624160346131124,109.25473663955927\nhttps://www.google.com/maps/@-7.581199,109.251490,17z'}
              style={{
                width: '100%', minHeight: '160px', padding: '12px', resize: 'vertical',
                fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.8',
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {urlInput.split('\n').filter(l => l.trim()).length} URL terdeteksi
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { setUrlInput(''); setUrlRows([]); setUrlDone(false); setUrlProgress({ done: 0, total: 0 }) }}>Reset</button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={urlProcessing || !urlInput.trim()}
                  onClick={handleProcessUrls}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {urlProcessing ? <><Loader size={14} /> Memproses...</> : <><MapIcon size={14} /> Proses & Geocode</>}
                </button>
                {urlProcessing && (
                  <button className="btn btn-sm" onClick={() => { urlStopRef.current = true }} style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <Square size={13} /> Hentikan
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Progress */}
          {urlRows.length > 0 && (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '13px' }}>
                  {urlProcessing ? '⚡ Sedang geocoding...' : urlDone ? '✅ Selesai' : '⏸ Dihentikan'}
                  <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '10px', fontSize: '12px' }}>
                    {urlProgress.done}/{urlProgress.total} titik diproses
                  </span>
                </span>
                {(urlDone || urlProgress.done > 0) && (
                  <button className="btn btn-primary btn-sm" onClick={handleExportUrlExcel} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--success, #22c55e)' }}>
                    <Download size={13} /> Download Excel
                  </button>
                )}
              </div>
              <div style={{ background: 'var(--border)', borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
                <div style={{
                  width: `${urlProgress.total > 0 ? Math.round((urlProgress.done / urlProgress.total) * 100) : 0}%`,
                  height: '100%', background: urlDone ? 'var(--success, #22c55e)' : 'var(--accent)',
                  borderRadius: '999px', transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          )}

          {/* Preview Table */}
          {urlRows.length > 0 && (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>Preview — {urlRows.length} URL</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {urlRows.filter(r => !r.valid).length > 0 && <span style={{ color: 'var(--danger)', marginRight: '12px' }}>✗ {urlRows.filter(r => !r.valid).length} gagal ekstrak</span>}
                  <span style={{ color: 'var(--warning)' }}>{urlRows.filter(r => r.valid && r.status === 'pending').length > 0 ? `⏳ ${urlRows.filter(r => r.valid && r.status === 'pending').length} pending` : ''}</span>
                </span>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 1 }}>
                      {['No', 'Site', 'Jenis', 'Provinsi', 'Kabupaten', 'Kecamatan', 'Desa', 'Lat', 'Lon', 'Keterangan', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', fontSize: '11px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {urlRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: !r.valid ? 'rgba(239,68,68,0.06)' : r.status === 'pending' ? 'rgba(245,158,11,0.04)' : 'transparent' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{i + 1}</td>
                        <td style={{ padding: '4px 6px' }}>
                          <select value={r.site} onChange={e => handleUrlCellEdit(i, 'site', e.target.value)}
                            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '11px', padding: '2px 4px', width: '100%' }}>
                            {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <select value={r.pole_type} onChange={e => handleUrlCellEdit(i, 'pole_type', e.target.value)}
                            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '11px', padding: '2px 4px', width: '100%' }}>
                            {POLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </td>
                        {['provinsi', 'kabupaten', 'kecamatan', 'desa'].map(field => (
                          <td key={field} style={{ padding: '4px 6px' }}>
                            <input value={r[field] || ''} onChange={e => handleUrlCellEdit(i, field, e.target.value)}
                              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '11px', padding: '2px 6px', width: '100%', minWidth: '80px' }} />
                          </td>
                        ))}
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.lat?.toFixed(6) ?? '—'}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.lon?.toFixed(6) ?? '—'}</td>
                        <td style={{ padding: '4px 6px' }}>
                          <input value={r.keterangan || ''} onChange={e => handleUrlCellEdit(i, 'keterangan', e.target.value)}
                            placeholder="opsional..."
                            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '11px', padding: '2px 6px', width: '100%', minWidth: '80px' }} />
                        </td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                          {!r.valid ? <span style={{ color: 'var(--danger)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12}/> Gagal ekstrak</span>
                            : r.status === 'pending' ? <span style={{ color: 'var(--warning)', fontSize: '11px' }}>⏳ Pending</span>
                              : (!r.kecamatan && !r.desa) ? <span style={{ color: 'var(--warning)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={12}/> Lokasi kosong</span>
                                : <span style={{ color: 'var(--success)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={12}/> OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

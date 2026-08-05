import { useState, useRef } from 'react'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  FileSpreadsheet, Map, Upload, Download, ArrowRight, ArrowLeft,
  RefreshCw, X, CheckCircle, AlertTriangle, Loader, Info
} from 'lucide-react'

// ── CONSTANTS (sama seperti di DataTiang) ──────────────────────────────────────
const SITES = [
  { value: 'banyumas', label: 'Banyumas' },
  { value: 'cilacap', label: 'Cilacap' },
  { value: 'purbalingga', label: 'Purbalingga' },
  { value: 'banjarnegara', label: 'Banjarnegara' },
]
const POLE_TYPES = [
  { value: 'tiang_7m', label: 'Tiang 7 m' },
  { value: 'tiang_9m', label: 'Tiang 9 m' },
  { value: 'tiang_12m', label: 'Tiang 12 m' },
]

// ── HELPERS ────────────────────────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

/** Parse KMZ blob -> array of { name, lat, lon, description } */
async function parseKMZ(file) {
  const zip = await JSZip.loadAsync(file)
  let kmlText = ''
  const kmlFile = Object.keys(zip.files).find(n => n.endsWith('.kml'))
  if (!kmlFile) throw new Error('Tidak ada file .kml di dalam KMZ ini.')
  kmlText = await zip.files[kmlFile].async('text')

  const parser = new DOMParser()
  const doc = parser.parseFromString(kmlText, 'application/xml')

  const placemarks = [...doc.querySelectorAll('Placemark')]
  return placemarks.map(pm => {
    const name = pm.querySelector('name')?.textContent?.trim() || ''
    const desc = pm.querySelector('description')?.textContent?.trim() || ''
    const coordText = pm.querySelector('coordinates')?.textContent?.trim() || ''
    const parts = coordText.split(',')
    if (parts.length < 2) return null
    // KML format: lon,lat,alt
    let lon = parseFloat(parts[0])
    let lat = parseFloat(parts[1])
    // Auto-swap jika terbalik
    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) { const t = lat; lat = lon; lon = t }
    if (isNaN(lat) || isNaN(lon)) return null
    return { name, description: desc, lat, lon }
  }).filter(Boolean)
}

/** Reverse geocode lat/lon via Nominatim OSM (free, no key) */
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=id`,
      { headers: { 'User-Agent': 'MaintoryApp/1.0' } }
    )
    if (!res.ok) return {}
    const data = await res.json()
    const a = data.address || {}
    return {
      provinsi:  a.state || '',
      kabupaten: a.county || a.city || a.state_district || '',
      kecamatan: a.suburb || a.town || a.village || a.district || '',
      desa:      a.hamlet || a.neighbourhood || a.quarter || a.village || a.suburb || '',
    }
  } catch { return {} }
}

/** Buat KMZ dari baris data Excel */
async function buildKMZ(rows) {
  const getUserName = () => ''
  const byDesa = {}
  for (const r of rows) {
    const lat = Number(r['Latitude'] || 0)
    const lon = Number(r['Longitude'] || 0)
    if (!lat || !lon) continue
    const desa = r['Desa/Kelurahan'] || 'Tanpa Desa'
    if (!byDesa[desa]) byDesa[desa] = []
    byDesa[desa].push(r)
  }

  const makePlacemark = (r) => {
    let lat = Number(r['Latitude'])
    let lon = Number(r['Longitude'])
    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) { const t = lat; lat = lon; lon = t }
    return `
      <Placemark>
        <name>${r['ID Tiang'] || r['Desa/Kelurahan'] || 'Tiang'}</name>
        <description><![CDATA[
          <b>Site:</b> ${r['Site'] || ''}<br/>
          <b>Jenis:</b> ${r['Jenis Tiang'] || ''}<br/>
          <b>Kecamatan:</b> ${r['Kecamatan'] || ''}<br/>
          <b>Desa:</b> ${r['Desa/Kelurahan'] || ''}<br/>
          <b>Keterangan:</b> ${r['Keterangan'] || ''}
        ]]></description>
        <styleUrl>#tiang_icon</styleUrl>
        <Point><coordinates>${lon},${lat},0</coordinates></Point>
      </Placemark>`
  }

  const folders = Object.entries(byDesa)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([desa, tiangList]) => `
    <Folder>
      <name>Desa ${desa}</name>
      <open>0</open>
      ${tiangList.map(makePlacemark).join('')}
    </Folder>`).join('')

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Data Tiang - ${format(new Date(), 'dd MMM yyyy')}</name>
    <Style id="tiang_icon">
      <IconStyle><scale>1.2</scale><Icon><href>files/icon_tiang.png</href></Icon><hotSpot x="0.5" y="0" xunits="fraction" yunits="fraction"/></IconStyle>
      <LabelStyle><color>ffffffff</color><scale>0.8</scale></LabelStyle>
    </Style>
    ${folders}
  </Document>
</kml>`

  const zip = new JSZip()
  zip.file('doc.kml', kml)
  try {
    const iconResp = await fetch('/icon_tiang.png')
    const iconBlob = await iconResp.blob()
    zip.folder('files').file('icon_tiang.png', iconBlob)
  } catch {}

  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function KonversiTiang() {
  // Mode: 'kmz2excel' | 'excel2kmz'
  const [mode, setMode] = useState('kmz2excel')

  // KMZ → Excel state
  const [kmzFile, setKmzFile] = useState(null)
  const [kmzRows, setKmzRows] = useState([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, step: '' })
  const [geocoded, setGeocoded] = useState(false)

  // Excel → KMZ state
  const [excelFile, setExcelFile] = useState(null)
  const [excelRows, setExcelRows] = useState([])
  const [excelParsed, setExcelParsed] = useState(false)

  const kmzRef = useRef()
  const excelRef = useRef()

  // ── KMZ → EXCEL ──────────────────────────────────────────────────────────────
  const handleKmzUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setKmzFile(file)
    setKmzRows([])
    setGeocoded(false)
    setProgress({ done: 0, total: 0, step: 'Membaca file KMZ...' })
    setProcessing(true)
    try {
      const marks = await parseKMZ(file)
      const rows = marks.map(m => ({
        name: m.name, lat: m.lat, lon: m.lon,
        provinsi: '', kabupaten: '', kecamatan: '', desa: '',
        status: 'pending',
      }))
      setKmzRows(rows)
      setProgress({ done: 0, total: rows.length, step: `Ditemukan ${rows.length} titik. Siap geocode.` })
    } catch (err) {
      toast.error(err.message || 'Gagal membaca KMZ')
    } finally { setProcessing(false) }
    e.target.value = ''
  }

  const handleGeocode = async () => {
    if (!kmzRows.length) return
    setProcessing(true)
    setGeocoded(false)
    const results = [...kmzRows]
    for (let i = 0; i < results.length; i++) {
      setProgress({ done: i, total: results.length, step: `Geocoding titik ${i + 1} / ${results.length}...` })
      const geo = await reverseGeocode(results[i].lat, results[i].lon)
      results[i] = { ...results[i], ...geo, status: 'done' }
      setKmzRows([...results])
      await delay(300) // Hormati rate limit Nominatim (max 1 req/s)
    }
    setProgress({ done: results.length, total: results.length, step: 'Geocoding selesai!' })
    setGeocoded(true)
    setProcessing(false)
    toast.success(`${results.length} titik berhasil di-geocode!`)
  }

  const handleExportExcel = () => {
    const data = kmzRows.map((r, i) => ({
      'No': i + 1,
      'Site': 'banyumas',
      'Jenis Tiang': 'tiang_7m',
      'ID Tiang': '',              // Kosong dulu, akan terisi otomatis saat import ke Data Tiang
      'Provinsi': r.provinsi || '',
      'Kabupaten/Kota': r.kabupaten || '',
      'Kecamatan': r.kecamatan || '',
      'Desa/Kelurahan': r.desa || '',
      'Maps URL': r.lat && r.lon ? `https://maps.google.com/?q=${r.lat},${r.lon}` : '',
      'Longitude': r.lon || '',
      'Latitude': r.lat || '',
      'Keterangan': r.name || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data Tiang')
    XLSX.writeFile(wb, `Data_Tiang_from_KMZ_${format(new Date(), 'yyyyMMdd')}.xlsx`)
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
        toast.success(`${rows.length} baris data siap dikonversi.`)
      } catch { toast.error('Gagal membaca Excel') }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const handleExportKMZ = async () => {
    if (!excelRows.length) return
    setProcessing(true)
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
    } finally { setProcessing(false) }
  }

  // ── RENDER ────────────────────────────────────────────────────────────────────
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

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
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', padding: '4px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', width: 'fit-content' }}>
        {[
          { key: 'kmz2excel', label: 'KMZ → Excel', icon: <FileSpreadsheet size={16} /> },
          { key: 'excel2kmz', label: 'Excel → KMZ', icon: <Map size={16} /> },
        ].map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '9px 20px', borderRadius: 'var(--radius-md)',
              border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
              background: mode === m.key ? 'var(--accent)' : 'transparent',
              color: mode === m.key ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.2s',
            }}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          MODE: KMZ → EXCEL
      ═══════════════════════════════════════════════════════════ */}
      {mode === 'kmz2excel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Info box */}
          <div style={{ display: 'flex', gap: '10px', padding: '14px 16px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 'var(--radius-md)' }}>
            <Info size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              Upload file <strong>.kmz</strong> dari Google Earth. Sistem akan membaca setiap titik koordinat, 
              lalu secara otomatis mengisi kolom <strong>Provinsi, Kabupaten, Kecamatan, dan Desa</strong> 
              menggunakan reverse geocoding (OpenStreetMap). Kolom <strong>ID Tiang dikosongkan</strong> — 
              akan terisi otomatis saat diimport ke halaman Data Tiang.
            </div>
          </div>

          {/* Upload area */}
          <div
            onClick={() => kmzRef.current?.click()}
            style={{
              border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)',
              padding: '40px', textAlign: 'center', cursor: 'pointer',
              background: 'var(--bg-secondary)', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(59,130,246,0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-secondary)' }}
          >
            <input ref={kmzRef} type="file" accept=".kmz" style={{ display: 'none' }} onChange={handleKmzUpload} />
            <Upload size={36} style={{ color: 'var(--accent)', marginBottom: '10px' }} />
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
              {kmzFile ? kmzFile.name : 'Klik untuk upload file KMZ'}
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              Format: .kmz dari Google Earth
            </p>
          </div>

          {/* Progress bar */}
          {(processing || geocoded || kmzRows.length > 0) && (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{progress.step}</span>
                {progress.total > 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{progress.done}/{progress.total}</span>}
              </div>
              {progress.total > 0 && (
                <div style={{ background: 'var(--border)', borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: '999px', transition: 'width 0.3s' }} />
                </div>
              )}
            </div>
          )}

          {/* Summary table preview */}
          {kmzRows.length > 0 && (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>
                  Preview — {kmzRows.length} Titik Ditemukan
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!geocoded && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleGeocode}
                      disabled={processing}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {processing ? <Loader size={14} className="animate-spin" /> : <Map size={14} />}
                      {processing ? 'Geocoding...' : 'Mulai Geocode Koordinat'}
                    </button>
                  )}
                  {geocoded && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleExportExcel}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--success)' }}
                    >
                      <FileSpreadsheet size={14} /> Download Excel
                    </button>
                  )}
                </div>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '380px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                      {['No', 'Nama (dari KMZ)', 'Lat', 'Lon', 'Provinsi', 'Kabupaten', 'Kecamatan', 'Desa', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {kmzRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{i + 1}</td>
                        <td style={{ padding: '8px 12px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || '-'}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px' }}>{r.lat.toFixed(6)}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px' }}>{r.lon.toFixed(6)}</td>
                        <td style={{ padding: '8px 12px' }}>{r.provinsi || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td style={{ padding: '8px 12px' }}>{r.kabupaten || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td style={{ padding: '8px 12px' }}>{r.kecamatan || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td style={{ padding: '8px 12px' }}>{r.desa || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {r.status === 'done'
                            ? <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                            : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Pending</span>}
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

      {/* ═══════════════════════════════════════════════════════════
          MODE: EXCEL → KMZ
      ═══════════════════════════════════════════════════════════ */}
      {mode === 'excel2kmz' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div style={{ display: 'flex', gap: '10px', padding: '14px 16px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 'var(--radius-md)' }}>
            <Info size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              Upload file <strong>.xlsx</strong> dengan format kolom yang sama dengan template Data Tiang 
              (kolom <strong>Longitude</strong>, <strong>Latitude</strong>, <strong>ID Tiang</strong>, <strong>Desa/Kelurahan</strong>, dll). 
              Data akan dikonversi ke file KMZ dengan <strong>folder per desa</strong> seperti export dari halaman Data Tiang.
            </div>
          </div>

          {/* Upload area */}
          <div
            onClick={() => excelRef.current?.click()}
            style={{
              border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)',
              padding: '40px', textAlign: 'center', cursor: 'pointer',
              background: 'var(--bg-secondary)', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(59,130,246,0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-secondary)' }}
          >
            <input ref={excelRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelUpload} />
            <Upload size={36} style={{ color: 'var(--success)', marginBottom: '10px' }} />
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
              {excelFile ? excelFile.name : 'Klik untuk upload file Excel (.xlsx)'}
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              Format kolom: Site, Jenis Tiang, ID Tiang, Longitude, Latitude, Desa/Kelurahan, dst
            </p>
          </div>

          {/* Preview dan tombol export */}
          {excelParsed && excelRows.length > 0 && (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>Preview — {excelRows.length} Baris</span>
                  <span style={{ marginLeft: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {[...new Set(excelRows.map(r => r['Desa/Kelurahan']).filter(Boolean))].length} desa
                  </span>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleExportKMZ}
                  disabled={processing}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {processing ? <Loader size={14} /> : <Map size={14} />}
                  {processing ? 'Membuat KMZ...' : 'Download KMZ'}
                </button>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '380px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                      {['No', 'ID Tiang', 'Site', 'Jenis', 'Kecamatan', 'Desa/Kelurahan', 'Lat', 'Lon'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelRows.slice(0, 50).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{i + 1}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--accent)' }}>{r['ID Tiang'] || '(kosong)'}</td>
                        <td style={{ padding: '8px 12px' }}>{r['Site'] || '-'}</td>
                        <td style={{ padding: '8px 12px' }}>{r['Jenis Tiang'] || '-'}</td>
                        <td style={{ padding: '8px 12px' }}>{r['Kecamatan'] || '-'}</td>
                        <td style={{ padding: '8px 12px' }}>{r['Desa/Kelurahan'] || '-'}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px' }}>{r['Latitude'] || '-'}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px' }}>{r['Longitude'] || '-'}</td>
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
    </div>
  )
}

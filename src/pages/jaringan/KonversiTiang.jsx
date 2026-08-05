import { useState, useRef, useCallback } from 'react'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  FileSpreadsheet, Map, Upload, RefreshCw,
  CheckCircle, Loader, Info, Pause, Play, Square, AlertCircle
} from 'lucide-react'

// ── HELPERS ────────────────────────────────────────────────────────────────────
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
    // Auto-swap jika koordinat terbalik
    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) { const t = lat; lat = lon; lon = t }
    if (isNaN(lat) || isNaN(lon)) return null
    return { name, lat, lon }
  }).filter(Boolean)
}

/**
 * Reverse geocode menggunakan BigDataCloud API (cepat, gratis, tanpa key)
 * fallback ke Nominatim jika gagal.
 */
async function reverseGeocode(lat, lon) {
  // === PRIMARY: BigDataCloud (cepat, tanpa API key) ===
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (res.ok) {
      const d = await res.json()
      const admin = d.localityInfo?.administrative || []
      // Admin level Indonesia di OpenStreetMap:
      // 4 = Provinsi, 5 = Kabupaten/Kota, 6 = Kecamatan, 7/8 = Desa/Kelurahan
      const byLevel = (lvl) => admin.find(a => a.adminLevel === lvl)?.name || ''
      const provinsi  = byLevel(4) || d.principalSubdivision || ''
      const kabupaten = byLevel(5) || d.city || ''
      const kecamatan = byLevel(6) || ''
      const desa      = byLevel(7) || byLevel(8) || d.locality || ''
      if (provinsi || kabupaten || kecamatan) return { provinsi, kabupaten, kecamatan, desa }
    }
  } catch { /* lanjut ke fallback */ }

  // === FALLBACK: Nominatim OSM ===
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=id&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': 'MaintoryApp/1.0' }, signal: AbortSignal.timeout(6000) }
    )
    if (res.ok) {
      const d = await res.json()
      const a = d.address || {}
      return {
        provinsi:  a.state || '',
        // Di Indonesia Nominatim sering pakai "county" untuk kabupaten
        kabupaten: a.county || a.city || a.municipality || '',
        kecamatan: a.district || a.city_district || a.borough || '',
        desa:      a.village || a.hamlet || a.neighbourhood || a.quarter || a.suburb || '',
      }
    }
  } catch { /* */ }

  return { provinsi: '', kabupaten: '', kecamatan: '', desa: '' }
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

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function KonversiTiang() {
  const [mode, setMode] = useState('kmz2excel')

  // KMZ → Excel state
  const [kmzFile, setKmzFile] = useState(null)
  const [kmzRows, setKmzRows] = useState([])
  const [geocoding, setGeocoding] = useState(false)   // sedang berjalan
  const [paused, setPaused] = useState(false)
  const [geocoded, setGeocoded] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [failCount, setFailCount] = useState(0)

  // Excel → KMZ state
  const [excelFile, setExcelFile] = useState(null)
  const [excelRows, setExcelRows] = useState([])
  const [excelParsed, setExcelParsed] = useState(false)
  const [exporting, setExporting] = useState(false)

  const kmzRef = useRef()
  const excelRef = useRef()
  const pauseRef = useRef(false)   // true saat pause
  const stopRef  = useRef(false)   // true saat stop

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

    // Baca snapshot rows terbaru
    const results = kmzRows.map(r => ({ ...r }))
    let fails = 0

    // Proses secara paralel dalam batch (5 sekaligus)
    const BATCH = 5
    const DELAY = 250  // ms antara batch — BigDataCloud lebih longgar rate limit-nya

    for (let i = 0; i < results.length; i += BATCH) {
      // Cek stop
      if (stopRef.current) break

      // Cek pause — tunggu sampai di-resume
      while (pauseRef.current && !stopRef.current) await delay(200)
      if (stopRef.current) break

      const batch = results.slice(i, i + BATCH)
      const geoResults = await Promise.all(batch.map(r => reverseGeocode(r.lat, r.lon)))

      geoResults.forEach((geo, bi) => {
        const idx = i + bi
        results[idx] = { ...results[idx], ...geo, status: 'done' }
        if (!geo.provinsi && !geo.kabupaten) fails++
      })

      setKmzRows([...results])
      setProgress({ done: Math.min(i + BATCH, results.length), total: results.length })
      setFailCount(fails)

      if (i + BATCH < results.length) await delay(DELAY)
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
    // Auto-width
    const cols = Object.keys(data[0] || {}).map(k => ({ wch: Math.max(k.length + 2, 12) }))
    ws['!cols'] = cols
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data Tiang')
    XLSX.writeFile(wb, `Data_Tiang_from_KMZ_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`)
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
  const doneCount = kmzRows.filter(r => r.status === 'done').length
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
          { key: 'excel2kmz', label: 'Excel → KMZ', icon: <Map size={15} /> },
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
              Proses berjalan <strong>5 titik sekaligus</strong> untuk kecepatan optimal.
              Kolom <strong>ID Tiang dikosongkan</strong> — akan terisi otomatis saat diimport ke Data Tiang.
            </div>
          </div>

          {/* Upload zone */}
          <div onClick={() => !geocoding && kmzRef.current?.click()} style={{
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
              {/* Status bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>
                    {geocoding ? (paused ? '⏸ Dijeda...' : `⚡ Geocoding (${BATCH_SIZE_LABEL} paralel)...`) : geocoded ? '✅ Selesai' : '🕒 Siap diproses'}
                  </span>
                  <span style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {progress.done}/{progress.total} titik
                    {emptyCount > 0 && <span style={{ color: 'var(--warning)', marginLeft: '8px' }}>⚠ {emptyCount} lokasi tidak ditemukan</span>}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!geocoding && !geocoded && (
                    <button className="btn btn-primary btn-sm" onClick={handleGeocode} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Map size={14} /> Mulai Geocode
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
                    const secs = batches * 0.25
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

          <div onClick={() => excelRef.current?.click()} style={{
            border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)',
            padding: '36px', textAlign: 'center', cursor: 'pointer',
            background: 'var(--bg-secondary)', transition: 'all 0.2s',
          }}
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
                  {exporting ? <Loader size={14} /> : <Map size={14} />}
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
    </div>
  )
}

const BATCH_SIZE_LABEL = '5'

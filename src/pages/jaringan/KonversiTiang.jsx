import { useState, useRef } from 'react'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
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
const cleanName = (s) => (s || '').replace(/^(Kecamatan|Kelurahan|Desa|Kabupaten|Kota|Kab\.)\s+/i, '').trim()

/** Check if point is inside bbox [minX, minY, maxX, maxY] */
function pointInBbox(lon, lat, bbox) {
  if (!bbox) return false;
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

/** Ray-casting algorithm for point in polygon ring */
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Handle Polygon and MultiPolygon */
function pointInPolygonGeom(lon, lat, geometry) {
  if (!geometry) return false;
  const type = geometry.type;
  if (type === 'Polygon') {
    if (!pointInRing(lon, lat, geometry.coordinates[0])) return false;
    for (let i = 1; i < geometry.coordinates.length; i++) {
      if (pointInRing(lon, lat, geometry.coordinates[i])) return false; // in hole
    }
    return true;
  } else if (type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      if (!pointInRing(lon, lat, poly[0])) continue;
      let inHole = false;
      for (let i = 1; i < poly.length; i++) {
        if (pointInRing(lon, lat, poly[i])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  }
  return false;
}

/** Find which feature contains the point */
function findContainingFeature(geojson, lon, lat) {
  if (!geojson || !geojson.features) return null;
  for (let i = 0; i < geojson.features.length; i++) {
    const f = geojson.features[i];
    if (f.bbox && !pointInBbox(lon, lat, f.bbox)) continue;
    if (pointInPolygonGeom(lon, lat, f.geometry)) {
      return f;
    }
  }
  return null;
}

// Global spatial cache (Grid ~11m = 4 desimal) agar titik yg sama tidak di-fetch ulang
const spatialCache = new Map()

/** Gabungkan sumber geocode — Point-in-Polygon (Akurat 100% dari BPS) */
async function reverseGeocode(lat, lon) {
  // 1. Spatial Cache ~11m precision
  const latR = Math.round(parseFloat(lat) * 10000) / 10000
  const lonR = Math.round(parseFloat(lon) * 10000) / 10000
  const cacheKey = `${latR}_${lonR}`
  if (spatialCache.has(cacheKey)) return spatialCache.get(cacheKey)

  let provinsi = '-', kabupaten = '-', kecamatan = '-', desa = '-'
  let confident = false

  try {
    // Dynamic import geojson (cached oleh browser & PWA)
    const geojsonData = (await import('../../assets/desa_jateng_pip.json')).default;
    
    // Cari fitur polygon yang memuat lat/lon ini
    const feature = findContainingFeature(geojsonData, parseFloat(lon), parseFloat(lat))
    
    if (feature) {
      provinsi = feature.properties.prov || '-'
      kabupaten = feature.properties.kab || '-'
      kecamatan = feature.properties.kec || '-'
      desa = feature.properties.desa || '-'
      confident = true // Sangat yakin karena bersumber dari Polygon BPS
    }
  } catch (err) {
    console.error("Gagal Point-in-Polygon:", err)
  }

  // Kapitalisasi standar (Title Case)
  const toTitleCase = (str) => str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
  )

  const result = { 
    provinsi: toTitleCase(provinsi), 
    kabupaten: toTitleCase(kabupaten), 
    kecamatan: toTitleCase(kecamatan), 
    desa: toTitleCase(desa), 
    confident,
    kecBDC: '', 
    kecNom: 'BPS GeoJSON'
  }
  spatialCache.set(cacheKey, result)
  return result
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

// ── INPUT PARSER (URL / DECIMAL / DMS) ─────────────────────────────────────────
function dmsToDecimal(degrees, minutes, seconds, direction) {
  let dd = Number(degrees) + Number(minutes) / 60 + Number(seconds) / 3600
  if (direction === 'S' || direction === 'W') dd = dd * -1
  return dd
}

function parseInputToCoords(input) {
  if (!input) return null
  const str = input.trim()
  
  // 1. Format: @lat,lon (URL)
  const m1 = str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m1) return { lat: parseFloat(m1[1]), lon: parseFloat(m1[2]) }
  
  // 2. Format: ?q=lat,lon (URL)
  const m2 = str.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m2) return { lat: parseFloat(m2[1]), lon: parseFloat(m2[2]) }
  
  // 3. Format: /maps/place/.../lat,lon
  const m3 = str.match(/(-?\d+\.\d{5,}),(-?\d+\.\d{5,})/)
  if (m3 && str.includes('maps')) return { lat: parseFloat(m3[1]), lon: parseFloat(m3[2]) }
  
  // 4. Format: DMS (7°37'27.0"S 109°15'17.1"E atau 7 37 27 S 109 15 17 E)
  const dmsMatch = str.match(/(\d+)[°\s]+(\d+)['\s]+(\d+(?:\.\d+)?)["\s]*([NS])[,;\s]*(\d+)[°\s]+(\d+)['\s]+(\d+(?:\.\d+)?)["\s]*([EW])/i)
  if (dmsMatch) {
    const lat = dmsToDecimal(dmsMatch[1], dmsMatch[2], dmsMatch[3], dmsMatch[4].toUpperCase())
    const lon = dmsToDecimal(dmsMatch[5], dmsMatch[6], dmsMatch[7], dmsMatch[8].toUpperCase())
    return { lat, lon }
  }

  // 5. Format: Decimal murni (-7.624160, 109.254736)
  const decMatch = str.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/)
  if (decMatch) return { lat: parseFloat(decMatch[1]), lon: parseFloat(decMatch[2]) }

  return null
}

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function KonversiTiang() {
  const [mode, setMode] = useState('exportFO')
  const [exportFOLoading, setExportFOLoading] = useState(false)

  // KMZ → Excel state
  const [kmzFile, setKmzFile] = useState(null)
  const [kmzRows, setKmzRows] = useState([])
  const [geocoding, setGeocoding] = useState(false)
  const [paused, setPaused] = useState(false)
  const [geocoded, setGeocoded] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, status: 'idle' })
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
    setProgress({ current: 0, total: 0, status: 'idle' })
    setFailCount(0)
    try {
      const marks = await parseKMZ(file)
      const rows = marks.map(m => ({ ...m, provinsi: '', kabupaten: '', kecamatan: '', desa: '', status: 'pending' }))
      setKmzRows(rows)
      setProgress({ current: 0, total: rows.length, status: 'idle' })
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
      setProgress({ current: Math.min(i + BATCH, results.length), total: results.length, status: 'running' })
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
    XLSX.writeFile(wb, `Data Tiang dari KMZ ${format(new Date(), 'dd-MM-yyyy HH.mm')}.xlsx`)
    toast.success('File Excel berhasil didownload!')
  }

  // ── URL → EXCEL ───────────────────────────────────────────────────────────────
  const handleProcessUrls = async () => {
    const lines = urlInput.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) return toast.error('Tidak ada URL yang dimasukkan!')

    // Parse all URLs first
    const parsed = lines.map((url, i) => {
      const coords = parseInputToCoords(url)
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
    setUrlRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: value, confident: true } : r))
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
      'Jalan/Gang/Dusun': '',
      'Maps URL': r.url,
      'Latitude ( Decimal )': r.lat ?? '',
      'Longitude ( Decimal )': r.lon ?? '',
      'Latitude ( dms )': '',
      'Longitude ( dms )': '',
      'Keterangan': r.keterangan || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [15, 12, 16, 18, 22, 22, 22, 40, 18, 18, 16, 16, 30].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template Import')
    XLSX.writeFile(wb, `Template Import dari URL ${format(new Date(), 'dd-MM-yyyy HH.mm')}.xlsx`)
    toast.success('File Excel berhasil didownload!')
  }

  // ── EXPORT FO PUSAT ──────────────────────────────────────────────────────────
  const handleExportFO = async () => {
    setExportFOLoading(true)
    try {
      toast.loading('Mengambil data tiang...', { id: 'exportFO' })
      let allPoles = []
      let from = 0
      const step = 1000
      while (true) {
        const { data, error } = await supabase
          .from('network_poles')
          .select('*')
          .neq('status', 'dismantled')
          .range(from, from + step - 1)
        if (error) throw error
        if (data && data.length > 0) {
          allPoles = [...allPoles, ...data]
          if (data.length < step) break
          from += step
        } else { break }
      }

      const activePoles = allPoles.filter(p => !p.status || p.status === 'active')

      // Sort by Desa then ID
      activePoles.sort((a, b) => {
        const dA = (a.desa || '').localeCompare(b.desa || '')
        if (dA !== 0) return dA
        return (a.pole_id || '').localeCompare(b.pole_id || '')
      })

      toast.loading('Mengambil data ODP & ODC...', { id: 'exportFO' })
      let allOdpOdc = []
      let fromOdp = 0
      while (true) {
        const { data, error } = await supabase
          .from('network_odp_odc')
          .select('*')
          .range(fromOdp, fromOdp + step - 1)
        if (error) throw error
        if (data && data.length > 0) {
          allOdpOdc = [...allOdpOdc, ...data]
          if (data.length < step) break
          fromOdp += step
        } else { break }
      }

      // Sort ODP/ODC by Desa then ID
      allOdpOdc.sort((a, b) => {
        const dA = (a.desa || '').localeCompare(b.desa || '')
        if (dA !== 0) return dA
        return (a.device_id || '').localeCompare(b.device_id || '')
      })

      toast.loading('Memproses Excel...', { id: 'exportFO' })
      const ExcelJS = (await import('exceljs')).default
      const response = await fetch('/Template_FO.xlsx')
      if (!response.ok) throw new Error('File Template_FO.xlsx tidak ditemukan di public')
      const arrayBuffer = await response.arrayBuffer()
      
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(arrayBuffer)

      const ws = workbook.getWorksheet('DATA ASET TIANG')
      if (!ws) throw new Error('Sheet DATA ASET TIANG tidak ditemukan di template')

      // 1. Simpan style data row (baris 6) dan style TOTAL row (baris 11) SEBELUM diubah
      const dataStyle = {}
      const totalStyle = {}
      for (let c = 1; c <= 12; c++) {
        dataStyle[c] = JSON.parse(JSON.stringify(ws.getRow(6).getCell(c).style || {}))
        totalStyle[c] = JSON.parse(JSON.stringify(ws.getRow(11).getCell(c).style || {}))
      }
      const dataRowHeight = ws.getRow(6).height || 15
      const totalRowHeight = ws.getRow(11).height || 28

      // 2. Simpan SEMUA style + value baris 4 & 5 sebelum spliceRows (agar border tidak rusak)
      const headerStyles = { 4: {}, 5: {} }
      const headerValues = { 4: {}, 5: {} }
      const headerHeights = { 4: ws.getRow(4).height, 5: ws.getRow(5).height }
      ;[4, 5].forEach(r => {
        for (let c = 1; c <= 12; c++) {
          const cell = ws.getRow(r).getCell(c)
          headerStyles[r][c] = JSON.parse(JSON.stringify(cell.style || {}))
          headerValues[r][c] = cell.value
        }
      })

      // 3. Unmerge seluruh merge di baris >= 6 agar tidak tabrakan
      const existingMerges = [...(ws.model.merges || [])]
      existingMerges.forEach(mergeStr => {
        const match = mergeStr.match(/\D+(\d+):\D+(\d+)/)
        if (match && parseInt(match[2], 10) >= 6) {
          ws.unMergeCells(mergeStr)
        }
      })

      // 4. Hapus SEMUA baris mulai baris 6 ke bawah (termasuk TOTAL rows)
      if (ws.rowCount >= 6) {
        ws.spliceRows(6, ws.rowCount - 5)
      }

      // 5. Restore style + value baris 4 & 5 yang mungkin rusak akibat spliceRows
      ;[4, 5].forEach(r => {
        const row = ws.getRow(r)
        row.height = headerHeights[r]
        for (let c = 1; c <= 12; c++) {
          const cell = row.getCell(c)
          cell.style = headerStyles[r][c]
          // Jangan restore value untuk merged slave cells
          if (headerValues[r][c] !== null && headerValues[r][c] !== undefined) {
            cell.value = headerValues[r][c]
          }
        }
      })

      // 6. Koreksi: A4:A5 harus berisi "NO" (template asli nilainya null)
      ws.getCell('A4').value = 'NO'

      // 7. Koreksi G2:G3: unmerge dan hapus border agar kosong seperti kolom H2:H3
      ws.unMergeCells('G2:G3')
      ;['G2', 'G3'].forEach(addr => {
        ws.getCell(addr).value = null
        ws.getCell(addr).border = {}
        ws.getCell(addr).fill = { type: 'pattern', pattern: 'none' }
      })

      // 8. Tambah AutoFilter di baris 5 DATA ASET TIANG
      ws.autoFilter = 'A5:L5'


      // 5. Tulis data tiang satu per satu — TANPA insertRow sama sekali
      let rowIndex = 6
      let currentDesa = null
      let desaStartRow = 6
      let lastDataRow = 6

      const finalizeDesa = (endRow) => {
        if (endRow >= desaStartRow) {
          if (endRow > desaStartRow) {
            ws.mergeCells(`K${desaStartRow}:K${endRow}`)
            ws.mergeCells(`L${desaStartRow}:L${endRow}`)
          }
          const cellK = ws.getCell(`K${desaStartRow}`)
          const cellL = ws.getCell(`L${desaStartRow}`)
          cellK.value = { formula: `SUM(I${desaStartRow}:I${endRow})` }
          cellL.value = { formula: `SUM(J${desaStartRow}:J${endRow})` }
          ;[cellK, cellL].forEach(cell => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' }
            cell.fill = { type: 'pattern', pattern: 'none' }
          })
        }
      }

      activePoles.forEach((p, idx) => {
        const desa = p.desa || 'Tanpa Desa'
        if (desa !== currentDesa) {
          if (currentDesa !== null) finalizeDesa(rowIndex - 1)
          currentDesa = desa
          desaStartRow = rowIndex
        }

        const qtyT7 = p.pole_type === 'tiang_7m' ? 1 : ''
        const qtyT9 = p.pole_type === 'tiang_9m' ? 1 : ''
        const latDms = p.latitude ? decimalToDMS(p.latitude, true) : ''
        const lonDms = p.longitude ? decimalToDMS(p.longitude, false) : ''

        const row = ws.getRow(rowIndex)
        row.height = dataRowHeight

        // Terapkan style dari template data row
        for (let c = 1; c <= 12; c++) {
          const cell = row.getCell(c)
          cell.style = dataStyle[c] || {}
          if (!dataStyle[c]?.fill) {
            cell.fill = { type: 'pattern', pattern: 'none' }
          }
        }

        row.getCell(1).value = idx + 1
        row.getCell(2).value = p.pole_id || '-'
        row.getCell(3).value = desa
        row.getCell(4).value = p.site === 'cilacap' ? 'CILACAP' : p.site === 'cilacap_herman' ? 'CILACAP (HERMAN)' : 'BANYUMAS'
        row.getCell(5).value = p.latitude || ''
        row.getCell(6).value = p.longitude || ''
        row.getCell(7).value = latDms
        row.getCell(8).value = lonDms
        row.getCell(9).value = qtyT7
        row.getCell(10).value = qtyT9
        row.getCell(11).value = null
        row.getCell(12).value = null
        row.getCell(11).fill = { type: 'pattern', pattern: 'none' }
        row.getCell(12).fill = { type: 'pattern', pattern: 'none' }

        lastDataRow = rowIndex
        rowIndex++
      })

      // Finalize desa terakhir
      if (currentDesa !== null) finalizeDesa(lastDataRow)

      // 6. Tambahkan baris TOTAL di akhir data (2 baris, merge A:H)
      const tr1 = rowIndex
      const tr2 = rowIndex + 1
      ;[tr1, tr2].forEach(r => {
        const row = ws.getRow(r)
        row.height = totalRowHeight
        for (let c = 1; c <= 12; c++) {
          row.getCell(c).style = totalStyle[c]
        }
      })
      ws.mergeCells(`A${tr1}:H${tr2}`)
      ws.getCell(`A${tr1}`).value = 'TOTAL'
      ws.getCell(`A${tr1}`).alignment = { horizontal: 'center', vertical: 'middle' }

      ws.mergeCells(`I${tr1}:I${tr2}`)
      ws.getCell(`I${tr1}`).value = { formula: `SUM(I6:I${lastDataRow})` }
      ws.getCell(`I${tr1}`).alignment = { horizontal: 'center', vertical: 'middle' }

      ws.mergeCells(`J${tr1}:J${tr2}`)
      ws.getCell(`J${tr1}`).value = { formula: `SUM(J6:J${lastDataRow})` }
      ws.getCell(`J${tr1}`).alignment = { horizontal: 'center', vertical: 'middle' }

      ws.mergeCells(`K${tr1}:K${tr2}`)
      ws.getCell(`K${tr1}`).value = { formula: `SUM(K6:K${lastDataRow})` }
      ws.getCell(`K${tr1}`).alignment = { horizontal: 'center', vertical: 'middle' }

      ws.mergeCells(`L${tr1}:L${tr2}`)
      ws.getCell(`L${tr1}`).value = { formula: `SUM(L6:L${lastDataRow})` }
      ws.getCell(`L${tr1}`).alignment = { horizontal: 'center', vertical: 'middle' }

      if (!ws.pageSetup) ws.pageSetup = {}
      ws.pageSetup.printArea = `A1:L${tr2}`

      // 7. Bersihkan ISI (bukan struktur) sheet lain — mulai dari baris 6 agar header baris 4 & 5 tidak terhapus
      const wsKabel = workbook.getWorksheet('Data Jaringan Kabel Fiber Optik')
      if (wsKabel) {
        for (let i = 6; i <= wsKabel.rowCount; i++) {
          wsKabel.getRow(i).eachCell(c => { c.value = null })
        }
      }
      
      const wsSebaran = workbook.getWorksheet('Data Sebaran ODP DAN ODC')
      if (wsSebaran) {
        // 1. Simpan style baris 6 (data row)
        const dataStyleOdp = {}
        for (let c = 1; c <= 13; c++) {
          dataStyleOdp[c] = JSON.parse(JSON.stringify(wsSebaran.getRow(6).getCell(c).style || {}))
        }
        const dataRowHeightOdp = wsSebaran.getRow(6).height || 15
        
        // 1b. Simpan style baris TOTAL dari template (asumsi baris 414)
        const totalStyleOdp = {}
        for (let c = 1; c <= 13; c++) {
          totalStyleOdp[c] = JSON.parse(JSON.stringify(wsSebaran.getRow(414).getCell(c).style || {}))
        }
        const totalRowHeightOdp = wsSebaran.getRow(414).height || 15
        
        // 2. Simpan style & value baris 4 & 5 (header)
        const headerStylesOdp = { 4: {}, 5: {} }
        const headerValuesOdp = { 4: {}, 5: {} }
        const headerHeightsOdp = { 4: wsSebaran.getRow(4).height, 5: wsSebaran.getRow(5).height }
        ;[4, 5].forEach(r => {
          for (let c = 1; c <= 13; c++) {
            const cell = wsSebaran.getRow(r).getCell(c)
            headerStylesOdp[r][c] = JSON.parse(JSON.stringify(cell.style || {}))
            headerValuesOdp[r][c] = cell.value
          }
        })
        
        // 3. Unmerge baris >= 6
        const existingMergesOdp = [...(wsSebaran.model.merges || [])]
        existingMergesOdp.forEach(mergeStr => {
          const match = mergeStr.match(/\D+(\d+):\D+(\d+)/)
          if (match && parseInt(match[2], 10) >= 6) {
            wsSebaran.unMergeCells(mergeStr)
          }
        })
        
        // 4. Hapus baris >= 6
        if (wsSebaran.rowCount >= 6) {
          wsSebaran.spliceRows(6, wsSebaran.rowCount - 5)
        }
        
        // 5. Restore headers 4 & 5
        ;[4, 5].forEach(r => {
          const row = wsSebaran.getRow(r)
          row.height = headerHeightsOdp[r]
          for (let c = 1; c <= 13; c++) {
            const cell = row.getCell(c)
            cell.style = headerStylesOdp[r][c]
            if (headerValuesOdp[r][c] !== null && headerValuesOdp[r][c] !== undefined) {
              cell.value = headerValuesOdp[r][c]
            }
          }
        })
        
        // Koreksi typo dari template: K5 seharusnya 'ODP' bukan 'ODC'
        wsSebaran.getCell('K5').value = 'ODP'

        // 6. AutoFilter
        wsSebaran.autoFilter = `A5:M5`
        
        // 7. Tulis data
        let rowIndexOdp = 6
        let lastDataRowOdp = 6
        
        // ── Kelompokkan per ODC → ODP ──────────────────────────────────────
        const odcList = allOdpOdc.filter(p => p.type === 'ODC')
        const odpList = allOdpOdc.filter(p => p.type === 'ODP')

        // Buat map: device_id ODC → objek ODC
        const odcById = new Map(odcList.map(o => [o.device_id, o]))

        // Buat grup: { odc (bisa null jika ODC tidak ada di data), odps[], desa }
        const groups = []
        const matchedOdpSet = new Set()

        // Grup berdasarkan ODC yang ada di data
        odcList.forEach(odc => {
          const odcId = String(odc.device_id || '').trim()
          const odps = odpList.filter(o => String(o.parent_odc || '').trim() === odcId)
          odps.forEach(o => matchedOdpSet.add(o.id))
          groups.push({ odc, odps, desa: odc.desa || 'Tanpa Desa' })
        })

        // ODPs yang tidak punya ODC cocok → kelompokkan berdasarkan induk_odc string
        const orphanOdps = odpList.filter(o => !matchedOdpSet.has(o.id))
        const orphanByInduk = new Map()
        
        const extractInduk = (id) => {
          if (!id) return ''
          const match = id.match(/(.*\/ODC\/\d+)\/ODP/)
          return match ? match[1] : ''
        }

        orphanOdps.forEach(o => {
          const inferredInduk = o.parent_odc || extractInduk(o.device_id)
          const key = inferredInduk || `__solo_${o.id}`
          if (!orphanByInduk.has(key)) {
            orphanByInduk.set(key, { odc: null, indukId: inferredInduk, odps: [], desa: o.desa || 'Tanpa Desa' })
          }
          orphanByInduk.get(key).odps.push(o)
        })
        orphanByInduk.forEach(g => groups.push(g))

        // Sort grup: desa dulu, lalu ID ODC
        groups.sort((a, b) => {
          const dA = (a.desa || '').localeCompare(b.desa || '')
          if (dA !== 0) return dA
          const idA = a.odc ? (a.odc.device_id || '') : (a.indukId || '')
          const idB = b.odc ? (b.odc.device_id || '') : (b.indukId || '')
          return idA.localeCompare(idB)
        })

        const getSiteLabel = (site) =>
          site === 'cilacap' ? 'CILACAP' : site === 'cilacap_herman' ? 'CILACAP (HERMAN)' : 'BANYUMAS'

        const thinBorder = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }

        const writeRow = (p, nourut, overrideJenis) => {
          const lat = p.latitude ? Number(p.latitude) : ''
          const lon = p.longitude ? Number(p.longitude) : ''
          const isOdc = p.type === 'ODC'
          const row = wsSebaran.getRow(rowIndexOdp)
          row.height = dataRowHeightOdp
          for (let c = 1; c <= 13; c++) {
            const cell = row.getCell(c)
            cell.style = dataStyleOdp[c] || {}
            cell.border = thinBorder
            if (!dataStyleOdp[c]?.fill) {
              cell.fill = { type: 'pattern', pattern: 'none' }
            }
          }
          row.getCell(1).value = nourut
          row.getCell(2).value = overrideJenis !== undefined ? overrideJenis : (p.device_id || '')
          row.getCell(3).value = p.desa || 'Tanpa Desa'
          row.getCell(4).value = getSiteLabel(p.site)
          row.getCell(5).value = 'WIFIAN'
          row.getCell(6).value = lon
          row.getCell(7).value = lat
          row.getCell(8).value = isOdc ? 1 : null
          row.getCell(9).value = isOdc ? null : 1
          row.getCell(10).value = null
          row.getCell(11).value = null
          row.getCell(12).value = null
          row.getCell(13).value = null
          row.getCell(10).fill = { type: 'pattern', pattern: 'none' }
          row.getCell(11).fill = { type: 'pattern', pattern: 'none' }
          lastDataRowOdp = rowIndexOdp
          rowIndexOdp++
        }

        let noUrut = 1
        groups.forEach(g => {
          const groupStartRow = rowIndexOdp

          // Tulis baris ODC
          if (g.odc) {
            // ODC record ada di database
            writeRow(g.odc, noUrut++, g.odc.device_id || 'ODC')
          } else if (g.indukId && g.odps.length > 0) {
            // ODC tidak ada di DB → buat baris sintetis dari induk_odc ODP
            const ref = g.odps[0]
            const lat = ref.latitude ? Number(ref.latitude) : ''
            const lon = ref.longitude ? Number(ref.longitude) : ''
            const rowOdc = wsSebaran.getRow(rowIndexOdp)
            rowOdc.height = dataRowHeightOdp
            for (let c = 1; c <= 13; c++) {
              const cell = rowOdc.getCell(c)
              cell.style = dataStyleOdp[c] || {}
              cell.border = thinBorder
              if (!dataStyleOdp[c]?.fill) {
                cell.fill = { type: 'pattern', pattern: 'none' }
              }
            }
            rowOdc.getCell(1).value = noUrut++
            rowOdc.getCell(2).value = g.indukId          // ID ODC dari field induk_odc
            rowOdc.getCell(3).value = ref.desa || 'Tanpa Desa'
            rowOdc.getCell(4).value = getSiteLabel(ref.site)
            rowOdc.getCell(5).value = 'WIFIAN'
            rowOdc.getCell(6).value = lon
            rowOdc.getCell(7).value = lat
            rowOdc.getCell(8).value = 1                  // ODC qty = 1
            rowOdc.getCell(9).value = null
            rowOdc.getCell(10).value = null
            rowOdc.getCell(11).value = null
            rowOdc.getCell(12).value = null
            rowOdc.getCell(13).value = null
            rowOdc.getCell(10).fill = { type: 'pattern', pattern: 'none' }
            rowOdc.getCell(11).fill = { type: 'pattern', pattern: 'none' }
            lastDataRowOdp = rowIndexOdp
            rowIndexOdp++
          }

          // Tulis baris setiap ODP dalam grup
          g.odps.forEach(odp => {
            writeRow(odp, noUrut++, odp.device_id || 'ODP')
          })

          const groupEndRow = rowIndexOdp - 1
          
          // Merge J & K per grup ODC
          if (groupEndRow >= groupStartRow) {
            if (groupEndRow > groupStartRow) {
              wsSebaran.mergeCells(`J${groupStartRow}:J${groupEndRow}`)
              wsSebaran.mergeCells(`K${groupStartRow}:K${groupEndRow}`)
            }
            const cellJ = wsSebaran.getCell(`J${groupStartRow}`)
            const cellK = wsSebaran.getCell(`K${groupStartRow}`)
            cellJ.value = { formula: `SUM(H${groupStartRow}:H${groupEndRow})` }
            cellK.value = { formula: `SUM(I${groupStartRow}:I${groupEndRow})` }
            ;[cellJ, cellK].forEach(cell => {
              cell.alignment = { vertical: 'middle', horizontal: 'center' }
              cell.fill = { type: 'pattern', pattern: 'none' }
            })
          }

          // Baris kosong sebagai pemisah antar grup ODC
          const emptyRow = wsSebaran.getRow(rowIndexOdp)
          emptyRow.height = dataRowHeightOdp
          for (let c = 1; c <= 13; c++) {
            const cell = emptyRow.getCell(c)
            cell.style = dataStyleOdp[c] || {}
            cell.border = thinBorder
            cell.value = null
            if (!dataStyleOdp[c]?.fill) {
              cell.fill = { type: 'pattern', pattern: 'none' }
            }
          }
          rowIndexOdp++
        })

        // 8. Tambahkan baris TOTAL di akhir data ODP/ODC
        const tr1 = rowIndexOdp
        const tr2 = rowIndexOdp + 1
        ;[tr1, tr2].forEach(r => {
          const row = wsSebaran.getRow(r)
          row.height = totalRowHeightOdp
          for (let c = 1; c <= 13; c++) {
            row.getCell(c).style = totalStyleOdp[c] || {}
          }
        })
        wsSebaran.mergeCells(`A${tr1}:G${tr2}`)
        wsSebaran.getCell(`A${tr1}`).value = 'TOTAL'
        wsSebaran.getCell(`A${tr1}`).alignment = { horizontal: 'center', vertical: 'middle' }
        wsSebaran.getCell(`A${tr1}`).font = { bold: true, italic: true, size: 11 }

        wsSebaran.mergeCells(`H${tr1}:H${tr2}`)
        wsSebaran.getCell(`H${tr1}`).value = { formula: `SUM(H6:H${lastDataRowOdp})` }
        wsSebaran.getCell(`H${tr1}`).alignment = { horizontal: 'center', vertical: 'middle' }

        wsSebaran.mergeCells(`I${tr1}:I${tr2}`)
        wsSebaran.getCell(`I${tr1}`).value = { formula: `SUM(I6:I${lastDataRowOdp})` }
        wsSebaran.getCell(`I${tr1}`).alignment = { horizontal: 'center', vertical: 'middle' }

        wsSebaran.mergeCells(`J${tr1}:J${tr2}`)
        wsSebaran.getCell(`J${tr1}`).value = { formula: `SUM(J6:J${lastDataRowOdp})` }
        wsSebaran.getCell(`J${tr1}`).alignment = { horizontal: 'center', vertical: 'middle' }

        wsSebaran.mergeCells(`K${tr1}:K${tr2}`)
        wsSebaran.getCell(`K${tr1}`).value = { formula: `SUM(K6:K${lastDataRowOdp})` }
        wsSebaran.getCell(`K${tr1}`).alignment = { horizontal: 'center', vertical: 'middle' }

        wsSebaran.mergeCells(`L${tr1}:M${tr2}`) // Kolom sisanya dikosongkan/merge jika perlu

        if (!wsSebaran.pageSetup) wsSebaran.pageSetup = {}
        wsSebaran.pageSetup.printArea = `A1:M${tr2}`
      }

      toast.loading('Menyimpan file...', { id: 'exportFO' })
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `DATA JARINGAN FIBER OPTIK BANYUMAS ${format(new Date(), 'dd-MM-yyyy')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Berhasil export ke format pusat!', { id: 'exportFO' })
    } catch (err) {
      toast.error('Gagal export data: ' + (err instanceof Error ? err.message : String(err)), { id: 'exportFO' })
    } finally {
      setExportFOLoading(false)
    }
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
      a.download = `Data Tiang ${format(new Date(), 'dd-MM-yyyy')}.kmz`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('File KMZ berhasil didownload!')
    } catch (err) {
      toast.error(err.message || 'Gagal membuat KMZ')
    } finally { setExporting(false) }
  }

  // ── RENDER ────────────────────────────────────────────────────────────────────
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
  const doneCount  = kmzRows.filter(r => r.status === 'done').length
  const emptyCount = kmzRows.filter(r => r.status === 'done' && !r.provinsi && !r.kabupaten).length

  return (
    <div className="page-container">
      {/* HEADER */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 700 }}>
          <RefreshCw size={22} style={{ color: 'var(--accent)' }} />
          Konversi Data Jaringan FO
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Export dan konversi data jaringan Fiber Optik
        </p>
      </div>

      {/* ═══════════ EXPORT FO PUSAT ═══════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '10px', padding: '14px 16px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 'var(--radius-md)' }}>
            <Info size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
              Ambil seluruh data tiang aktif dari database dan masukkan otomatis ke dalam format file Excel <strong>DATA JARINGAN FIBER OPTIK</strong> untuk dikirim ke pusat.
              Kolom Total T7 dan T9 akan dihitung otomatis per desa.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', padding: '40px', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-secondary)' }}>
            <div style={{ textAlign: 'center' }}>
              <Download size={48} style={{ color: 'var(--accent)', opacity: 0.2, marginBottom: '16px' }} />
              <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>Export ke Format Pusat</h3>
              <p style={{ margin: '0 0 24px', fontSize: '13px', color: 'var(--text-secondary)' }}>Download seluruh data tiang dalam format standarisasi Excel.</p>
              
              <button
                className="btn btn-primary"
                onClick={handleExportFO}
                disabled={exportFOLoading}
                style={{ padding: '12px 24px', fontSize: '15px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                {exportFOLoading ? <Loader size={18} className="spin" /> : <Download size={18} />}
                {exportFOLoading ? 'Memproses Data...' : 'Export Sekarang'}
              </button>
            </div>
          </div>
        </div>
    </div>
  )
}

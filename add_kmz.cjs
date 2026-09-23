const fs = require('fs');

let code = fs.readFileSync('src/pages/jaringan/DataJalurFo.jsx', 'utf8');

// ── 1. Add JSZip import ──────────────────────────────────────────────────────
code = code.replace(
  `import * as XLSX from 'xlsx'`,
  `import * as XLSX from 'xlsx'\nimport JSZip from 'jszip'`
);

// ── 2. Add Map icon to lucide imports ────────────────────────────────────────
code = code.replace(
  `import { Plus, X, Edit2, Trash2, MapPin, Search, Download, ChevronDown, ChevronUp, ExternalLink, Upload, FileSpreadsheet, CheckSquare, Square, Eraser, Cable } from 'lucide-react'`,
  `import { Plus, X, Edit2, Trash2, MapPin, Search, Download, ChevronDown, ChevronUp, ExternalLink, Upload, FileSpreadsheet, CheckSquare, Square, Eraser, Cable, Globe } from 'lucide-react'`
);

// ── 3. Add helper functions after parseMapsUrl ────────────────────────────────
const helperFns = `
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
`;
code = code.replace(
  `export default function DataJalurFo() {`,
  helperFns + `export default function DataJalurFo() {`
);

// ── 4. Add route_waypoints & warna_jalur to EMPTY_FORM ────────────────────────
code = code.replace(
  `  jalur_id_manual: ''
}`,
  `  jalur_id_manual: '',
  route_waypoints: null,
  warna_jalur: '#FF0000'
}`
);

// ── 5. Add KMZ state variables ────────────────────────────────────────────────
code = code.replace(
  `  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importRows, setImportRows] = useState([])`,
  `  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importRows, setImportRows] = useState([])
  const [isKmzModalOpen, setIsKmzModalOpen] = useState(false)
  const [kmzRows, setKmzRows] = useState([])
  const kmzRef = useRef(null)`
);

// ── 6. Update openEdit to include new fields ──────────────────────────────────
code = code.replace(
  `      jalur_id_manual: ''
    })
    setIsModalOpen(true)
  }`,
  `      jalur_id_manual: '',
      route_waypoints: item.route_waypoints || null,
      warna_jalur: item.warna_jalur || '#FF0000'
    })
    setIsModalOpen(true)
  }`
);

// ── 7. Update handleSave payload to include new fields ────────────────────────
code = code.replace(
  `        keterangan: form.keterangan,
        updated_by: profile.id
      }`,
  `        keterangan: form.keterangan,
        route_waypoints: form.route_waypoints || null,
        warna_jalur: form.warna_jalur || '#FF0000',
        updated_by: profile.id
      }`
);

// ── 8. Add KMZ import + export functions after handleExport ───────────────────
const kmzFunctions = `
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
        const lineEl = pm.querySelector('LineString coordinates') || pm.querySelector('coordinates')
        if (!lineEl) continue
        const rawCoords = lineEl.textContent.trim().split(/\\s+/)
        const waypoints = rawCoords.map(c => {
          const [lon, lat] = c.split(',').map(Number)
          return (isNaN(lat) || isNaN(lon)) ? null : { lat, lon }
        }).filter(Boolean)
        if (waypoints.length < 2) continue
        const name = pm.querySelector('name')?.textContent?.trim() || 'Jalur FO'
        // Extract color from StyleMap or Style
        let color = '#FF0000'
        const styleUrl = pm.querySelector('styleUrl')?.textContent?.trim()?.replace('#','')
        const styleEls = Array.from(xml.querySelectorAll('Style'))
        const matchedStyle = styleEls.find(s => s.getAttribute('id') === styleUrl)
        const lineColor = (matchedStyle || pm).querySelector('LineStyle color')?.textContent?.trim()
        if (lineColor) color = kmlColorToHex(lineColor)
        const panjang = calcPolylineLength(waypoints)
        lines.push({ nama_jalur: name, warna_jalur: color, waypoints, panjang, _selected: true, _id: Math.random().toString(36).slice(2) })
      }
      if (lines.length === 0) { toast.error('Tidak ditemukan jalur garis (LineString) di file KMZ ini'); return }
      setKmzRows(lines)
      setIsKmzModalOpen(true)
      toast.success(\`Ditemukan \${lines.length} jalur dari file KMZ\`)
    } catch(err) {
      toast.error('Gagal baca KMZ: ' + err.message)
    }
    if (kmzRef.current) kmzRef.current.value = ''
  }

  const processKmzImport = async () => {
    const toImport = kmzRows.filter(r => r._selected)
    if (!toImport.length) return
    setSaving(true)
    let success = 0
    try {
      let localItems = [...items]
      for (const r of toImport) {
        const jId = generateItemId('banyumas', r.nama_jalur.replace(/\\s+/g, '_'), localItems)
        const payload = {
          jalur_id: jId,
          nama_jalur: r.nama_jalur,
          site: 'banyumas',
          panjang_meter: r.panjang,
          tipe_kabel: 'ADSS',
          route_waypoints: r.waypoints,
          warna_jalur: r.warna_jalur,
          provinsi: 'Jawa Tengah',
          kabupaten: 'Banyumas',
          kecamatan: '',
          desa: '',
          created_by: profile.id
        }
        const { data, error } = await supabase.from('network_jalur_fo').insert(payload).select().single()
        if (!error && data) { success++; localItems.push(data) }
      }
      toast.success(\`\${success} jalur berhasil diimport dari KMZ!\`)
      setIsKmzModalOpen(false)
      fetchData()
    } catch(e) { toast.error('Gagal import KMZ: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleExportKmz = async () => {
    const toExport = filtered.filter(item => item.route_waypoints?.length > 1)
    if (!toExport.length) { toast.error('Tidak ada jalur dengan data waypoints untuk di-export KMZ'); return }
    const kmlLines = toExport.map(item => {
      const color = hexToKmlColor(item.warna_jalur || '#FF0000')
      const coordStr = (item.route_waypoints || []).map(p => \`\${p.lon},\${p.lat},0\`).join(' ')
      return \`    <Placemark>
      <name>\${item.nama_jalur || item.jalur_id}</name>
      <Style><LineStyle><color>\${color}</color><width>3</width></LineStyle></Style>
      <LineString><coordinates>\${coordStr}</coordinates></LineString>
    </Placemark>\`
    }).join('\\n')
    const kml = \`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Data Jalur FO Maintory</name>
\${kmlLines}
  </Document>
</kml>\`
    const zip = new JSZip()
    zip.file('jalur_fo.kml', kml)
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = \`Jalur_FO_\${new Date().toISOString().slice(0,10)}.kmz\`
    a.click(); URL.revokeObjectURL(url)
    toast.success(\`\${toExport.length} jalur diekspor ke KMZ!\`)
  }
`;

code = code.replace(
  `  const handleFileChange = (e) => {`,
  kmzFunctions + `  const handleFileChange = (e) => {`
);

// ── 9. Add KMZ Import button to header ────────────────────────────────────────
code = code.replace(
  `          <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}><FileSpreadsheet size={14} /> Template</button>`,
  `          <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}><FileSpreadsheet size={14} /> Template</button>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Globe size={14} /> Import KMZ
            <input ref={kmzRef} type="file" accept=".kmz,.kml" style={{ display: 'none' }} onChange={handleImportKmz} />
          </label>`
);

// ── 10. Add KMZ export to Excel dropdown ─────────────────────────────────────
code = code.replace(
  `                  <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setExcelMenuOpen(false); handleExportExcel() }}><Download size={13} /> Export ke Excel</button>`,
  `                  <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setExcelMenuOpen(false); handleExportExcel() }}><Download size={13} /> Export ke Excel</button>
                  <button className="dropdown-item" style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setExcelMenuOpen(false); handleExportKmz() }}><Globe size={13} /> Export ke KMZ (Google Earth)</button>`
);

// ── 11. Add warna_jalur + waypoints indicator to table row ───────────────────
code = code.replace(
  `                      <td><span style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{item.jalur_id}</span></td>
                      <td>{item.nama_jalur || '-'}</td>`,
  `                      <td>
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
                      </td>`
);

// ── 12. Add warna_jalur field to Add/Edit modal ───────────────────────────────
code = code.replace(
  `                <div className="form-group">
                  <label className="form-label">Tipe Kabel</label>`,
  `                <div className="form-group">
                  <label className="form-label">Warna Jalur</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="color" value={form.warna_jalur || '#FF0000'} onChange={e => setForm(f => ({ ...f, warna_jalur: e.target.value }))} style={{ height: '34px', width: '50px', padding: '2px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent' }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{form.warna_jalur || '#FF0000'}</span>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipe Kabel</label>`
);

// ── 13. Add KMZ preview modal before closing </div> ───────────────────────────
code = code.replace(
  `      {/* IMPORT PREVIEW MODAL */}`,
  `      {/* KMZ IMPORT PREVIEW MODAL */}
      {isKmzModalOpen && (
        <div className="modal-overlay" onClick={() => setIsKmzModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '780px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Preview Import KMZ — {kmzRows.length} jalur ditemukan</h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Hanya garis (LineString) yang diimport. Titik (pin) dilewati otomatis.</p>
              </div>
              <button className="btn-icon" onClick={() => setIsKmzModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ fontSize: '12px', minWidth: '600px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '36px' }}>
                        <input type="checkbox"
                          checked={kmzRows.length > 0 && kmzRows.every(r => r._selected)}
                          onChange={e => setKmzRows(rows => rows.map(r => ({ ...r, _selected: e.target.checked })))}
                        />
                      </th>
                      <th>Warna</th>
                      <th>Nama Jalur (dari Google Earth)</th>
                      <th>Jumlah Titik</th>
                      <th>Estimasi Panjang</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kmzRows.map((r, i) => (
                      <tr key={r._id}>
                        <td><input type="checkbox" checked={r._selected} onChange={e => setKmzRows(rows => rows.map((row, ri) => ri === i ? { ...row, _selected: e.target.checked } : row))} /></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '18px', height: '18px', borderRadius: '3px', background: r.warna_jalur, border: '1px solid rgba(255,255,255,0.2)' }} />
                            <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-secondary)' }}>{r.warna_jalur}</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{r.nama_jalur}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{r.waypoints.length} titik</td>
                        <td>{r.panjang >= 1000 ? (r.panjang / 1000).toFixed(2) + ' km' : r.panjang + ' m'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(59,130,246,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.2)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                ⚠️ <strong>Perhatian:</strong> Setelah diimport, lengkapi data Kecamatan dan Desa di halaman ini (klik Edit). Panjang dihitung otomatis dari koordinat.
              </div>
            </div>
            <div className="modal-footer" style={{ flexShrink: 0 }}>
              <button className="btn btn-secondary" onClick={() => setIsKmzModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" disabled={saving || kmzRows.filter(r => r._selected).length === 0} onClick={processKmzImport}>
                {saving ? 'Mengimport...' : \`Import \${kmzRows.filter(r => r._selected).length} Jalur\`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT PREVIEW MODAL */}`
);

fs.writeFileSync('src/pages/jaringan/DataJalurFo.jsx', code);
console.log('Done - DataJalurFo KMZ feature written');

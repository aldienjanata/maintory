import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import Map, {
  Marker, Popup, Source, Layer,
  NavigationControl, GeolocateControl, FullscreenControl, ScaleControl
} from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapIcon, Search, X, Layers } from 'lucide-react'

// ── Styles ────────────────────────────────────────────────────────────────────
// Peta Jalan HD: CARTO Voyager (gratis, stabil, tanpa API key)
const ROADMAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'
// Satelit: Google Hybrid (foto udara + nama jalan)
const HYBRID_STYLE = {
  version: 8,
  sources: {
    sat: {
      type: 'raster',
      tiles: ['https://mt0.google.com/vt/lyrs=y&hl=id&x={x}&y={y}&z={z}', 'https://mt1.google.com/vt/lyrs=y&hl=id&x={x}&y={y}&z={z}'],
      tileSize: 256, maxzoom: 20
    }
  },
  layers: [{ id: 'sat', type: 'raster', source: 'sat' }]
}

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function ToggleSwitch({ checked, onChange, color, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 38, height: 22, borderRadius: 11, flexShrink: 0, position: 'relative',
          background: checked ? color : '#cbd5e1', transition: 'background 0.2s', cursor: 'pointer'
        }}
      >
        <div style={{
          width: 16, height: 16, borderRadius: '50%', background: 'white',
          position: 'absolute', top: 3, left: checked ? 19 : 3,
          transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.25)'
        }} />
      </div>
      <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{label}</span>
    </label>
  )
}

// ── Floating Layer Panel (di dalam peta, pojok kiri bawah) ───────────────────
function FloatingLayerPanel({ mapType, setMapType, showTiang, setShowTiang, showPerangkat, setShowPerangkat, showLines, setShowLines }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'absolute', bottom: 100, left: 10, zIndex: 1000 }}>
      {/* Tombol Lapisan */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Lapisan Peta"
        style={{
          background: 'white', border: 'none', borderRadius: 10, padding: '8px 12px',
          cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#334155'
        }}
      >
        <Layers size={16} color="#3b82f6" />
        Lapisan
      </button>

      {/* Panel Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', bottom: 48, left: 0,
          background: 'white', borderRadius: 14, padding: '14px 16px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)', width: 230,
          border: '1px solid #e2e8f0'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lapisan Peta</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
              <X size={14} color="#94a3b8" />
            </button>
          </div>

          {/* Mode Peta */}
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>TAMPILAN PETA</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
            {[
              { k: 'roadmap', icon: '🗺️', label: 'Peta Jalan', sub: 'HD Vector' },
              { k: 'hybrid',  icon: '🛰️', label: 'Satelit',   sub: 'Foto + Label' },
            ].map(({ k, icon, label, sub }) => (
              <button key={k} onClick={() => setMapType(k)}
                style={{
                  padding: '8px 6px', borderRadius: 10, border: `2px solid ${mapType === k ? '#3b82f6' : '#e2e8f0'}`,
                  cursor: 'pointer', background: mapType === k ? '#eff6ff' : 'white',
                  textAlign: 'center', transition: 'all 0.15s'
                }}
              >
                <div style={{ fontSize: 20, lineHeight: 1 }}>{icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: mapType === k ? '#3b82f6' : '#334155', marginTop: 4 }}>{label}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{sub}</div>
              </button>
            ))}
          </div>

          {/* Data Layer Toggles */}
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>DATA JARINGAN</p>
          <ToggleSwitch checked={showTiang}     onChange={setShowTiang}     color="#6b7280" label="📡 Titik Tiang" />
          <ToggleSwitch checked={showPerangkat} onChange={setShowPerangkat} color="#22c55e" label="📦 Titik ODP / ODC" />
          <div>
            <ToggleSwitch checked={showLines}   onChange={setShowLines}     color="#3b82f6" label="〰️ Garis Koneksi FO" />
            {showLines && (
              <p style={{ margin: '4px 0 0 48px', fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                Garis yang menghubungkan ODP/ODC ke Tiang induknya
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Search Bar ─────────────────────────────────────────────────────────────────
function SearchBar({ onResult }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)

  const search = async () => {
    if (!q.trim()) return
    setBusy(true)
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=id`)
      setResults(await r.json())
    } catch { setResults([]) }
    setBusy(false)
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-card)', borderRadius: 24, padding: '10px 16px',
        border: '1px solid var(--border-color)', boxShadow: '0 1px 6px rgba(0,0,0,0.06)'
      }}>
        <Search size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        <input
          value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Cari desa, jalan, atau nama tempat..."
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: 14, background: 'transparent', color: 'var(--text-primary)' }}
        />
        {q && <button onClick={() => { setQ(''); setResults([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={14} color="#94a3b8" /></button>}
        {busy && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #3b82f6', borderTop: '2px solid transparent', animation: 'mapSpin 1s linear infinite', flexShrink: 0 }} />}
      </div>
      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: 50, left: 0, right: 0, zIndex: 9999,
          background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto'
        }}>
          {results.map(r => (
            <div key={r.place_id}
              onClick={() => { onResult([parseFloat(r.lat), parseFloat(r.lon)]); setResults([]); setQ(r.display_name.split(',')[0]) }}
              style={{ padding: '10px 14px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontWeight: 600 }}>{r.display_name.split(',')[0]}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{r.display_name.split(',').slice(1, 3).join(',').trim()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PetaJaringan() {
  const mapRef = useRef(null)
  const [poles, setPoles]     = useState([])
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  // Controls (all managed here, passed to FloatingLayerPanel)
  const [mapType, setMapType]             = useState('hybrid')
  const [showTiang, setShowTiang]         = useState(true)
  const [showPerangkat, setShowPerangkat] = useState(true)
  const [showLines, setShowLines]         = useState(true)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    try {
      const [pR, dR] = await Promise.all([
        supabase.from('network_poles').select('*'),
        supabase.from('network_odp_odc').select('*')
      ])
      if (pR.data) setPoles(pR.data.filter(p => p.latitude && p.longitude))
      if (dR.data) setDevices(dR.data.filter(d => d.latitude && d.longitude))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  // ── Connection Lines GeoJSON ──────────────────────────────────────────────
  const linesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: showLines ? devices.flatMap(d => {
      if (!d.parent_pole_id) return []
      const p = poles.find(x => x.pole_id === d.parent_pole_id)
      if (!p?.latitude || !p?.longitude) return []
      return [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[Number(d.longitude), Number(d.latitude)], [Number(p.longitude), Number(p.latitude)]] },
        properties: { color: d.type === 'ODC' ? '#f97316' : '#22c55e' }
      }]
    }) : []
  }), [poles, devices, showLines])

  const onMapClick = useCallback(() => setSelected(null), [])

  const center = poles.length > 0
    ? { longitude: Number(poles[0].longitude), latitude: Number(poles[0].latitude), zoom: 14 }
    : { longitude: 109.245, latitude: -7.427, zoom: 13 }

  const tiangCount = poles.length
  const odpCount   = devices.filter(d => d.type === 'ODP').length
  const odcCount   = devices.filter(d => d.type === 'ODC').length

  return (
    <div className="page-container">
      <style>{`
        @keyframes mapSpin { to { transform: rotate(360deg); } }
        .maplibregl-ctrl-group { border-radius: 12px !important; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.18) !important; border: none !important; }
        .maplibregl-popup-content { border-radius: 12px !important; padding: 10px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important; border: 1px solid #e2e8f0 !important; font-family: system-ui, sans-serif !important; }
        .maplibregl-popup-tip { display: none !important; }
        .marker-tiang { width: 30px; height: 30px; cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4)); transition: transform 0.15s; }
        .marker-tiang:hover { transform: scale(1.2); }
        .marker-odp { width: 28px; height: 28px; cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4)); transition: transform 0.15s; }
        .marker-odp:hover { transform: scale(1.2); }
        .marker-odc { width: 30px; height: 30px; cursor: pointer; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45)); transition: transform 0.15s; }
        .marker-odc:hover { transform: scale(1.2); }
      `}</style>

      {/* ── Header ── */}
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div className="page-header-left">
          <div className="page-icon"><MapIcon size={24} /></div>
          <div>
            <h1 className="page-title">Peta Jaringan</h1>
            <p className="page-subtitle">MapLibre GL · WebGL · Rotasi &amp; Tilt 3D · {tiangCount + odpCount + odcCount} titik</p>
          </div>
        </div>
      </div>

      {/* ── Search Bar ── */}
      <div style={{ marginBottom: 12 }}>
        <SearchBar onResult={([lat, lon]) => mapRef.current?.flyTo({ center: [lon, lat], zoom: 16, duration: 1200 })} />
      </div>

      {/* ── Stats Pills ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['#6b7280', `📡 Tiang: ${tiangCount}`], ['#22c55e', `📦 ODP: ${odpCount}`], ['#f97316', `🔶 ODC: ${odcCount}`]].map(([color, label]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            {label}
          </span>
        ))}
      </div>

      {/* ── Map Area ── */}
      {loading ? (
        <div className="loading-screen" style={{ height: 400 }}>
          <div className="spinner" />
          <p className="text-secondary mt-2">Memuat data jaringan...</p>
        </div>
      ) : (
        <div style={{
          height: 'calc(100vh - 300px)', minHeight: 500,
          borderRadius: 16, overflow: 'hidden',
          border: '1px solid var(--border-color)', boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          position: 'relative'  // Penting: biar FloatingLayerPanel bisa absolute di dalam sini
        }}>
          {/* Floating Layer Panel — di dalam map container */}
          <FloatingLayerPanel
            mapType={mapType} setMapType={setMapType}
            showTiang={showTiang} setShowTiang={setShowTiang}
            showPerangkat={showPerangkat} setShowPerangkat={setShowPerangkat}
            showLines={showLines} setShowLines={setShowLines}
          />

          <Map
            ref={mapRef}
            initialViewState={{ ...center, pitch: 0, bearing: 0 }}
            mapStyle={mapType === 'hybrid' ? HYBRID_STYLE : ROADMAP_STYLE}
            onClick={onMapClick}
            maxZoom={22}
            style={{ width: '100%', height: '100%' }}
          >
            {/* Built-in Controls */}
            <NavigationControl position="bottom-right" visualizePitch showCompass showZoom />
            <GeolocateControl position="bottom-right" trackUserLocation showUserHeading showAccuracyCircle fitBoundsOptions={{ maxZoom: 17 }} />
            <FullscreenControl position="top-right" />
            <ScaleControl position="bottom-left" unit="metric" />

            {/* ── Connection Lines (GeoJSON layer — ringan, tidak butuh icon) ── */}
            <Source id="lines" type="geojson" data={linesGeoJSON}>
              <Layer id="lines-layer" type="line"
                paint={{ 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.65, 'line-dasharray': [3, 3] }}
              />
            </Source>

            {/* ── Tiang Markers (Marker + img, PASTI muncul) ── */}
            {showTiang && poles.map(pole => (
              <Marker
                key={`t-${pole.id}`}
                longitude={Number(pole.longitude)}
                latitude={Number(pole.latitude)}
                anchor="bottom"
              >
                <img
                  src="/icon_tiang.png"
                  className="marker-tiang"
                  onClick={e => {
                    e.stopPropagation()
                    setSelected({ _type: 'tiang', lon: Number(pole.longitude), lat: Number(pole.latitude), ...pole })
                  }}
                  title={pole.pole_id}
                  alt="tiang"
                />
              </Marker>
            ))}

            {/* ── ODP/ODC Markers (Marker + img) ── */}
            {showPerangkat && devices.map(device => (
              <Marker
                key={`d-${device.id}`}
                longitude={Number(device.longitude)}
                latitude={Number(device.latitude)}
                anchor="bottom"
              >
                <img
                  src={device.type === 'ODC' ? '/icon_odc.png' : '/icon_odp.png'}
                  className={device.type === 'ODC' ? 'marker-odc' : 'marker-odp'}
                  onClick={e => {
                    e.stopPropagation()
                    setSelected({ _type: 'device', lon: Number(device.longitude), lat: Number(device.latitude), ...device })
                  }}
                  title={device.device_id}
                  alt={device.type}
                />
              </Marker>
            ))}

            {/* ── Popup ── */}
            {selected && (
              <Popup
                longitude={selected.lon}
                latitude={selected.lat}
                anchor="bottom"
                closeButton={false}
                maxWidth="240px"
                onClose={() => setSelected(null)}
                offset={[0, -32]}
              >
                <div>
                  {/* Popup Header */}
                  <div style={{
                    background: selected._type === 'tiang' ? '#f8fafc' : selected.type === 'ODC' ? '#fff7ed' : '#f0fdf4',
                    margin: '-10px -10px 8px', padding: '8px 12px', borderRadius: '10px 10px 0 0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                        {selected._type === 'tiang' ? '🗼 TIANG' : `📦 ${selected.type}`}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginTop: 2 }}>
                        {selected.pole_id || selected.device_id || '-'}
                      </div>
                    </div>
                    <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, marginLeft: 8 }}>
                      <X size={14} color="#94a3b8" />
                    </button>
                  </div>
                  {/* Popup Fields */}
                  {(selected._type === 'tiang'
                    ? [['Site', selected.site], ['Desa', selected.desa], ['Jalan', selected.jalan || '-'], ['Kab.', selected.kabupaten || '-'], ['Status', selected.status || '-'], ['Ket.', selected.keterangan || '-']]
                    : [['Site', selected.site], ['Desa', selected.desa], ['Jalan', selected.jalan || '-'], ['Kapasitas', `${selected.capacity || '-'} Port`], ['Tiang Induk', selected.parent_pole_id || '-'], ['Ket.', selected.keterangan || '-']]
                  ).filter(([, v]) => v && v !== '-').map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, borderBottom: '1px solid #f1f5f9', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: '#64748b', flexShrink: 0 }}>{k}</span>
                      <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word', maxWidth: 150, color: '#1e293b' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </Popup>
            )}
          </Map>
        </div>
      )}
    </div>
  )
}

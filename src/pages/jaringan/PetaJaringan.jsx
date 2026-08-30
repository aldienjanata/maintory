import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import Map, {
  Popup, Source, Layer,
  NavigationControl, GeolocateControl, FullscreenControl, ScaleControl
} from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapIcon, Search, X, Layers } from 'lucide-react'

// ── Definisi Icon ──────────────────────────────────────────────────────────────
const ICON_DEFS = [
  { name: 'icon-tiang', url: '/icon_tiang.png' },
  { name: 'icon-odp',   url: '/icon_odp.png' },
  { name: 'icon-odc',   url: '/icon_odc.png' },
]

// ── SINGLE Fixed Style (TIDAK PERNAH diganti, tile di-swap via setLayoutProperty)
// Ini kunci anti-lag: tidak ada style reload saat ganti mode peta
const MAP_STYLE = {
  version: 8,
  sources: {
    // OSM: Peta Jalan (gratis, stabil, ada nama jalan)
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    },
    // Google Maps Hybrid HD - 4 server mirror (lebih cepat loading)
    satellite: {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=y&hl=id&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=y&hl=id&x={x}&y={y}&z={z}',
        'https://mt2.google.com/vt/lyrs=y&hl=id&x={x}&y={y}&z={z}',
        'https://mt3.google.com/vt/lyrs=y&hl=id&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      maxzoom: 21,  // Lebih tinggi = lebih HD saat zoom dekat
      attribution: '© Google Maps'
    }
  },
  layers: [
    // Default: Satelit visible, OSM hidden
    { id: 'base-satellite', type: 'raster', source: 'satellite', layout: { visibility: 'visible' } },
    { id: 'base-osm',       type: 'raster', source: 'osm',       layout: { visibility: 'none' } },
  ]
}

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function ToggleSwitch({ checked, onChange, color, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div onClick={() => onChange(!checked)} style={{
        width: 40, height: 22, borderRadius: 11, flexShrink: 0, position: 'relative',
        background: checked ? color : '#cbd5e1', transition: 'background 0.2s', cursor: 'pointer'
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%', background: 'white',
          position: 'absolute', top: 3, left: checked ? 21 : 3, transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
        }} />
      </div>
      <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{label}</span>
    </label>
  )
}

// ── Floating Layer Panel (di dalam map, pojok kiri bawah) ─────────────────────
function FloatingLayerPanel({ mapType, setMapType, showTiang, setShowTiang, showPerangkat, setShowPerangkat }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'absolute', bottom: 105, left: 10, zIndex: 1000 }}>
      <button onClick={() => setOpen(o => !o)} title="Lapisan Peta" style={{
        background: 'white', border: 'none', borderRadius: 10, padding: '8px 12px',
        cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#334155'
      }}>
        <Layers size={16} color="#3b82f6" /> Lapisan
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 46, left: 0,
          background: 'white', borderRadius: 14, padding: '14px 16px',
          boxShadow: '0 8px 28px rgba(0,0,0,0.2)', width: 230, border: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lapisan Peta</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}><X size={14} color="#94a3b8" /></button>
          </div>

          {/* Mode Peta */}
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>TAMPILAN PETA</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { k: 'roadmap',  icon: '🗺️', label: 'Peta Jalan', sub: 'OSM + Nama Jalan' },
              { k: 'hybrid',   icon: '🛰️', label: 'Satelit HD', sub: 'Google Maps' },
            ].map(({ k, icon, label, sub }) => (
              <button key={k} onClick={() => setMapType(k)} style={{
                padding: '10px 6px', borderRadius: 10, cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                border: `2px solid ${mapType === k ? '#3b82f6' : '#e2e8f0'}`,
                background: mapType === k ? '#eff6ff' : 'white'
              }}>
                <div style={{ fontSize: 22 }}>{icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: mapType === k ? '#3b82f6' : '#334155', marginTop: 4 }}>{label}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{sub}</div>
              </button>
            ))}
          </div>

          {/* Layer Toggles */}
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>DATA JARINGAN</p>
          <ToggleSwitch checked={showTiang}     onChange={setShowTiang}     color="#6b7280" label="📡 Titik Tiang" />
          <ToggleSwitch checked={showPerangkat} onChange={setShowPerangkat} color="#22c55e" label="📦 Titik ODP / ODC" />
        </div>
      )}
    </div>
  )
}

// ── Search Bar ────────────────────────────────────────────────────────────────
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', borderRadius: 24, padding: '9px 16px', border: '1px solid var(--border-color)' }}>
        <Search size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Cari desa, jalan, atau nama tempat..."
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: 14, background: 'transparent', color: 'var(--text-primary)' }} />
        {q && <button onClick={() => { setQ(''); setResults([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={14} color="#94a3b8" /></button>}
        {busy && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #3b82f6', borderTop: '2px solid transparent', animation: 'pjSpin 1s linear infinite', flexShrink: 0 }} />}
      </div>
      {results.length > 0 && (
        <div style={{ position: 'absolute', top: 50, left: 0, right: 0, zIndex: 9999, background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
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
  const mapRef       = useRef(null)
  const isLoaded     = useRef(false)

  const [poles, setPoles]     = useState([])
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [iconsReady, setIconsReady] = useState(false)

  const [mapType, setMapType]             = useState('hybrid')   // 'hybrid' | 'roadmap'
  const [showTiang, setShowTiang]         = useState(true)
  const [showPerangkat, setShowPerangkat] = useState(true)

  // ── Fetch Data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('network_poles').select('id,pole_id,site,desa,jalan,kabupaten,provinsi,status,keterangan,latitude,longitude')
      .then(({ data }) => { if (data) setPoles(data.filter(p => p.latitude && p.longitude)) })
    supabase.from('network_odp_odc').select('id,device_id,type,site,desa,jalan,capacity,parent_pole_id,keterangan,latitude,longitude')
      .then(({ data }) => { if (data) setDevices(data.filter(d => d.latitude && d.longitude)) })
      .finally(() => setLoading(false))
  }, [])

  // ── Load Custom Icons ke MapLibre ──────────────────────────────────────────
  const loadIcons = useCallback((map) => {
    let done = 0
    ICON_DEFS.forEach(({ name, url }) => {
      map.loadImage(url, (err, img) => {
        if (!err) {
          if (map.hasImage(name)) map.removeImage(name)
          map.addImage(name, img, { sdf: false })
        }
        if (++done === ICON_DEFS.length) setIconsReady(true)
      })
    })
  }, [])

  // ── Map Load Handler ───────────────────────────────────────────────────────
  const onMapLoad = useCallback((e) => {
    const map = e.target
    isLoaded.current = true
    loadIcons(map)

    // Fallback: jika icon diminta sebelum selesai load, load ulang
    map.on('styleimagemissing', ({ id }) => {
      const def = ICON_DEFS.find(d => d.name === id)
      if (def) {
        map.loadImage(def.url, (err, img) => {
          if (!err && !map.hasImage(id)) map.addImage(id, img)
        })
      }
    })
  }, [loadIcons])

  // ── Ganti Mode Peta (NO style reload = instant, no lag) ───────────────────
  useEffect(() => {
    if (!mapRef.current || !isLoaded.current) return
    const map = mapRef.current
    try {
      map.setLayoutProperty('base-satellite', 'visibility', mapType === 'hybrid' ? 'visible' : 'none')
      map.setLayoutProperty('base-osm',       'visibility', mapType === 'roadmap' ? 'visible' : 'none')
    } catch (_) { /* map might not be ready yet */ }
  }, [mapType])

  // ── GeoJSON (hanya kolom yang perlu untuk reduce payload size) ────────────
  const polesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: poles.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(p.longitude), Number(p.latitude)] },
      properties: {
        _type: 'tiang',
        pole_id: p.pole_id, site: p.site, desa: p.desa,
        jalan: p.jalan || '', kabupaten: p.kabupaten || '',
        status: p.status || '', keterangan: p.keterangan || ''
      }
    }))
  }), [poles])

  const devicesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: devices.map(d => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(d.longitude), Number(d.latitude)] },
      properties: {
        _type: 'device',
        device_id: d.device_id, type: d.type,
        site: d.site, desa: d.desa, jalan: d.jalan || '',
        capacity: d.capacity || '', parent_pole_id: d.parent_pole_id || '',
        keterangan: d.keterangan || '',
        _icon: d.type === 'ODC' ? 'icon-odc' : 'icon-odp'
      }
    }))
  }), [devices])

  // ── Click Handler ──────────────────────────────────────────────────────────
  const onClick = useCallback((e) => {
    const fs = e.features
    if (!fs?.length) { setSelected(null); return }
    const f = fs[0]

    // Klik cluster → zoom in
    if (f.properties?.point_count) {
      mapRef.current?.flyTo({ center: f.geometry.coordinates, zoom: (mapRef.current?.getZoom?.() || 14) + 3, duration: 600 })
      return
    }

    if (f.properties?._type) {
      setSelected({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], ...f.properties })
    }
  }, [])

  const onMapClick = useCallback((e) => {
    if (!e.features?.length) setSelected(null)
  }, [])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const tiangCount = poles.length
  const odpCount   = devices.filter(d => d.type === 'ODP').length
  const odcCount   = devices.filter(d => d.type === 'ODC').length

  const center = poles.length > 0
    ? { longitude: Number(poles[0].longitude), latitude: Number(poles[0].latitude), zoom: 14 }
    : { longitude: 109.245, latitude: -7.427, zoom: 13 }

  // Layer visibility sebagai string (tidak trigger re-render map)
  const tiangVis    = showTiang     ? 'visible' : 'none'
  const perangkatVis = showPerangkat ? 'visible' : 'none'

  const interactiveLayers = iconsReady
    ? ['poles-clusters', 'poles-symbols', 'devices-clusters', 'devices-symbols']
    : []

  return (
    <div className="page-container">
      <style>{`
        @keyframes pjSpin { to { transform: rotate(360deg); } }
        .maplibregl-ctrl-group { border-radius: 12px !important; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.2) !important; border: none !important; }
        .maplibregl-popup-content { border-radius: 12px !important; padding: 10px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important; border: 1px solid #e2e8f0 !important; font-family: system-ui, sans-serif !important; min-width: 200px; }
        .maplibregl-popup-tip { display: none !important; }
        .maplibregl-ctrl-bottom-right .maplibregl-ctrl { margin-bottom: 6px !important; }
      `}</style>

      {/* Header */}
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div className="page-header-left">
          <div className="page-icon"><MapIcon size={24} /></div>
          <div>
            <h1 className="page-title">Peta Jaringan</h1>
            <p className="page-subtitle">MapLibre GL · WebGL · Rotasi &amp; Tilt 3D</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 10 }}>
        <SearchBar onResult={([lat, lon]) => mapRef.current?.flyTo({ center: [lon, lat], zoom: 16, duration: 1200 })} />
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['#6b7280', `📡 Tiang: ${tiangCount}`], ['#22c55e', `📦 ODP: ${odpCount}`], ['#f97316', `🔶 ODC: ${odcCount}`]].map(([color, label]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />{label}
          </span>
        ))}
      </div>

      {/* Map */}
      {loading ? (
        <div className="loading-screen" style={{ height: 400 }}>
          <div className="spinner" />
          <p className="text-secondary mt-2">Memuat data jaringan...</p>
        </div>
      ) : (
        <div style={{
          height: 'calc(100vh - 270px)', minHeight: 500,
          borderRadius: 16, overflow: 'hidden', position: 'relative',
          border: '1px solid var(--border-color)', boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
        }}>
          {/* Floating Layer Panel — letaknya di atas map container tapi di bawah map canvas */}
          <FloatingLayerPanel
            mapType={mapType} setMapType={setMapType}
            showTiang={showTiang} setShowTiang={setShowTiang}
            showPerangkat={showPerangkat} setShowPerangkat={setShowPerangkat}
          />

          <Map
            ref={mapRef}
            initialViewState={{ ...center, pitch: 0, bearing: 0 }}
            mapStyle={MAP_STYLE}   // ← TIDAK PERNAH berubah (key anti-lag)
            onLoad={onMapLoad}
            onClick={onClick}
            onMouseDown={onMapClick}
            interactiveLayerIds={interactiveLayers}
            maxZoom={22}
            style={{ width: '100%', height: '100%' }}
            // Performance optimizations
            preserveDrawingBuffer={false}
            antialias={false}
          >
            {/* Built-in Controls */}
            <NavigationControl position="bottom-right" visualizePitch showCompass showZoom />
            <GeolocateControl position="bottom-right" trackUserLocation showUserHeading showAccuracyCircle fitBoundsOptions={{ maxZoom: 17 }} />
            <FullscreenControl position="top-right" />
            <ScaleControl position="bottom-left" unit="metric" />

            {/* ── Tiang: WebGL GeoJSON Symbol Layer (anti-lag 1000 marker) ── */}
            {iconsReady && (
              <Source id="poles" type="geojson" data={polesGeoJSON} cluster={true} clusterMaxZoom={16} clusterRadius={55}>
                {/* Cluster circles */}
                <Layer id="poles-clusters" type="circle"
                  filter={['has', 'point_count']}
                  layout={{ visibility: tiangVis }}
                  paint={{ 'circle-color': '#6b7280', 'circle-radius': ['step', ['get', 'point_count'], 16, 10, 24, 100, 32], 'circle-stroke-width': 2, 'circle-stroke-color': '#fff', 'circle-opacity': 0.9 }}
                />
                {/* Individual markers */}
                <Layer id="poles-symbols" type="symbol"
                  filter={['!', ['has', 'point_count']]}
                  layout={{
                    visibility: tiangVis,
                    'icon-image': 'icon-tiang',
                    'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 17, 0.9],
                    'icon-allow-overlap': true,
                    'icon-anchor': 'bottom',
                  }}
                />
              </Source>
            )}

            {/* ── ODP/ODC: WebGL GeoJSON Symbol Layer ── */}
            {iconsReady && (
              <Source id="devices" type="geojson" data={devicesGeoJSON} cluster={true} clusterMaxZoom={16} clusterRadius={55}>
                <Layer id="devices-clusters" type="circle"
                  filter={['has', 'point_count']}
                  layout={{ visibility: perangkatVis }}
                  paint={{ 'circle-color': '#22c55e', 'circle-radius': ['step', ['get', 'point_count'], 16, 10, 24, 100, 32], 'circle-stroke-width': 2, 'circle-stroke-color': '#fff', 'circle-opacity': 0.9 }}
                />
                <Layer id="devices-symbols" type="symbol"
                  filter={['!', ['has', 'point_count']]}
                  layout={{
                    visibility: perangkatVis,
                    'icon-image': ['get', '_icon'],
                    'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 17, 0.9],
                    'icon-allow-overlap': true,
                    'icon-anchor': 'bottom',
                  }}
                />
              </Source>
            )}

            {/* ── Popup ── */}
            {selected && (
              <Popup longitude={selected.lon} latitude={selected.lat} anchor="bottom" closeButton={false} maxWidth="240px" onClose={() => setSelected(null)} offset={[0, -30]}>
                <div>
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
                  {(selected._type === 'tiang'
                    ? [['Site', selected.site], ['Desa', selected.desa], ['Jalan', selected.jalan], ['Kab.', selected.kabupaten], ['Status', selected.status], ['Ket.', selected.keterangan]]
                    : [['Site', selected.site], ['Desa', selected.desa], ['Jalan', selected.jalan], ['Kapasitas', selected.capacity ? `${selected.capacity} Port` : ''], ['Tiang Induk', selected.parent_pole_id], ['Ket.', selected.keterangan]]
                  ).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, borderBottom: '1px solid #f1f5f9', gap: 8 }}>
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

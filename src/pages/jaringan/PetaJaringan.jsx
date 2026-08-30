import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import Map, {
  Popup, Source, Layer,
  NavigationControl, GeolocateControl, FullscreenControl, ScaleControl
} from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapIcon, Search, X, Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import { TIANG_B64, ODP_B64, ODC_B64 } from './iconsBase64'

const ICON_DEFS = [
  { name: 'icon-tiang', b64: TIANG_B64 },
  { name: 'icon-odp',   b64: ODP_B64 },
  { name: 'icon-odc',   b64: ODC_B64 },
]

const EMPTY_STYLE = { 
  version: 8, 
  sources: {}, 
  layers: [],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf"
}

const parseCoord = (c) => {
  if (!c) return 0;
  const num = Number(String(c).replace(',', '.').trim());
  return isNaN(num) ? 0 : num;
};

const isValidCoord = (lat, lon) => {
  const lt = parseCoord(lat), ln = parseCoord(lon);
  return lt !== 0 && ln !== 0;
};

function ToggleSwitch({ checked, onChange, color, label, iconB64 }) {
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
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155', fontWeight: 500 }}>
        {iconB64 && <img src={iconB64} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />}
        {label}
      </span>
    </label>
  )
}

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
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>DATA JARINGAN</p>
          <ToggleSwitch checked={showTiang}     onChange={setShowTiang}     color="#6b7280" label="Titik Tiang" iconB64={TIANG_B64} />
          <ToggleSwitch checked={showPerangkat} onChange={setShowPerangkat} color="#22c55e" label="Titik ODP / ODC" iconB64={ODP_B64} />
        </div>
      )}
    </div>
  )
}

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

export default function PetaJaringan() {
  const mapRef = useRef(null)
  const geoControlRef = useRef(null)

  const [poles, setPoles]     = useState([])
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  const [mapType, setMapType]             = useState('hybrid')
  const [showTiang, setShowTiang]         = useState(true)
  const [showPerangkat, setShowPerangkat] = useState(true)

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        let allPoles = []
        let fromP = 0
        const step = 1000
        while (true) {
          const { data, error } = await supabase.from('network_poles').select('*').range(fromP, fromP + step - 1)
          if (error || !data || data.length === 0) break
          allPoles.push(...data)
          if (data.length < step) break
          fromP += step
        }
        setPoles(allPoles.filter(p => isValidCoord(p.latitude, p.longitude)))

        let allDevices = []
        let fromD = 0
        while (true) {
          const { data, error } = await supabase.from('network_odp_odc').select('*').range(fromD, fromD + step - 1)
          if (error || !data || data.length === 0) break
          allDevices.push(...data)
          if (data.length < step) break
          fromD += step
        }
        setDevices(allDevices.filter(d => isValidCoord(d.latitude, d.longitude)))
      } catch (err) {
        console.error('Error fetching:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAllData()
  }, [])

  useEffect(() => {
    let toastId = null
    if (navigator.geolocation) {
      toastId = toast.loading('📍 Sedang melacak lokasi Anda...', { position: 'bottom-center' })
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          toast.success('Lokasi Anda ditemukan!', { id: toastId, position: 'bottom-center' })
          mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16, duration: 2500 })
        },
        () => { toast.dismiss(toastId) },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    }
  }, [])

  const onMapLoad = useCallback((e) => {
    const map = e.target

    setTimeout(() => geoControlRef.current?.trigger(), 800)

    ICON_DEFS.forEach(({ name, b64 }) => {
      const img = new Image()
      img.onload = () => { if (!map.hasImage(name)) map.addImage(name, img) }
      img.src = b64
    })

    map.on('styleimagemissing', (evt) => {
      const def = ICON_DEFS.find(d => d.name === evt.id)
      if (def) {
        const img = new Image()
        img.onload = () => { if (!map.hasImage(evt.id)) map.addImage(evt.id, img) }
        img.src = def.b64
      }
    })
  }, [])

  const polesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: poles.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [parseCoord(p.longitude), parseCoord(p.latitude)] },
      properties: { ...p, _type: 'tiang' }
    }))
  }), [poles])

  const devicesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: devices.map(d => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [parseCoord(d.longitude), parseCoord(d.latitude)] },
      properties: { ...d, _type: 'device', _icon: d.type === 'ODC' ? 'icon-odc' : 'icon-odp' }
    }))
  }), [devices])

  const onClick = useCallback((e) => {
    const fs = e.features
    if (!fs?.length) { setSelected(null); return }
    const f = fs[0]

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

  const tiangCount = poles.length
  const odpCount   = devices.filter(d => d.type === 'ODP').length
  const odcCount   = devices.filter(d => d.type === 'ODC').length

  const center = poles.length > 0
    ? { longitude: parseCoord(poles[0].longitude), latitude: parseCoord(poles[0].latitude), zoom: 14 }
    : { longitude: 109.245, latitude: -7.427, zoom: 13 }

  return (
    <div className="page-container">
      <style>{`
        @keyframes pjSpin { to { transform: rotate(360deg); } }
        .maplibregl-ctrl-group { border-radius: 12px !important; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.2) !important; border: none !important; }
        .maplibregl-popup-content { border-radius: 12px !important; padding: 10px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important; border: 1px solid #e2e8f0 !important; font-family: system-ui, sans-serif !important; min-width: 200px; }
        .maplibregl-popup-tip { display: none !important; }
        .maplibregl-ctrl-bottom-right .maplibregl-ctrl { margin-bottom: 6px !important; }
        .maplibregl-ctrl-compass .maplibregl-ctrl-icon {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23ea4335' d='M12 2.5L7.5 12 12 12z'/%3E%3Cpath fill='%239aa0a6' d='M12 21.5L7.5 12 12 12z'/%3E%3Cpath fill='%23d93025' d='M12 2.5L16.5 12 12 12z'/%3E%3Cpath fill='%2380868b' d='M12 21.5L16.5 12 12 12z'/%3E%3C/svg%3E") !important;
          background-size: 70% !important;
        }
      `}</style>

      <div className="page-header" style={{ marginBottom: 12 }}>
        <div className="page-header-left">
          <div className="page-icon"><MapIcon size={24} /></div>
          <div>
            <h1 className="page-title">Peta Jaringan</h1>
            <p className="page-subtitle">MapLibre GL · WebGL · Rotasi &amp; Tilt 3D</p>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <SearchBar onResult={([lat, lon]) => mapRef.current?.flyTo({ center: [lon, lat], zoom: 16, duration: 1200 })} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          ['#6b7280', TIANG_B64, `Tiang: ${tiangCount}`], 
          ['#22c55e', ODP_B64, `ODP: ${odpCount}`], 
          ['#f97316', ODC_B64, `ODC: ${odcCount}`]
        ].map(([color, b64, label]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <img src={b64} alt="icon" style={{ width: 14, height: 14, objectFit: 'contain' }} />
            {label}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="loading-screen" style={{ height: 400 }}>
          <div className="spinner" />
          <p className="text-secondary mt-2">Memuat {tiangCount > 0 ? `${tiangCount}+` : ''} data jaringan...</p>
        </div>
      ) : (
        <div style={{
          height: 'calc(100vh - 270px)', minHeight: 500,
          borderRadius: 16, overflow: 'hidden', position: 'relative',
          border: '1px solid var(--border-color)', boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
        }}>
          <FloatingLayerPanel
            mapType={mapType} setMapType={setMapType}
            showTiang={showTiang} setShowTiang={setShowTiang}
            showPerangkat={showPerangkat} setShowPerangkat={setShowPerangkat}
          />

          <Map
            ref={mapRef}
            initialViewState={{ ...center, pitch: 0, bearing: 0 }}
            mapStyle={EMPTY_STYLE}
            onLoad={onMapLoad}
            onClick={onClick}
            onMouseDown={onMapClick}
            interactiveLayerIds={['poles-clusters', 'poles-symbols', 'devices-clusters', 'devices-symbols']}
            maxZoom={22}
            style={{ width: '100%', height: '100%' }}
            preserveDrawingBuffer={false}
            antialias={false}
          >
            <Source id="base-osm-src" type="raster" tiles={['https://tile.openstreetmap.org/{z}/{x}/{y}.png']} tileSize={256} maxzoom={19}>
              <Layer id="base-osm-layer" type="raster" layout={{ visibility: mapType === 'roadmap' ? 'visible' : 'none' }} />
            </Source>

            <Source id="base-sat-src" type="raster" tiles={[
              'https://mt0.google.com/vt/lyrs=y&hl=id&x={x}&y={y}&z={z}',
              'https://mt1.google.com/vt/lyrs=y&hl=id&x={x}&y={y}&z={z}',
              'https://mt2.google.com/vt/lyrs=y&hl=id&x={x}&y={y}&z={z}',
              'https://mt3.google.com/vt/lyrs=y&hl=id&x={x}&y={y}&z={z}',
            ]} tileSize={128} maxzoom={21}>
              <Layer id="base-sat-layer" type="raster" layout={{ visibility: mapType === 'hybrid' ? 'visible' : 'none' }} />
            </Source>

            <NavigationControl position="bottom-right" visualizePitch showCompass showZoom />
            <GeolocateControl 
              ref={geoControlRef}
              position="bottom-right" 
              trackUserLocation 
              showUserHeading 
              showAccuracyCircle 
              fitBoundsOptions={{ maxZoom: 17 }} 
            />
            <FullscreenControl position="top-right" />
            <ScaleControl position="bottom-left" unit="metric" />

            {/* ── TIANG ── */}
            <Source id="poles" type="geojson" data={polesGeoJSON} cluster={true} clusterMaxZoom={16} clusterRadius={55}>
              <Layer id="poles-clusters" type="circle"
                filter={['has', 'point_count']}
                layout={{ visibility: showTiang ? 'visible' : 'none' }}
                paint={{ 
                  'circle-color': '#6b7280', 
                  'circle-radius': ['step', ['get', 'point_count'], 16, 10, 24, 100, 32], 
                  'circle-stroke-width': 2, 
                  'circle-stroke-color': '#fff' 
                }}
              />
              <Layer id="poles-cluster-count" type="symbol"
                filter={['has', 'point_count']}
                layout={{
                  visibility: showTiang ? 'visible' : 'none',
                  'text-field': '{point_count_abbreviated}',
                  'text-size': 12,
                }}
                paint={{ 'text-color': '#ffffff' }}
              />
              <Layer id="poles-symbols" type="symbol"
                filter={['!', ['has', 'point_count']]}
                layout={{
                  visibility: showTiang ? 'visible' : 'none',
                  'icon-image': 'icon-tiang',
                  'icon-size': 0.65,
                  'icon-allow-overlap': true,
                  'icon-ignore-placement': true,
                  'icon-anchor': 'bottom',
                }}
              />
            </Source>

            {/* ── ODP/ODC ── */}
            <Source id="devices" type="geojson" data={devicesGeoJSON} cluster={true} clusterMaxZoom={16} clusterRadius={55}>
              <Layer id="devices-clusters" type="circle"
                filter={['has', 'point_count']}
                layout={{ visibility: showPerangkat ? 'visible' : 'none' }}
                paint={{ 
                  'circle-color': '#22c55e', 
                  'circle-radius': ['step', ['get', 'point_count'], 16, 10, 24, 100, 32], 
                  'circle-stroke-width': 2, 
                  'circle-stroke-color': '#fff' 
                }}
              />
              <Layer id="devices-cluster-count" type="symbol"
                filter={['has', 'point_count']}
                layout={{
                  visibility: showPerangkat ? 'visible' : 'none',
                  'text-field': '{point_count_abbreviated}',
                  'text-size': 12,
                }}
                paint={{ 'text-color': '#ffffff' }}
              />
              <Layer id="devices-symbols" type="symbol"
                filter={['!', ['has', 'point_count']]}
                layout={{
                  visibility: showPerangkat ? 'visible' : 'none',
                  'icon-image': ['get', '_icon'],
                  'icon-size': 0.65,
                  'icon-allow-overlap': true,
                  'icon-ignore-placement': true,
                  'icon-anchor': 'bottom',
                }}
              />
            </Source>

            {/* ── Popup ── */}
            {selected && (
              <Popup longitude={selected.lon} latitude={selected.lat} anchor="bottom" closeButton={false} maxWidth="240px" onClose={() => setSelected(null)} offset={[0, -30]}>
                <div>
                  <div style={{
                    background: selected._type === 'tiang' ? '#f8fafc' : selected.type === 'ODC' ? '#fff7ed' : '#f0fdf4',
                    margin: '-10px -10px 8px', padding: '8px 12px', borderRadius: '10px 10px 0 0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <img src={selected._type === 'tiang' ? TIANG_B64 : selected.type === 'ODC' ? ODC_B64 : ODP_B64} alt="" style={{ width: 16, height: 16 }} />
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                          {selected._type === 'tiang' ? 'TIANG' : selected.type}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginTop: 1 }}>
                          {selected.pole_id || selected.device_id || '-'}
                        </div>
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

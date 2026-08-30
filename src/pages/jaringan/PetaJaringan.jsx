import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import Map, {
  Popup, Source, Layer, Marker,
  NavigationControl, GeolocateControl, FullscreenControl, ScaleControl
} from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapIcon, Search, X, Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import useSupercluster from 'use-supercluster'
import { TIANG_B64, ODP_B64, ODC_B64 } from './iconsBase64'

const EMPTY_STYLE = { 
  version: 8, 
  sources: {}, 
  layers: []
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
  
  // SPIDERFY STATE
  const [spiderfiedCoord, setSpiderfiedCoord] = useState(null)

  const [mapType, setMapType]             = useState('hybrid')
  const [showTiang, setShowTiang]         = useState(true)
  const [showPerangkat, setShowPerangkat] = useState(true)

  const [bounds, setBounds] = useState(null)
  const [zoom, setZoom] = useState(14)

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

  const updateBounds = useCallback(() => {
    if (mapRef.current) {
      const b = mapRef.current.getBounds()
      setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
      setZoom(mapRef.current.getZoom())
    }
  }, [])

  const onMapLoad = useCallback((e) => {
    setTimeout(() => geoControlRef.current?.trigger(), 800)
    updateBounds()
  }, [updateBounds])

  const points = useMemo(() => {
    let pts = []
    if (showTiang) {
      pts.push(...poles.map(p => ({
        type: 'Feature',
        properties: { cluster: false, _type: 'tiang', ...p },
        geometry: { type: 'Point', coordinates: [parseCoord(p.longitude), parseCoord(p.latitude)] }
      })))
    }
    if (showPerangkat) {
      pts.push(...devices.map(d => ({
        type: 'Feature',
        properties: { cluster: false, _type: 'device', ...d },
        geometry: { type: 'Point', coordinates: [parseCoord(d.longitude), parseCoord(d.latitude)] }
      })))
    }
    return pts
  }, [poles, devices, showTiang, showPerangkat])

  const { clusters, supercluster } = useSupercluster({
    points,
    bounds,
    zoom,
    options: { radius: 60, maxZoom: 16 }
  })

  const tiangCount = poles.length
  const odpCount   = devices.filter(d => d.type === 'ODP').length
  const odcCount   = devices.filter(d => d.type === 'ODC').length

  const center = poles.length > 0
    ? { longitude: parseCoord(poles[0].longitude), latitude: parseCoord(poles[0].latitude), zoom: 14 }
    : { longitude: 109.245, latitude: -7.427, zoom: 13 }

  // Group individual points to detect exact overlaps for Spiderfy
  const nonClusterPoints = clusters.filter(c => !c.properties.cluster)
  const pointGroups = {}
  nonClusterPoints.forEach(c => {
    const key = `${c.geometry.coordinates[0]},${c.geometry.coordinates[1]}`
    if (!pointGroups[key]) pointGroups[key] = []
    pointGroups[key].push(c)
  })

  return (
    <div className="page-container">
      <style>{`
        @keyframes pjSpin { to { transform: rotate(360deg); } }
        .maplibregl-ctrl-group { border-radius: 12px !important; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.2) !important; border: none !important; }
        .maplibregl-popup { z-index: 9999 !important; }
        .maplibregl-popup-content { border-radius: 16px !important; padding: 0 !important; box-shadow: 0 10px 40px rgba(0,0,0,0.4) !important; border: none !important; font-family: system-ui, -apple-system, sans-serif !important; -webkit-font-smoothing: antialiased; }
        .maplibregl-popup-tip { border-top-color: var(--bg-card, #fff) !important; }
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
            <p className="page-subtitle">MapLibre GL · Spiderfy Clustering</p>
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
            onMove={updateBounds}
            onZoom={updateBounds}
            onClick={() => { setSpiderfiedCoord(null); setSelected(null); }}
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

            {/* ── MACRO CLUSTERS ── */}
            {clusters.filter(c => c.properties.cluster).map(cluster => {
              const [longitude, latitude] = cluster.geometry.coordinates;
              const pointCount = cluster.properties.point_count;
              const size = Math.min(pointCount * 1.2 + 20, 50);
              
              return (
                <Marker key={`cluster-${cluster.id}`} latitude={latitude} longitude={longitude}>
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      const expansionZoom = Math.min(supercluster.getClusterExpansionZoom(cluster.id), 20);
                      mapRef.current?.flyTo({ center: [longitude, latitude], zoom: expansionZoom, duration: 600 });
                    }}
                    style={{
                      width: size, height: size,
                      background: 'rgba(59, 130, 246, 0.9)',
                      color: 'white', borderRadius: '50%',
                      display: 'flex', justifyContent: 'center', alignItems: 'center',
                      fontWeight: 'bold', fontSize: '13px',
                      border: '2px solid white', cursor: 'pointer',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                      transition: 'transform 0.1s'
                    }}
                    onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    {pointCount > 999 ? (pointCount / 1000).toFixed(1) + 'k' : pointCount}
                  </div>
                </Marker>
              );
            })}

            {/* ── INDIVIDUAL POINTS & SPIDERFY ── */}
            {Object.entries(pointGroups).flatMap(([key, pts]) => {
              const [lng, lat] = key.split(',').map(Number);
              const isSpiderfied = spiderfiedCoord === key;
              const total = pts.length;

              // If exact overlaps exist and not expanded, show a mini "Overlapping Group" marker
              if (total > 1 && !isSpiderfied) {
                return (
                  <Marker key={`group-${key}`} latitude={lat} longitude={lng} style={{ zIndex: 10 }}>
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSpiderfiedCoord(key);
                      }}
                      style={{
                        width: 28, height: 28, background: '#ef4444', color: 'white',
                        borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center',
                        fontWeight: 'bold', fontSize: 13, border: '2px solid white', cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                        transition: 'transform 0.2s'
                      }}
                      onMouseOver={e => e.currentTarget.style.transform = 'scale(1.15)'}
                      onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      {total}
                    </div>
                  </Marker>
                )
              }

              // Otherwise render the individual points (either single, or fan out spiderfied)
              return pts.map((pt, index) => {
                let offsetX = 0;
                let offsetY = 0;
                
                if (isSpiderfied && total > 1) {
                  const angle = (index / total) * Math.PI * 2;
                  // Increase radius based on number of items to prevent cramping
                  const radius = total > 5 ? 46 : (total > 3 ? 38 : 28);
                  offsetX = Math.cos(angle) * radius;
                  offsetY = Math.sin(angle) * radius;
                }

                const iconImg = pt.properties._type === 'tiang' ? TIANG_B64 : pt.properties.type === 'ODC' ? ODC_B64 : ODP_B64;
                const isSelected = selected && selected._type === pt.properties._type && selected.id === pt.properties.id;
                
                return (
                  <Marker key={`point-${pt.properties.id}`} latitude={lat} longitude={lng} style={{ zIndex: isSelected ? 50 : (isSpiderfied ? 20 : 1) }}>
                    <div style={{ position: 'relative', width: 0, height: 0 }}>
                      
                      {/* Spider Legs */}
                      {isSpiderfied && total > 1 && (
                        <svg style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none', zIndex: -1 }}>
                          <line x1={0} y1={0} x2={offsetX} y2={offsetY} stroke={isSelected ? '#3b82f6' : 'var(--bg-card, white)'} strokeWidth={isSelected ? '6' : '4'} opacity="0.9" />
                          <line x1={0} y1={0} x2={offsetX} y2={offsetY} stroke={isSelected ? '#60a5fa' : '#94a3b8'} strokeWidth="2" opacity="0.9" />
                        </svg>
                      )}

                      {/* Clickable Wrapper with Padding for Fat Thumbs */}
                      <div 
                        style={{
                          position: 'absolute',
                          left: 0, top: 0,
                          padding: '12px', // Massive invisible tap area
                          transform: `translate(calc(-50% + ${offsetX}px), calc(-100% + ${offsetY}px))`,
                          transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                          cursor: 'pointer',
                          display: 'flex', justifyContent: 'center', alignItems: 'center'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected({ lon: lng, lat, ...pt.properties });
                        }}
                      >
                        <img 
                          src={iconImg} 
                          alt={pt.properties._type} 
                          style={{ 
                            width: isSelected ? 42 : 28, height: isSelected ? 42 : 28,
                            filter: isSelected ? 'drop-shadow(0 0 12px rgba(59,130,246,1)) drop-shadow(0 0 24px rgba(59,130,246,0.8))' : 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))',
                            transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                          }} 
                        />
                      </div>
                    </div>
                  </Marker>
                )
              })
            })}

            {/* ── Popup ── */}
            {(() => {
              if (!selected) return null;
              
              // Calculate dynamic popup offset to follow spiderfied icons
              let popupOffset = [0, -45]; // Default height clearance for 40px selected icon
              const key = `${selected.lon},${selected.lat}`;
              const pts = pointGroups[key];
              
              if (pts && pts.length > 1 && spiderfiedCoord === key) {
                const idx = pts.findIndex(p => p.properties.id === selected.id && p.properties._type === selected._type);
                if (idx !== -1) {
                  const angle = (idx / pts.length) * Math.PI * 2;
                  const radius = pts.length > 5 ? 46 : (pts.length > 3 ? 38 : 28);
                  const ox = Math.cos(angle) * radius;
                  const oy = Math.sin(angle) * radius;
                  popupOffset = [ox, oy - 45];
                }
              }

              return (
                <Popup longitude={selected.lon} latitude={selected.lat} anchor="bottom" closeButton={false} closeOnClick={false} maxWidth="320px" offset={popupOffset}>
                  <div style={{ padding: '16px', width: '280px', color: 'var(--text-primary)', background: 'var(--bg-card)', borderRadius: '16px', lineHeight: '1.5' }}>
                  
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '10px', flexShrink: 0,
                        background: selected._type === 'tiang' ? 'rgba(148, 163, 184, 0.2)' : (selected.type === 'ODC' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), 0 2px 5px rgba(0,0,0,0.1)'
                      }}>
                        <img src={selected._type === 'tiang' ? TIANG_B64 : selected.type === 'ODC' ? ODC_B64 : ODP_B64} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                          {selected._type === 'tiang' ? 'Tiang Jaringan' : selected.type}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: '1.2' }}>
                          {selected._type === 'tiang' ? (selected.pole_id || '-') : (selected.device_id || '-')}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setSelected(null)} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '50%', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', marginTop: '-2px', marginRight: '-4px' }} onMouseOver={e => Object.assign(e.currentTarget.style, { background: 'var(--bg-card)', color: 'var(--text-primary)' })} onMouseOut={e => Object.assign(e.currentTarget.style, { background: 'var(--bg-secondary)', color: 'var(--text-secondary)' })}>
                      <X size={14} />
                    </button>
                  </div>
                  
                  {/* Body Fields */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    {(selected._type === 'tiang'
                      ? [['Site', selected.site], ['Desa', selected.desa], ['Jalan', selected.jalan], ['Kabupaten', selected.kabupaten], ['Status', selected.status], ['Keterangan', selected.keterangan]]
                      : [['Site', selected.site], ['Jenis Box', selected.box_type], ['Kapasitas', selected.capacity], ['Kabel Power', selected.power_cable_type], ['Core Power', selected.core_power], ['PON', selected.pon], ['Jarak ke OLT', selected.distance_to_olt], ['Tiang Induk', selected.parent_pole_id], ['Kecamatan', selected.kecamatan], ['Desa', selected.desa], ['Jalan', selected.jalan], ['Keterangan', selected.keterangan]]
                    ).filter(([, v]) => v && v !== '-').map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <span style={{ color: 'var(--text-secondary)', flexShrink: 0, fontWeight: 500 }}>{k}</span>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Footer Actions */}
                  <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <a href={`https://www.google.com/maps?q=${selected.lat},${selected.lon}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none', fontSize: '12px', padding: '6px 12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '20px', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}>
                      <MapIcon size={14} /> Buka di Maps
                    </a>
                  </div>
                </div>
              </Popup>
            ); })()}
          </Map>
        </div>
      )}
    </div>
  )
}

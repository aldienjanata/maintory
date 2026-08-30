import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  MapContainer, TileLayer, Marker, Popup, Polyline,
  CircleMarker, useMap, useMapEvents, LayerGroup, ZoomControl, ScaleControl
} from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import {
  Map as MapIcon, LocateFixed, Search, Maximize, Minimize,
  Layers, RotateCcw, Minus, Plus, Navigation, X, Settings2
} from 'lucide-react'

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const tiangIcon = new L.Icon({ iconUrl: '/icon_tiang.png', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -28] })
const odpIcon   = new L.Icon({ iconUrl: '/icon_odp.png',   iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -28] })
const odcIcon   = new L.Icon({ iconUrl: '/icon_odc.png',   iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -28] })

// ─── Map Controls Sub-component ───────────────────────────────────────────────
function MapControls({ userLocation, bearing, setBearing, onRotateReset }) {
  const map = useMap()

  // Pinch-rotate & mouse-rotate via leaflet-rotate plugin events
  useMapEvents({
    rotate(e) { setBearing(e.bearing || 0) }
  })

  const flyToUser = () => { if (userLocation) map.flyTo(userLocation, 17, { animate: true }) }
  const zoomIn  = () => map.zoomIn()
  const zoomOut = () => map.zoomOut()

  const resetBearing = () => {
    if (map.setBearing) { map.setBearing(0); setBearing(0) }
    onRotateReset()
  }

  return (
    <>
      {/* Compass / Rotate Reset - only visible when rotated */}
      {bearing !== 0 && (
        <button
          onClick={resetBearing}
          title="Reset Arah Utara"
          style={{
            position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000, background: 'white', border: 'none', borderRadius: '50%',
            width: '44px', height: '44px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', cursor: 'pointer'
          }}
        >
          <Navigation size={20} style={{ transform: `rotate(${-bearing}deg)`, color: '#e53e3e' }} />
        </button>
      )}

      {/* Zoom Controls */}
      <div style={{
        position: 'absolute', right: '12px', bottom: '120px', zIndex: 1000,
        display: 'flex', flexDirection: 'column', gap: '4px'
      }}>
        <button onClick={zoomIn}  title="Zoom In"  style={controlBtnStyle}><Plus size={18} /></button>
        <button onClick={zoomOut} title="Zoom Out" style={controlBtnStyle}><Minus size={18} /></button>
      </div>

      {/* Locate Me */}
      <button
        onClick={flyToUser}
        title="Lokasi Saya"
        style={{
          position: 'absolute', right: '12px', bottom: '60px', zIndex: 1000,
          ...controlBtnStyle, width: '44px', height: '44px',
          background: '#3b82f6', color: 'white',
          boxShadow: '0 2px 10px rgba(59,130,246,0.5)'
        }}
      >
        <LocateFixed size={20} />
      </button>
    </>
  )
}

const controlBtnStyle = {
  background: 'white', border: 'none', borderRadius: '8px',
  width: '44px', height: '44px', display: 'flex', alignItems: 'center',
  justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  cursor: 'pointer', color: '#333', fontWeight: 'bold', fontSize: '18px'
}

// ─── Search Bar Component ──────────────────────────────────────────────────────
function SearchBar({ onResult }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  const doSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`)
      const data = await res.json()
      setResults(data)
    } catch { setResults([]) }
    setSearching(false)
  }

  const clear = () => { setQuery(''); setResults([]) }

  return (
    <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        background: 'white', borderRadius: '24px', padding: '8px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)', border: '1px solid #e2e8f0'
      }}>
        <Search size={16} style={{ color: '#666', flexShrink: 0 }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="Cari lokasi..."
          style={{
            border: 'none', outline: 'none', flex: 1, fontSize: '14px',
            background: 'transparent', color: '#333'
          }}
        />
        {query && <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={14} color="#999" /></button>}
        {searching && <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #3b82f6', borderTop: '2px solid transparent', animation: 'spin 1s linear infinite' }} />}
      </div>
      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: '44px', left: 0, right: 0, zIndex: 2000,
          background: 'white', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          overflow: 'hidden', maxHeight: '200px', overflowY: 'auto'
        }}>
          {results.map(r => (
            <div
              key={r.place_id}
              onClick={() => { onResult([parseFloat(r.lat), parseFloat(r.lon)], r.display_name); setResults([]); setQuery(r.display_name.split(',')[0]) }}
              style={{ padding: '10px 14px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', color: '#333' }}
              onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseOut={e => e.currentTarget.style.background = 'white'}
            >
              <strong>{r.display_name.split(',')[0]}</strong>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{r.display_name.split(',').slice(1, 3).join(',')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── FlyTo Handler ────────────────────────────────────────────────────────────
function FlyToHandler({ target }) {
  const map = useMap()
  useEffect(() => { if (target) map.flyTo(target[0], target[1] || 16, { animate: true }) }, [target])
  return null
}

// ─── Rotate Handler (CSS transform trick for non-rotate builds) ────────────────
function RotateHandler({ setBearing }) {
  useMapEvents({
    // Leaflet doesn't support rotate natively — we listen for touches
    move() {}
  })
  return null
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function PetaJaringan() {
  const [poles, setPoles]         = useState([])
  const [devices, setDevices]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [userLocation, setUserLocation] = useState(null)
  const [flyTarget, setFlyTarget] = useState(null)
  const [bearing, setBearing]     = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef(null)

  // Map Controls State
  const [mapType, setMapType]         = useState('hybrid')
  const [showTiang, setShowTiang]     = useState(true)
  const [showPerangkat, setShowPerangkat] = useState(true)
  const [showLines, setShowLines]     = useState(true)
  const [showPanelExpanded, setShowPanelExpanded] = useState(false)

  useEffect(() => {
    fetchData()
    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        pos => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        err => console.warn('Geolocation error:', err),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      )
      return () => navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  // Fullscreen API
  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFSChange)
    return () => document.removeEventListener('fullscreenchange', onFSChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  const fetchData = async () => {
    try {
      const [polesRes, devicesRes] = await Promise.all([
        supabase.from('network_poles').select('*'),
        supabase.from('network_odp_odc').select('*')
      ])
      if (polesRes.data) setPoles(polesRes.data.filter(p => p.latitude && p.longitude))
      if (devicesRes.data) setDevices(devicesRes.data.filter(d => d.latitude && d.longitude))
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const center = userLocation || (poles.length > 0 ? [Number(poles[0].latitude), Number(poles[0].longitude)] : [-7.427, 109.245])

  const connections = useMemo(() => {
    if (!showLines) return []
    return devices.flatMap(device => {
      if (!device.parent_pole_id) return []
      const parent = poles.find(p => p.pole_id === device.parent_pole_id)
      if (!parent?.latitude || !parent?.longitude) return []
      return [{
        id: `conn-${device.device_id}`,
        positions: [[Number(device.latitude), Number(device.longitude)], [Number(parent.latitude), Number(parent.longitude)]],
        color: device.type === 'ODC' ? '#f97316' : '#22c55e'
      }]
    })
  }, [poles, devices, showLines])

  const handleSearchResult = useCallback((latlng, name) => {
    setFlyTarget([latlng, 16])
  }, [])

  // Stats
  const totalWithCoords = poles.length + devices.length
  const tiangCount    = poles.length
  const odpCount      = devices.filter(d => d.type === 'ODP').length
  const odcCount      = devices.filter(d => d.type === 'ODC').length

  const tileUrl = mapType === 'hybrid'
    ? "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
    : mapType === 'satellite'
    ? "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
    : "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"

  return (
    <div className="page-container">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .map-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 20px; font-size: 13px; cursor: pointer; border: 1.5px solid transparent; transition: all 0.15s; font-weight: 500; user-select: none; }
        .map-chip-active { background: #3b82f6; color: white; border-color: #3b82f6; }
        .map-chip-inactive { background: white; color: #444; border-color: #ddd; }
        .map-chip-inactive:hover { border-color: #3b82f6; color: #3b82f6; }
        .layer-btn-active { background: #eff6ff; color: #3b82f6; border-color: #3b82f6; }
        .map-control-panel { background: white; border-radius: 16px; padding: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.15); }
        .map-stats-pill { display: flex; align-items: center; gap: 8px; padding: 4px 12px; background: rgba(0,0,0,0.65); color: white; border-radius: 12px; font-size: 12px; backdrop-filter: blur(4px); }
        .map-stats-dot { width: 8px; height: 8px; border-radius: 50%; }
      `}</style>

      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="page-header" style={{ marginBottom: '12px' }}>
        <div className="page-header-left">
          <div className="page-icon"><MapIcon size={24} /></div>
          <div>
            <h1 className="page-title">Peta Jaringan</h1>
            <p className="page-subtitle">Visualisasi Geografis Real-time • {totalWithCoords} titik terdata</p>
          </div>
        </div>
      </div>

      {/* ─── Search Bar + Quick Stats ─────────────────────────── */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap' }}>
        <SearchBar onResult={handleSearchResult} />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span className="map-stats-pill" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
            <span className="map-stats-dot" style={{ background: '#888' }}></span> Tiang: {tiangCount}
          </span>
          <span className="map-stats-pill" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
            <span className="map-stats-dot" style={{ background: '#22c55e' }}></span> ODP: {odpCount}
          </span>
          <span className="map-stats-pill" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
            <span className="map-stats-dot" style={{ background: '#f97316' }}></span> ODC: {odcCount}
          </span>
        </div>
      </div>

      {/* ─── Layer Controls (Google Maps style bottom toolbar) ── */}
      <div style={{
        display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px',
        overflowX: 'auto', paddingBottom: '4px',
        scrollbarWidth: 'none', msOverflowStyle: 'none'
      }}>
        {/* Map Type */}
        <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '24px', padding: '4px', gap: '2px', flexShrink: 0 }}>
          {[
            { key: 'roadmap', label: '🗺️ Jalan' },
            { key: 'hybrid', label: '🛰️ Satelit' },
            { key: 'satellite', label: '🌍 Foto' },
          ].map(m => (
            <button key={m.key} onClick={() => setMapType(m.key)}
              style={{
                padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', transition: 'all 0.15s',
                background: mapType === m.key ? '#3b82f6' : 'transparent',
                color: mapType === m.key ? 'white' : 'var(--text-secondary)',
              }}
            >{m.label}</button>
          ))}
        </div>

        <div style={{ width: '1px', height: '28px', background: 'var(--border-color)', flexShrink: 0 }} />

        {/* Layer Toggles */}
        {[
          { key: 'tiang', label: '📡 Tiang', state: showTiang, set: setShowTiang, color: '#6b7280' },
          { key: 'perangkat', label: '📦 ODP/ODC', state: showPerangkat, set: setShowPerangkat, color: '#22c55e' },
          { key: 'lines', label: '〰️ Garis', state: showLines, set: setShowLines, color: '#3b82f6' },
        ].map(l => (
          <button key={l.key} onClick={() => l.set(!l.state)}
            style={{
              padding: '7px 14px', borderRadius: '20px', border: `1.5px solid ${l.state ? l.color : 'var(--border-color)'}`,
              cursor: 'pointer', fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', transition: 'all 0.15s',
              background: l.state ? l.color + '15' : 'var(--bg-card)',
              color: l.state ? l.color : 'var(--text-secondary)',
              flexShrink: 0,
            }}
          >{l.label}</button>
        ))}
      </div>

      {/* ─── Map Container ──────────────────────────────────── */}
      {loading ? (
        <div className="loading-screen" style={{ height: '400px' }}>
          <div className="spinner"></div>
          <p className="text-secondary mt-2">Memuat peta & data jaringan...</p>
        </div>
      ) : (
        <div ref={containerRef} style={{
          height: 'calc(100vh - 280px)', minHeight: '500px',
          borderRadius: '16px', overflow: 'hidden', position: 'relative',
          border: '1px solid var(--border-color)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)'
        }}>

          {/* Fullscreen Button (outside map, top-right of container) */}
          <button onClick={toggleFullscreen} title={isFullscreen ? 'Keluar Fullscreen' : 'Fullscreen'}
            style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1001, ...controlBtnStyle }}>
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>

          <MapContainer
            center={center}
            zoom={userLocation ? 17 : 14}
            maxZoom={22}
            zoomControl={false}
            style={{ height: '100%', width: '100%' }}
            // Gesture handling for mobile two-finger pan
            touchZoom={true}
            doubleClickZoom={true}
            scrollWheelZoom={true}
            dragging={true}
            keyboard={true}
          >
            <FlyToHandler target={flyTarget} />
            <MapControls userLocation={userLocation} bearing={bearing} setBearing={setBearing} onRotateReset={() => setBearing(0)} />
            <ScaleControl position="bottomleft" />

            {/* Tile Layer */}
            <TileLayer
              key={mapType}
              attribution='&copy; Google Maps'
              url={tileUrl}
              maxZoom={22}
              maxNativeZoom={20}
            />

            {/* Tiang Markers */}
            {showTiang && (
              <MarkerClusterGroup chunkedLoading maxClusterRadius={50} disableClusteringAtZoom={17}>
                {poles.map(pole => (
                  <Marker key={pole.id} position={[Number(pole.latitude), Number(pole.longitude)]} icon={tiangIcon}>
                    <Popup>
                      <div style={{ minWidth: '190px', fontFamily: 'system-ui, sans-serif' }}>
                        <div style={{ background: '#f8fafc', margin: '-13px -13px 10px', padding: '10px 13px', borderBottom: '1px solid #e2e8f0', borderRadius: '8px 8px 0 0' }}>
                          <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>🗼 TIANG</span>
                          <div style={{ fontWeight: '700', fontSize: '15px', color: '#1e293b' }}>{pole.pole_id}</div>
                        </div>
                        {[['Site', pole.site], ['Desa', pole.desa], ['Jalan', pole.jalan || '-'], ['Kab/Prov', `${pole.kabupaten || '-'} / ${pole.provinsi || '-'}`], ['Status', pole.status || '-'], ['Keterangan', pole.keterangan || '-']].map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '12px', borderBottom: '1px solid #f1f5f9', color: '#334155' }}>
                            <span style={{ color: '#64748b', fontWeight: '500' }}>{k}</span>
                            <span style={{ fontWeight: '600', maxWidth: '120px', textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MarkerClusterGroup>
            )}

            {/* ODP/ODC Markers */}
            {showPerangkat && (
              <MarkerClusterGroup chunkedLoading maxClusterRadius={50} disableClusteringAtZoom={17}>
                {devices.map(device => (
                  <Marker key={device.id} position={[Number(device.latitude), Number(device.longitude)]} icon={device.type === 'ODC' ? odcIcon : odpIcon}>
                    <Popup>
                      <div style={{ minWidth: '190px', fontFamily: 'system-ui, sans-serif' }}>
                        <div style={{ background: device.type === 'ODC' ? '#fff7ed' : '#f0fdf4', margin: '-13px -13px 10px', padding: '10px 13px', borderBottom: '1px solid #e2e8f0', borderRadius: '8px 8px 0 0' }}>
                          <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: device.type === 'ODC' ? '#ea580c' : '#16a34a' }}>📦 {device.type}</span>
                          <div style={{ fontWeight: '700', fontSize: '15px', color: '#1e293b' }}>{device.device_id}</div>
                        </div>
                        {[['Site', device.site], ['Desa', device.desa], ['Jalan', device.jalan || '-'], ['Kapasitas', `${device.capacity || '-'} Port`], ['Tiang Induk', device.parent_pole_id || '-'], ['Keterangan', device.keterangan || '-']].map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '12px', borderBottom: '1px solid #f1f5f9', color: '#334155' }}>
                            <span style={{ color: '#64748b', fontWeight: '500' }}>{k}</span>
                            <span style={{ fontWeight: '600', maxWidth: '120px', textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MarkerClusterGroup>
            )}

            {/* Connection Lines */}
            {showLines && (
              <LayerGroup>
                {connections.map(line => (
                  <Polyline key={line.id} positions={line.positions} color={line.color} weight={2.5} opacity={0.65} dashArray="8,5" />
                ))}
              </LayerGroup>
            )}

            {/* User Location (Google Maps blue dot style) */}
            {userLocation && (
              <LayerGroup>
                <CircleMarker center={userLocation} radius={18} pathOptions={{ color: 'transparent', fillColor: '#3b82f6', fillOpacity: 0.18 }} />
                <CircleMarker center={userLocation} radius={8} pathOptions={{ color: 'white', fillColor: '#3b82f6', fillOpacity: 1, weight: 3 }}>
                  <Popup>📍 Posisi Anda Saat Ini</Popup>
                </CircleMarker>
              </LayerGroup>
            )}
          </MapContainer>
        </div>
      )}
    </div>
  )
}

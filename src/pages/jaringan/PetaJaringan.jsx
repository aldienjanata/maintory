import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import Map, {
  Popup, Source, Layer,
  NavigationControl, GeolocateControl, FullscreenControl, ScaleControl
} from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapIcon, Search, X } from 'lucide-react'

// ── Tile Style Definitions ─────────────────────────────────────────────────────
const STYLES = {
  roadmap: 'https://tiles.openfreemap.org/styles/liberty', // Vector: Sharp HD forever
  hybrid: {                                                  // Satelit + Label Google
    version: 8,
    sources: {
      satellite: { type: 'raster', tiles: ['https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'], tileSize: 256, maxzoom: 20 }
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }]
  },
  photo: {                                                   // Foto Murni (tanpa label)
    version: 8,
    sources: {
      satellite: { type: 'raster', tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'], tileSize: 256, maxzoom: 20 }
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }]
  }
}

// ── Search Bar ─────────────────────────────────────────────────────────────────
function SearchBar({ onResult }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)

  const search = async () => {
    if (!query.trim()) return
    setBusy(true)
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=id`)
      setResults(await r.json())
    } catch { setResults([]) }
    setBusy(false)
  }

  return (
    <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', borderRadius: 24, padding: '8px 14px', border: '1px solid var(--border-color)', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
        <Search size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Cari lokasi di peta..."
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: 14, background: 'transparent', color: 'var(--text-primary)' }}
        />
        {query && <button onClick={() => { setQuery(''); setResults([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)' }}><X size={14} /></button>}
        {busy && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #3b82f6', borderTop: '2px solid transparent', animation: 'mapSpin 1s linear infinite', flexShrink: 0 }} />}
      </div>
      {results.length > 0 && (
        <div style={{ position: 'absolute', top: 46, left: 0, right: 0, zIndex: 9999, background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
          {results.map(r => (
            <div key={r.place_id}
              onClick={() => { onResult([parseFloat(r.lat), parseFloat(r.lon)]); setResults([]); setQuery(r.display_name.split(',')[0]) }}
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
  const [iconsReady, setIconsReady] = useState(false)
  const [selected, setSelected] = useState(null)   // { lon, lat, ...props }

  // Map state
  const [mapType, setMapType]             = useState('hybrid')
  const [showTiang, setShowTiang]         = useState(true)
  const [showPerangkat, setShowPerangkat] = useState(true)
  const [showLines, setShowLines]         = useState(true)

  // ── Data fetch ──────────────────────────────────────────────────────────────
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

  // ── Load custom icons into MapLibre ────────────────────────────────────────
  const onMapLoad = useCallback((e) => {
    const map = e.target
    let done = 0
    const icons = [
      ['icon-tiang', '/icon_tiang.png'],
      ['icon-odp',   '/icon_odp.png'],
      ['icon-odc',   '/icon_odc.png'],
    ]
    icons.forEach(([name, url]) => {
      map.loadImage(url, (err, img) => {
        if (!err && !map.hasImage(name)) map.addImage(name, img)
        if (++done === icons.length) setIconsReady(true)
      })
    })
  }, [])

  // ── GeoJSON Sources ─────────────────────────────────────────────────────────
  const polesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: poles.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(p.longitude), Number(p.latitude)] },
      properties: { ...p, _type: 'tiang' }
    }))
  }), [poles])

  const devicesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: devices.map(d => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(d.longitude), Number(d.latitude)] },
      properties: { ...d, _type: 'device', _icon: d.type === 'ODC' ? 'icon-odc' : 'icon-odp' }
    }))
  }), [devices])

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

  // ── Click handler ────────────────────────────────────────────────────────────
  const onClick = useCallback((e) => {
    const fs = e.features
    if (!fs?.length) { setSelected(null); return }
    const f = fs[0]
    if (f.properties?.point_count) {
      // Cluster clicked — zoom in
      mapRef.current?.flyTo({ center: f.geometry.coordinates, zoom: mapRef.current.getZoom() + 3 })
      return
    }
    if (f.properties?._type) {
      setSelected({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], ...f.properties })
    }
  }, [])

  // ── Derived stats ────────────────────────────────────────────────────────────
  const tiangCount = poles.length
  const odpCount   = devices.filter(d => d.type === 'ODP').length
  const odcCount   = devices.filter(d => d.type === 'ODC').length

  const center = poles.length > 0
    ? { longitude: Number(poles[0].longitude), latitude: Number(poles[0].latitude), zoom: 14, pitch: 0, bearing: 0 }
    : { longitude: 109.245, latitude: -7.427, zoom: 13, pitch: 0, bearing: 0 }

  const interactive = iconsReady ? ['poles-symbols', 'poles-clusters', 'devices-symbols', 'devices-clusters'] : []

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      <style>{`
        @keyframes mapSpin { to { transform: rotate(360deg); } }
        .maplibregl-ctrl-bottom-right { bottom: 8px !important; right: 8px !important; }
        .maplibregl-ctrl-top-right { top: 8px !important; right: 8px !important; }
        .maplibregl-ctrl-group { border-radius: 12px !important; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.18) !important; border: none !important; }
        .maplibregl-ctrl button { border-radius: 0 !important; }
        .maplibregl-popup-content { border-radius: 12px !important; padding: 10px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important; border: 1px solid #e2e8f0 !important; }
        .maplibregl-popup-tip { display: none !important; }
      `}</style>

      {/* Header */}
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div className="page-header-left">
          <div className="page-icon"><MapIcon size={24} /></div>
          <div>
            <h1 className="page-title">Peta Jaringan</h1>
            <p className="page-subtitle">MapLibre GL · WebGL · Rotasi & Tilt 3D</p>
          </div>
        </div>
      </div>

      {/* Search + Stats Row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchBar onResult={([lat, lon]) => mapRef.current?.flyTo({ center: [lon, lat], zoom: 16 })} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['#6b7280', `Tiang: ${tiangCount}`], ['#22c55e', `ODP: ${odpCount}`], ['#f97316', `ODC: ${odcCount}`]].map(([color, label]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />{label}
            </span>
          ))}
        </div>
      </div>

      {/* Controls Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
        {/* Map type pill switcher */}
        <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 24, padding: 4, gap: 2, flexShrink: 0 }}>
          {[{ k: 'roadmap', l: '🗺️ Jalan (HD Vector)' }, { k: 'hybrid', l: '🛰️ Satelit' }, { k: 'photo', l: '📷 Foto' }].map(({ k, l }) => (
            <button key={k} onClick={() => { setMapType(k); setSelected(null) }}
              style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', transition: 'all 0.15s', background: mapType === k ? '#3b82f6' : 'transparent', color: mapType === k ? 'white' : 'var(--text-secondary)' }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 28, background: 'var(--border-color)', alignSelf: 'center', flexShrink: 0 }} />

        {/* Layer toggles */}
        {[
          { key: 'tiang', label: '📡 Tiang', state: showTiang, set: setShowTiang, color: '#6b7280' },
          { key: 'perangkat', label: '📦 ODP/ODC', state: showPerangkat, set: setShowPerangkat, color: '#22c55e' },
          { key: 'lines', label: '〰️ Garis', state: showLines, set: setShowLines, color: '#3b82f6' },
        ].map(l => (
          <button key={l.key} onClick={() => l.set(!l.state)}
            style={{ padding: '7px 14px', borderRadius: 20, border: `1.5px solid ${l.state ? l.color : 'var(--border-color)'}`, cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', background: l.state ? l.color + '18' : 'var(--bg-card)', color: l.state ? l.color : 'var(--text-secondary)', flexShrink: 0, transition: 'all 0.15s' }}>
            {l.label}
          </button>
        ))}
      </div>

      {/* Map */}
      {loading ? (
        <div className="loading-screen" style={{ height: 400 }}>
          <div className="spinner" />
          <p className="text-secondary mt-2">Memuat MapLibre GL & data jaringan...</p>
        </div>
      ) : (
        <div style={{ height: 'calc(100vh - 290px)', minHeight: 500, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
          <Map
            ref={mapRef}
            initialViewState={center}
            mapStyle={STYLES[mapType]}
            onLoad={onMapLoad}
            onClick={onClick}
            interactiveLayerIds={interactive}
            maxZoom={22}
            style={{ width: '100%', height: '100%' }}
          >
            {/* ── Built-in Controls (Google Maps style) ── */}
            {/* NavigationControl: zoom + 나침반 rotate + tilt */}
            <NavigationControl position="bottom-right" visualizePitch showCompass showZoom />
            {/* GeolocateControl: titik biru GPS realtime */}
            <GeolocateControl position="bottom-right" trackUserLocation showUserHeading showAccuracyCircle fitBoundsOptions={{ maxZoom: 17 }} />
            {/* Fullscreen */}
            <FullscreenControl position="top-right" />
            {/* Scale bar */}
            <ScaleControl position="bottom-left" unit="metric" />

            {/* ── Connection Lines ── */}
            <Source id="lines" type="geojson" data={linesGeoJSON}>
              <Layer id="lines-layer" type="line"
                paint={{ 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.6, 'line-dasharray': [3, 3] }}
              />
            </Source>

            {/* ── Tiang Layer ── */}
            {showTiang && iconsReady && (
              <Source id="poles" type="geojson" data={polesGeoJSON} cluster={true} clusterMaxZoom={16} clusterRadius={50}>
                {/* Cluster circles */}
                <Layer id="poles-clusters" type="circle" filter={['has', 'point_count']}
                  paint={{ 'circle-color': '#6b7280', 'circle-radius': ['step', ['get', 'point_count'], 18, 10, 26, 100, 34], 'circle-opacity': 0.85, 'circle-stroke-width': 2, 'circle-stroke-color': 'white' }}
                />
                <Layer id="poles-cluster-count" type="symbol" filter={['has', 'point_count']}
                  layout={{ 'text-field': '{point_count_abbreviated}', 'text-size': 12, 'text-font': ['Noto Sans Bold', 'Open Sans Bold'] }}
                  paint={{ 'text-color': '#fff' }}
                />
                {/* Individual markers */}
                <Layer id="poles-symbols" type="symbol" filter={['!', ['has', 'point_count']]}
                  layout={{ 'icon-image': 'icon-tiang', 'icon-size': 0.7, 'icon-allow-overlap': true, 'icon-anchor': 'bottom' }}
                />
              </Source>
            )}

            {/* ── ODP/ODC Layer ── */}
            {showPerangkat && iconsReady && (
              <Source id="devices" type="geojson" data={devicesGeoJSON} cluster={true} clusterMaxZoom={16} clusterRadius={50}>
                <Layer id="devices-clusters" type="circle" filter={['has', 'point_count']}
                  paint={{ 'circle-color': '#22c55e', 'circle-radius': ['step', ['get', 'point_count'], 18, 10, 26, 100, 34], 'circle-opacity': 0.85, 'circle-stroke-width': 2, 'circle-stroke-color': 'white' }}
                />
                <Layer id="devices-cluster-count" type="symbol" filter={['has', 'point_count']}
                  layout={{ 'text-field': '{point_count_abbreviated}', 'text-size': 12, 'text-font': ['Noto Sans Bold', 'Open Sans Bold'] }}
                  paint={{ 'text-color': '#fff' }}
                />
                <Layer id="devices-symbols" type="symbol" filter={['!', ['has', 'point_count']]}
                  layout={{ 'icon-image': ['get', '_icon'], 'icon-size': 0.7, 'icon-allow-overlap': true, 'icon-anchor': 'bottom' }}
                />
              </Source>
            )}

            {/* ── Popup ── */}
            {selected && (
              <Popup longitude={selected.lon} latitude={selected.lat} anchor="bottom" closeButton={false} maxWidth="230px" onClose={() => setSelected(null)}>
                <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  {/* Header */}
                  <div style={{
                    background: selected._type === 'tiang' ? '#f8fafc' : selected.type === 'ODC' ? '#fff7ed' : '#f0fdf4',
                    margin: '-10px -10px 8px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
                        {selected._type === 'tiang' ? '🗼 TIANG' : `📦 ${selected.type}`}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginTop: 2 }}>
                        {selected.pole_id || selected.device_id || '-'}
                      </div>
                    </div>
                    <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, marginLeft: 8, flexShrink: 0 }}>
                      <X size={14} color="#94a3b8" />
                    </button>
                  </div>
                  {/* Fields */}
                  {(selected._type === 'tiang'
                    ? [['Site', selected.site], ['Desa', selected.desa], ['Jalan', selected.jalan || '-'], ['Kab.', selected.kabupaten || '-'], ['Status', selected.status || '-'], ['Ket.', selected.keterangan || '-']]
                    : [['Site', selected.site], ['Desa', selected.desa], ['Kapasitas', `${selected.capacity || '-'} Port`], ['Tiang Induk', selected.parent_pole_id || '-'], ['Ket.', selected.keterangan || '-']]
                  ).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, borderBottom: '1px solid #f1f5f9', gap: 8 }}>
                      <span style={{ color: '#64748b', flexShrink: 0 }}>{k}</span>
                      <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word', maxWidth: 140 }}>{v}</span>
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

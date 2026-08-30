import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { Map as MapIcon, LocateFixed, Layers, Image as ImageIcon } from 'lucide-react'

// Fix Leaflet's default icon path issue with Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Gunakan icon dari public folder yang sudah ada
const tiangIcon = new L.Icon({
  iconUrl: '/icon_tiang.png',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

const odpIcon = new L.Icon({
  iconUrl: '/icon_odp.png',
  iconSize: [28, 28],
  iconAnchor: [14, 28], 
  popupAnchor: [0, -28],
});

const odcIcon = new L.Icon({
  iconUrl: '/icon_odc.png',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

// Custom Control component to re-center map to user location
function LocationButton({ position }) {
  const map = useMap()
  return (
    <button
      onClick={(e) => {
        e.preventDefault()
        if (position) map.flyTo(position, 18)
      }}
      className="btn btn-primary"
      style={{
        position: 'absolute', 
        bottom: '30px', 
        right: '20px', 
        zIndex: 1000,
        borderRadius: '50%',
        width: '48px',
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
        padding: 0
      }}
      title="Kembali ke Lokasi Saya"
    >
      <LocateFixed size={24} color="white" />
    </button>
  )
}

export default function PetaJaringan() {
  const [poles, setPoles] = useState([])
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [userLocation, setUserLocation] = useState(null)

  // Map Controls State
  const [mapType, setMapType] = useState('hybrid') // 'standard' | 'hybrid'
  const [showTiang, setShowTiang] = useState(true)
  const [showPerangkat, setShowPerangkat] = useState(true)
  const [showLines, setShowLines] = useState(true)

  useEffect(() => {
    fetchData()

    // Lacak lokasi pengguna secara real-time
    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation([pos.coords.latitude, pos.coords.longitude])
        },
        (err) => console.warn('Geolocation error:', err),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
      )
      return () => navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  const fetchData = async () => {
    try {
      const [polesRes, devicesRes] = await Promise.all([
        supabase.from('network_poles').select('*'),
        supabase.from('network_odp_odc').select('*')
      ])

      if (polesRes.data) setPoles(polesRes.data.filter(p => p.latitude && p.longitude))
      if (devicesRes.data) setDevices(devicesRes.data.filter(d => d.latitude && d.longitude))
    } catch (err) {
      console.error('Error fetching map data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Tentukan titik tengah awal: prioritas lokasi user, lalu pole pertama, lalu default
  const center = userLocation || (poles.length > 0 ? [Number(poles[0].latitude), Number(poles[0].longitude)] : [-7.427, 109.245])

  // Pre-calculate lines connecting ODP to their parent Poles
  const connections = useMemo(() => {
    if (!showLines) return [] // Hanya kalkulasi jika ingin ditampilkan untuk ringankan CPU
    
    const lines = []
    devices.forEach(device => {
      if (device.parent_pole_id) {
        const parentPole = poles.find(p => p.pole_id === device.parent_pole_id)
        if (parentPole && parentPole.latitude && parentPole.longitude) {
          lines.push({
            id: `conn-${device.device_id}`,
            positions: [
              [Number(device.latitude), Number(device.longitude)],
              [Number(parentPole.latitude), Number(parentPole.longitude)]
            ],
            color: device.type === 'ODC' ? '#f97316' : '#22c55e' // Orange for ODC, Green for ODP
          })
        }
      }
    })
    return lines
  }, [poles, devices, showLines])

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="page-header" style={{ marginBottom: 0, paddingBottom: '16px' }}>
        <div className="page-header-left">
          <div className="page-icon">
            <MapIcon size={24} />
          </div>
          <div>
            <h1 className="page-title">Peta Jaringan</h1>
            <p className="page-subtitle">Visualisasi Geografis Resolusi Tinggi</p>
          </div>
        </div>
      </div>

      {/* Custom Control Panel Terpisah (UI Percantik) */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '20px',
        padding: '12px 20px',
        backgroundColor: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-color)',
        alignItems: 'center'
      }}>
        
        {/* Pilihan Mode Peta */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 'bold', marginRight: '8px', color: 'var(--text-secondary)' }}>
            MODE PETA:
          </span>
          <button 
            onClick={() => setMapType('standard')}
            className={`btn ${mapType === 'standard' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}
          >
            <MapIcon size={14} /> Peta Jalan
          </button>
          <button 
            onClick={() => setMapType('hybrid')}
            className={`btn ${mapType === 'hybrid' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}
          >
            <ImageIcon size={14} /> Satelit HD (Google Maps)
          </button>
        </div>

        <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-color)', display: 'block' }}></div>

        {/* Pilihan Tampilan Data */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 'bold', marginRight: '4px', color: 'var(--text-secondary)' }}>
            TAMPILKAN:
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
            <input 
              type="checkbox" 
              checked={showTiang} 
              onChange={e => setShowTiang(e.target.checked)} 
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            Titik Tiang
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
            <input 
              type="checkbox" 
              checked={showPerangkat} 
              onChange={e => setShowPerangkat(e.target.checked)} 
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            Titik ODP & ODC
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
            <input 
              type="checkbox" 
              checked={showLines} 
              onChange={e => setShowLines(e.target.checked)} 
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            Garis Tarikan
          </label>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen" style={{ flex: 1 }}>
          <div className="spinner"></div>
          <p className="text-secondary mt-2">Memuat peta & clustering data...</p>
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer 
            center={center} 
            zoom={userLocation ? 17 : 14} 
            maxZoom={21} // Google Maps support deep zoom
            style={{ height: '100%', width: '100%', zIndex: 1 }}
          >
            
            {/* Tombol kembali ke lokasi saya */}
            <LocationButton position={userLocation} />

            {/* Google Maps Layer (Satelit Hybrid atau Standar) */}
            <TileLayer
              attribution='&copy; Google Maps'
              url={mapType === 'hybrid' 
                ? "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" 
                : "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
              }
              maxZoom={21}
            />

            {/* Data Tiang Layer dengan Clustering (Anti Lag) */}
            {showTiang && (
              <MarkerClusterGroup chunkedLoading maxClusterRadius={40}>
                {poles.map(pole => (
                  <Marker 
                    key={pole.id} 
                    position={[Number(pole.latitude), Number(pole.longitude)]}
                    icon={tiangIcon}
                  >
                    <Popup>
                      <div style={{ minWidth: '180px' }}>
                        <h4 style={{ margin: '0 0 8px 0', borderBottom: '1px solid #ccc', paddingBottom: '4px' }}>{pole.pole_id}</h4>
                        <p style={{ margin: '2px 0' }}><strong>Site:</strong> {pole.site}</p>
                        <p style={{ margin: '2px 0' }}><strong>Desa:</strong> {pole.desa}</p>
                        <p style={{ margin: '2px 0' }}><strong>Jalan:</strong> {pole.jalan || '-'}</p>
                        <p style={{ margin: '2px 0' }}><strong>Prov/Kab:</strong> {pole.provinsi || '-'} / {pole.kabupaten || '-'}</p>
                        <p style={{ margin: '2px 0' }}><strong>Keterangan:</strong> {pole.keterangan || '-'}</p>
                        <p style={{ margin: '2px 0' }}><strong>Status:</strong> {pole.status || '-'}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MarkerClusterGroup>
            )}

            {/* Data ODP & ODC Layer dengan Clustering (Anti Lag) */}
            {showPerangkat && (
              <MarkerClusterGroup chunkedLoading maxClusterRadius={40}>
                {devices.map(device => {
                  const dIcon = device.type === 'ODC' ? odcIcon : odpIcon
                  return (
                    <Marker 
                      key={device.id} 
                      position={[Number(device.latitude), Number(device.longitude)]}
                      icon={dIcon}
                    >
                      <Popup>
                        <div style={{ minWidth: '180px' }}>
                          <h4 style={{ margin: '0 0 8px 0', borderBottom: '1px solid #ccc', paddingBottom: '4px' }}>{device.device_id} ({device.type})</h4>
                          <p style={{ margin: '2px 0' }}><strong>Site:</strong> {device.site}</p>
                          <p style={{ margin: '2px 0' }}><strong>Desa:</strong> {device.desa}</p>
                          <p style={{ margin: '2px 0' }}><strong>Jalan:</strong> {device.jalan || '-'}</p>
                          <p style={{ margin: '2px 0' }}><strong>Kapasitas:</strong> {device.capacity || '-'} Port</p>
                          <p style={{ margin: '2px 0' }}><strong>Tiang Induk:</strong> {device.parent_pole_id || '-'}</p>
                          <p style={{ margin: '2px 0' }}><strong>Keterangan:</strong> {device.keterangan || '-'}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )
                })}
              </MarkerClusterGroup>
            )}

            {/* Garis Koneksi Layer */}
            {showLines && (
              <LayerGroup>
                {connections.map(line => (
                  <Polyline 
                    key={line.id} 
                    positions={line.positions} 
                    color={line.color} 
                    weight={3}
                    opacity={0.7}
                    dashArray="8, 6"
                  />
                ))}
              </LayerGroup>
            )}

            {/* Titik Lokasi Pengguna Layer */}
            {userLocation && (
              <LayerGroup>
                <CircleMarker 
                  center={userLocation}
                  radius={8}
                  pathOptions={{ color: '#ffffff', fillColor: '#3b82f6', fillOpacity: 1, weight: 3 }}
                >
                  <Popup>Posisi Anda Saat Ini</Popup>
                </CircleMarker>
                <CircleMarker 
                  center={userLocation}
                  radius={18}
                  pathOptions={{ color: 'transparent', fillColor: '#3b82f6', fillOpacity: 0.2 }}
                />
              </LayerGroup>
            )}
          </MapContainer>
        </div>
      )}
    </div>
  )
}

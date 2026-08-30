import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { MapContainer, TileLayer, Marker, Popup, LayersControl, LayerGroup, Polyline, CircleMarker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { Map, LocateFixed } from 'lucide-react'

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
  iconAnchor: [14, 28], // Ujung bawah gambar menunjuk ke titik
  popupAnchor: [0, -28],
});

const odpIcon = new L.Icon({
  iconUrl: '/icon_odp.png',
  iconSize: [28, 28],
  iconAnchor: [14, 28], 
  popupAnchor: [0, -28],
});

const odcIcon = new L.Icon({
  iconUrl: '/icon_odc.png', // Fallback to odp if odc image not ideal, tapi user bilang ada icon_odc
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
        if (position) map.flyTo(position, 17)
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
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
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
  }, [poles, devices])

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-icon">
            <Map size={24} />
          </div>
          <div>
            <h1 className="page-title">Peta Jaringan</h1>
            <p className="page-subtitle">Peta Interaktif Lokasi Tiang dan Perangkat FO</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner"></div>
          <p className="text-secondary mt-2">Memuat peta...</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, height: 'calc(100vh - 160px)', overflow: 'hidden', position: 'relative' }}>
          <MapContainer center={center} zoom={userLocation ? 16 : 13} style={{ height: '100%', width: '100%', zIndex: 1 }}>
            
            {/* Tombol kembali ke lokasi saya */}
            <LocationButton position={userLocation} />

            <LayersControl position="topright">
              {/* Standard Map */}
              <LayersControl.BaseLayer checked name="Peta Standar (Google Style)">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              
              {/* Satellite Map */}
              <LayersControl.BaseLayer name="Satelit (Esri)">
                <TileLayer
                  attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              </LayersControl.BaseLayer>

              {/* Data Tiang Layer */}
              <LayersControl.Overlay checked name="Titik Tiang">
                <LayerGroup>
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
                </LayerGroup>
              </LayersControl.Overlay>

              {/* Data ODP & ODC Layer */}
              <LayersControl.Overlay checked name="Titik ODP & ODC">
                <LayerGroup>
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
                </LayerGroup>
              </LayersControl.Overlay>

              {/* Garis Koneksi Layer */}
              <LayersControl.Overlay checked name="Garis Tarikan (ODP ke Tiang)">
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
              </LayersControl.Overlay>

              {/* Titik Lokasi Pengguna Layer */}
              {userLocation && (
                <LayersControl.Overlay checked name="Lokasi Anda (Biru)">
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
                </LayersControl.Overlay>
              )}
            </LayersControl>
          </MapContainer>
        </div>
      )}
    </div>
  )
}

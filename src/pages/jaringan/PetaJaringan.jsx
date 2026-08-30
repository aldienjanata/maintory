import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { MapContainer, TileLayer, Marker, Popup, LayersControl, LayerGroup, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { Map } from 'lucide-react'

// Fix Leaflet's default icon path issue with Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Icons for better distinction
const createIcon = (color) => {
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
}

const tiangIcon = createIcon('grey');
const odpIcon = createIcon('green');
const odcIcon = createIcon('orange');
const otherIcon = createIcon('blue');

export default function PetaJaringan() {
  const [poles, setPoles] = useState([])
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
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

  // Find center based on first pole or default to Purwokerto/Banyumas
  const center = poles.length > 0 ? [Number(poles[0].latitude), Number(poles[0].longitude)] : [-7.427, 109.245]

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
            <p className="page-subtitle">Visualisasi Geografis Tiang, ODP, dan ODC</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner"></div>
          <p className="text-secondary mt-2">Memuat peta...</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, height: 'calc(100vh - 160px)', overflow: 'hidden' }}>
          <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
            <LayersControl position="topright">
              {/* Standard Map */}
              <LayersControl.BaseLayer checked name="Peta Standar (OSM)">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              
              {/* Satellite Map */}
              <LayersControl.BaseLayer name="Satelit (Esri Imagery)">
                <TileLayer
                  attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              </LayersControl.BaseLayer>

              {/* Data Tiang Layer */}
              <LayersControl.Overlay checked name="Data Tiang">
                <LayerGroup>
                  {poles.map(pole => (
                    <Marker 
                      key={pole.id} 
                      position={[Number(pole.latitude), Number(pole.longitude)]}
                      icon={tiangIcon}
                    >
                      <Popup>
                        <strong>{pole.pole_id}</strong><br/>
                        Site: {pole.site}<br/>
                        Desa: {pole.desa}<br/>
                        Status: {pole.status || '-'}
                      </Popup>
                    </Marker>
                  ))}
                </LayerGroup>
              </LayersControl.Overlay>

              {/* Data ODP & ODC Layer */}
              <LayersControl.Overlay checked name="Data ODP & ODC">
                <LayerGroup>
                  {devices.map(device => {
                    const dIcon = device.type === 'ODC' ? odcIcon : device.type === 'ODP' ? odpIcon : otherIcon
                    return (
                      <Marker 
                        key={device.id} 
                        position={[Number(device.latitude), Number(device.longitude)]}
                        icon={dIcon}
                      >
                        <Popup>
                          <strong>{device.device_id}</strong><br/>
                          Tipe: {device.type}<br/>
                          Site: {device.site}<br/>
                          Desa: {device.desa}<br/>
                          Kapasitas: {device.capacity || '-'}
                        </Popup>
                      </Marker>
                    )
                  })}
                </LayerGroup>
              </LayersControl.Overlay>

              {/* Garis Koneksi Layer */}
              <LayersControl.Overlay checked name="Koneksi Perangkat ke Tiang">
                <LayerGroup>
                  {connections.map(line => (
                    <Polyline 
                      key={line.id} 
                      positions={line.positions} 
                      color={line.color} 
                      weight={2}
                      opacity={0.7}
                      dashArray="5, 5"
                    />
                  ))}
                </LayerGroup>
              </LayersControl.Overlay>
            </LayersControl>
          </MapContainer>
        </div>
      )}
    </div>
  )
}

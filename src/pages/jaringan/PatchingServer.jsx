import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import Pagination from '../../components/common/Pagination'
import { 
  Server, 
  Cable, 
  Link2, 
  Unlink, 
  Search, 
  Download, 
  Plus, 
  X, 
  Edit2, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Copy, 
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Filter,
  MapPin
} from 'lucide-react'
import * as XLSX from 'xlsx'

const SITES = [
  { value: 'banyumas', label: 'Site Banyumas' },
  { value: 'cilacap', label: 'Site Cilacap' },
  { value: 'cilacap_herman', label: 'Site Cilacap-Herman' },
  { value: 'rowokele', label: 'Site Rowokele' },
  { value: 'kebumen', label: 'Site Kebumen' },
]

export default function PatchingServer() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'

  const [site, setSite] = useState('banyumas')
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Data states
  const [devices, setDevices] = useState([])
  const [ports, setPorts] = useState([])
  const [connections, setConnections] = useState([])

  // Active view tab: device ID or 'rekap'
  const [activeTab, setActiveTab] = useState('')

  // OLT / Device Filters & Search
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('')
  const [deviceStatusFilter, setDeviceStatusFilter] = useState('all') // 'all', 'connected', 'available'
  const [selectedSlotFilter, setSelectedSlotFilter] = useState('all') // 'all' or slot number (e.g. 3, 4, ...)

  // Tracing / Rekap state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOtb, setFilterOtb] = useState('all')
  const [rekapPage, setRekapPage] = useState(1)
  const [rekapPerPage, setRekapPerPage] = useState(25)

  // Modals
  const [selectedPort, setSelectedPort] = useState(null)
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [connectForm, setConnectForm] = useState({
    portAId: '',
    targetDeviceId: '',
    portBId: '',
    cableType: 'Patchcord SC-SC',
    note: ''
  })
  const [savingConnection, setSavingConnection] = useState(false)

  // Add Device Modal state
  const [isAddDeviceModalOpen, setIsAddDeviceModalOpen] = useState(false)
  const [newDeviceForm, setNewDeviceForm] = useState({
    name: '',
    device_type: 'olt', // 'olt', 'otb'
    brand_model: '',
    // OLT props
    start_slot: 1,
    end_slot: 4,
    ports_per_slot: 8,
    // OTB props
    rows_count: 4,
    cols_count: 24,
    total_ports: 96
  })
  const [savingDevice, setSavingDevice] = useState(false)

  // Initial load or site change
  useEffect(() => {
    fetchData()
  }, [site])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 1. Fetch devices for current site
      const { data: devData, error: devErr } = await supabase
        .from('server_devices')
        .select('*')
        .eq('site', site)
        .order('name')

      if (devErr) {
        if (devErr.message.includes('does not exist') || devErr.code === '42P01') {
          setTableExists(false)
          setLoading(false)
          return
        }
        throw devErr
      }

      setTableExists(true)
      const devList = devData || []
      setDevices(devList)

      // Set active tab: default to first OLT, or first device, or empty if no devices
      if (devList.length > 0) {
        const olt = devList.find(d => d.device_type === 'olt')
        setActiveTab(olt ? olt.id : devList[0].id)
      } else {
        setActiveTab('')
      }

      // 2. Fetch ports for these devices
      const devIds = devList.map(d => d.id)
      if (devIds.length > 0) {
        const { data: portData, error: portErr } = await supabase
          .from('server_ports')
          .select('*')
          .in('device_id', devIds)
          .order('port_number')

        if (portErr) throw portErr

        // For Banyumas site, ensure slot 1 and 2 are excluded as requested
        const validPorts = (portData || []).filter(p => {
          if (site === 'banyumas' && (p.slot_number === 1 || p.slot_number === 2)) return false
          return true
        })
        setPorts(validPorts)

        // 3. Fetch connections
        const portIds = validPorts.map(p => p.id)
        if (portIds.length > 0) {
          const { data: connData, error: connErr } = await supabase
            .from('server_connections')
            .select('*')

          if (connErr) throw connErr
          setConnections(connData || [])
        } else {
          setConnections([])
        }
      } else {
        setPorts([])
        setConnections([])
      }
    } catch (err) {
      console.error('Error fetching patching data:', err)
      toast.error('Gagal memuat data server: ' + err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Fast connection mapping: port_id -> connection + partner port & device info
  const portConnectionMap = useMemo(() => {
    const map = new Map()
    const portMap = new Map(ports.map(p => [p.id, p]))
    const devMap = new Map(devices.map(d => [d.id, d]))

    connections.forEach(conn => {
      const portA = portMap.get(conn.port_a_id)
      const portB = portMap.get(conn.port_b_id)

      if (portA && portB) {
        const devA = devMap.get(portA.device_id)
        const devB = devMap.get(portB.device_id)

        // For port A, target is B
        map.set(portA.id, {
          connectionId: conn.id,
          cableType: conn.cable_type,
          note: conn.note,
          updatedAt: conn.updated_at,
          myPort: portA,
          myDevice: devA,
          targetPort: portB,
          targetDevice: devB
        })

        // For port B, target is A
        map.set(portB.id, {
          connectionId: conn.id,
          cableType: conn.cable_type,
          note: conn.note,
          updatedAt: conn.updated_at,
          myPort: portB,
          myDevice: devB,
          targetPort: portA,
          targetDevice: devA
        })
      }
    })

    return map
  }, [ports, devices, connections])

  // Active Device (safely null if not found)
  const activeDevice = useMemo(() => {
    if (!activeTab || activeTab === 'rekap') return null
    return devices.find(d => d.id === activeTab) || null
  }, [devices, activeTab])

  // Ports for the active device
  const activeDevicePorts = useMemo(() => {
    if (!activeDevice) return []
    return ports.filter(p => p.device_id === activeDevice.id)
  }, [ports, activeDevice])

  // Available slots for OLT active device (e.g. 3, 4, 5, ..., 16)
  const availableSlots = useMemo(() => {
    if (activeDevice?.device_type !== 'olt') return []
    const slotSet = new Set(activeDevicePorts.map(p => p.slot_number).filter(Boolean))
    return Array.from(slotSet).sort((a, b) => a - b)
  }, [activeDevice, activeDevicePorts])

  // Filtered slots & ports for OLT
  const filteredOltSlots = useMemo(() => {
    if (activeDevice?.device_type !== 'olt') return []

    let slotList = availableSlots
    if (selectedSlotFilter !== 'all') {
      slotList = slotList.filter(s => s === Number(selectedSlotFilter))
    }

    const query = deviceSearchQuery.trim().toLowerCase()

    return slotList.map(slotNum => {
      let slotPorts = activeDevicePorts.filter(p => p.slot_number === slotNum)

      if (deviceStatusFilter === 'connected') {
        slotPorts = slotPorts.filter(p => p.status === 'connected')
      } else if (deviceStatusFilter === 'available') {
        slotPorts = slotPorts.filter(p => p.status === 'available')
      }

      if (query) {
        slotPorts = slotPorts.filter(p => {
          const conn = portConnectionMap.get(p.id)
          const targetStr = conn ? `${conn.targetDevice?.name} ${conn.targetPort?.port_label} ${conn.note}`.toLowerCase() : ''
          return p.port_label.toLowerCase().includes(query) || targetStr.includes(query)
        })
      }

      const totalInSlot = activeDevicePorts.filter(p => p.slot_number === slotNum).length
      const usedInSlot = activeDevicePorts.filter(p => p.slot_number === slotNum && p.status === 'connected').length

      return {
        slotNum,
        ports: slotPorts,
        totalInSlot,
        usedInSlot,
        freeInSlot: totalInSlot - usedInSlot
      }
    }).filter(s => s.ports.length > 0 || !query)
  }, [activeDevice, availableSlots, activeDevicePorts, selectedSlotFilter, deviceStatusFilter, deviceSearchQuery, portConnectionMap])

  // Rekap all connections
  const rekapList = useMemo(() => {
    const list = []
    const devMap = new Map(devices.map(d => [d.id, d]))
    const portMap = new Map(ports.map(p => [p.id, p]))

    connections.forEach((conn, idx) => {
      const portA = portMap.get(conn.port_a_id)
      const portB = portMap.get(conn.port_b_id)
      if (!portA || !portB) return

      const devA = devMap.get(portA.device_id)
      const devB = devMap.get(portB.device_id)

      let leftPort = portA, leftDev = devA, rightPort = portB, rightDev = devB
      if (devB?.device_type === 'olt' && devA?.device_type !== 'olt') {
        leftPort = portB; leftDev = devB; rightPort = portA; rightDev = devA
      }

      list.push({
        id: conn.id,
        index: idx + 1,
        cableType: conn.cable_type || 'Patchcord SC-SC',
        note: conn.note || '-',
        leftPort,
        leftDev,
        rightPort,
        rightDev,
        leftLabel: `${leftDev?.name || ''} - ${leftPort.port_label}`,
        rightLabel: `${rightDev?.name || ''} - ${rightPort.port_label}`,
        rawSearch: `${leftPort.port_label} ${rightPort.port_label} ${leftDev?.name} ${rightDev?.name} ${conn.note}`.toLowerCase()
      })
    })

    list.sort((a, b) => {
      if (a.leftPort.slot_number !== b.leftPort.slot_number) {
        return (a.leftPort.slot_number || 0) - (b.leftPort.slot_number || 0)
      }
      return (a.leftPort.port_number || 0) - (b.leftPort.port_number || 0)
    })

    return list
  }, [connections, ports, devices])

  // Filtered Rekap
  const filteredRekap = useMemo(() => {
    return rekapList.filter(item => {
      const matchQuery = !searchQuery || item.rawSearch.includes(searchQuery.toLowerCase())
      const matchOtb = filterOtb === 'all' || 
        item.leftDev?.id === filterOtb || 
        item.rightDev?.id === filterOtb
      return matchQuery && matchOtb
    })
  }, [rekapList, searchQuery, filterOtb])

  const paginatedRekap = useMemo(() => {
    const start = (rekapPage - 1) * rekapPerPage
    return filteredRekap.slice(start, start + rekapPerPage)
  }, [filteredRekap, rekapPage, rekapPerPage])

  // KPI Statistics
  const stats = useMemo(() => {
    const totalConnections = connections.length
    const oltDev = devices.find(d => d.device_type === 'olt')
    const oltPorts = oltDev ? ports.filter(p => p.device_id === oltDev.id) : []
    const oltUsed = oltPorts.filter(p => p.status === 'connected').length

    const otbDevices = devices.filter(d => d.device_type === 'otb')
    const otbPorts = ports.filter(p => otbDevices.some(d => d.id === p.device_id))
    const otbUsed = otbPorts.filter(p => p.status === 'connected').length

    return {
      totalConnections,
      oltTotal: oltPorts.length,
      oltUsed,
      oltFree: oltPorts.length - oltUsed,
      otbTotal: otbPorts.length,
      otbUsed,
      otbFree: otbPorts.length - otbUsed,
    }
  }, [devices, ports, connections])

  // Action: Open Connect Modal
  const openConnectModal = (port) => {
    const conn = portConnectionMap.get(port.id)
    const currentDevice = devices.find(d => d.id === port.device_id)

    let defaultTargetDevId = ''
    if (currentDevice?.device_type === 'olt') {
      const otb = devices.find(d => d.device_type === 'otb')
      defaultTargetDevId = otb ? otb.id : ''
    } else {
      const olt = devices.find(d => d.device_type === 'olt')
      defaultTargetDevId = olt ? olt.id : ''
    }

    setConnectForm({
      portAId: port.id,
      targetDeviceId: conn ? conn.targetDevice?.id : defaultTargetDevId,
      portBId: conn ? conn.targetPort?.id : '',
      cableType: conn?.cableType || 'Patchcord SC-SC',
      note: conn?.note || ''
    })
    setSelectedPort(port)
    setIsConnectModalOpen(true)
  }

  // Available target ports for connect modal
  const targetAvailablePorts = useMemo(() => {
    if (!connectForm.targetDeviceId) return []
    const list = ports.filter(p => p.device_id === connectForm.targetDeviceId)
    return list.filter(p => {
      const conn = portConnectionMap.get(p.id)
      return p.status === 'available' || conn?.targetPort?.id === connectForm.portAId
    })
  }, [ports, connectForm.targetDeviceId, connectForm.portAId, portConnectionMap])

  // Save / Update Connection
  const handleSaveConnection = async (e) => {
    if (e && e.preventDefault) e.preventDefault()
    if (!connectForm.portAId || !connectForm.portBId) {
      toast.error('Pilih port tujuan yang ingin disambungkan!')
      return
    }

    setSavingConnection(true)
    try {
      const portAId = connectForm.portAId
      const portBId = connectForm.portBId

      // 1. Remove any existing connection on Port A
      await supabase.from('server_connections').delete().or(`port_a_id.eq.${portAId},port_b_id.eq.${portAId}`)
      // 2. Remove any existing connection on Port B
      await supabase.from('server_connections').delete().or(`port_a_id.eq.${portBId},port_b_id.eq.${portBId}`)

      // 3. Insert new connection
      const { error: insErr } = await supabase.from('server_connections').insert({
        port_a_id: portAId,
        port_b_id: portBId,
        cable_type: connectForm.cableType || 'Patchcord SC-SC',
        note: connectForm.note || ''
      })
      if (insErr) throw insErr

      // 4. Update status on both ports to 'connected'
      await supabase.from('server_ports').update({ status: 'connected' }).in('id', [portAId, portBId])

      toast.success('Koneksi port berhasil disimpan dan disinkronkan!')
      setIsConnectModalOpen(false)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error('Gagal menyimpan koneksi: ' + err.message)
    } finally {
      setSavingConnection(false)
    }
  }

  // Action: Disconnect (Cabut Koneksi)
  const handleDisconnect = async (portId) => {
    const connInfo = portConnectionMap.get(portId)
    if (!connInfo) return

    if (!window.confirm(`Yakin ingin memutuskan koneksi antara "${connInfo.myPort.port_label}" dan "${connInfo.targetPort.port_label}"?`)) {
      return
    }

    try {
      const { error: delErr } = await supabase
        .from('server_connections')
        .delete()
        .eq('id', connInfo.connectionId)

      if (delErr) throw delErr

      await supabase
        .from('server_ports')
        .update({ status: 'available' })
        .in('id', [connInfo.myPort.id, connInfo.targetPort.id])

      toast.success('Koneksi port berhasil diputuskan! Kedua port kini berstatus KOSONG.')
      setIsConnectModalOpen(false)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error('Gagal memutuskan koneksi: ' + err.message)
    }
  }

  // Action: Add New Device for current site
  const handleSaveNewDevice = async (e) => {
    if (e && e.preventDefault) e.preventDefault()
    if (!newDeviceForm.name.trim()) {
      toast.error('Nama perangkat wajib diisi!')
      return
    }

    setSavingDevice(true)
    try {
      const isOlt = newDeviceForm.device_type === 'olt'
      let totalPorts = 0
      let rowsCount = 1
      let colsCount = 1

      if (isOlt) {
        const startSlot = Number(newDeviceForm.start_slot) || 1
        const endSlot = Number(newDeviceForm.end_slot) || 4
        const pps = Number(newDeviceForm.ports_per_slot) || 8
        const totalSlots = Math.max(1, endSlot - startSlot + 1)
        totalPorts = totalSlots * pps
        rowsCount = totalSlots
        colsCount = pps
      } else {
        rowsCount = Number(newDeviceForm.rows_count) || 4
        colsCount = Number(newDeviceForm.cols_count) || 24
        totalPorts = rowsCount * colsCount
      }

      // 1. Insert device
      const { data: newDev, error: devErr } = await supabase
        .from('server_devices')
        .insert({
          site,
          name: newDeviceForm.name.trim(),
          device_type: newDeviceForm.device_type,
          brand_model: newDeviceForm.brand_model.trim() || (isOlt ? 'ZTE' : 'OTB Rackmount'),
          total_ports: totalPorts,
          rows_count: rowsCount,
          cols_count: colsCount,
          description: `Perangkat di Site ${site.toUpperCase()}`
        })
        .select()
        .single()

      if (devErr) throw devErr

      // 2. Bulk generate ports
      const portsToInsert = []
      if (isOlt) {
        const startSlot = Number(newDeviceForm.start_slot) || 1
        const endSlot = Number(newDeviceForm.end_slot) || 4
        const pps = Number(newDeviceForm.ports_per_slot) || 8

        for (let s = startSlot; s <= endSlot; s++) {
          for (let p = 1; p <= pps; p++) {
            portsToInsert.push({
              device_id: newDev.id,
              slot_number: s,
              port_number: p,
              port_label: `PON ${s}/${p}`,
              status: 'available'
            })
          }
        }
      } else {
        // OTB ports
        for (let r = 1; r <= rowsCount; r++) {
          for (let c = 1; c <= colsCount; c++) {
            const portNo = (r - 1) * colsCount + c
            const label = totalPorts === 144 ? `No ${portNo}` : `Baris ${r} No ${c}`
            portsToInsert.push({
              device_id: newDev.id,
              row_number: r,
              col_number: c,
              port_number: portNo,
              port_label: label,
              status: 'available'
            })
          }
        }
      }

      // Batch insert ports
      const chunkSize = 50
      for (let i = 0; i < portsToInsert.length; i += chunkSize) {
        const chunk = portsToInsert.slice(i, i + chunkSize)
        const { error: portErr } = await supabase.from('server_ports').insert(chunk)
        if (portErr) throw portErr
      }

      toast.success(`Perangkat "${newDev.name}" dengan ${totalPorts} port berhasil dibuat!`)
      setIsAddDeviceModalOpen(false)
      setNewDeviceForm({
        name: '',
        device_type: 'olt',
        brand_model: '',
        start_slot: 1,
        end_slot: 4,
        ports_per_slot: 8,
        rows_count: 4,
        cols_count: 24,
        total_ports: 96
      })
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error('Gagal menambahkan perangkat: ' + err.message)
    } finally {
      setSavingDevice(false)
    }
  }

  // Export to Excel
  const handleExportExcel = () => {
    if (rekapList.length === 0) {
      toast.error('Belum ada data koneksi untuk diekspor di site ini')
      return
    }

    const rows = rekapList.map((item, idx) => ({
      'No': idx + 1,
      'Perangkat Asal': item.leftDev?.name || 'OLT',
      'Port Asal': item.leftPort.port_label,
      'Tipe Patchcord': item.cableType,
      'Perangkat Tujuan': item.rightDev?.name || 'OTB',
      'Port / Posisi Tujuan': item.rightPort.port_label,
      'Arah / Keterangan': item.note || '-'
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Patching Server')
    XLSX.writeFile(wb, `Rekap_Koneksi_Server_${site.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success('File Excel berhasil diunduh!')
  }

  // Copy SQL script notice
  const handleCopySqlNotice = () => {
    navigator.clipboard.writeText(`server_patching_migration.sql`)
    toast.success('Nama file script disalin! Buka Supabase SQL Editor dan jalankan isi file "server_patching_migration.sql".')
  }

  // If table does not exist, display setup helper
  if (!tableExists && !loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '800px', margin: '40px auto' }}>
        <div className="card" style={{ padding: '32px', textAlign: 'center', border: '1px solid var(--accent)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Server size={32} style={{ color: 'var(--accent)' }} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Tabel Database Server Belum Diaktifkan</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '600px', margin: '0 auto 24px', lineHeight: 1.6 }}>
            Modul <strong>Patching Server (OLT - OTB)</strong> memerlukan 3 tabel baru di Supabase. Kami sudah membuatkan file SQL lengkap beserta <strong>91 data koneksi awal</strong> dari file data Anda!
          </p>

          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', textAlign: 'left', marginBottom: '24px' }}>
            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={16} style={{ color: 'var(--accent)' }} />
              Langkah Cepat Aktivasi:
            </div>
            <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <li>Buka dashboard <strong>Supabase $\rightarrow$ SQL Editor</strong> proyek Maintory.</li>
              <li>Buka file <code>server_patching_migration.sql</code> yang sudah kami buatkan di folder proyek.</li>
              <li>Salin dan paste seluruh isinya ke SQL Editor, lalu klik <strong>Run</strong>.</li>
              <li>Klik tombol <strong>"Cek Ulang Database"</strong> di bawah ini.</li>
            </ol>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={handleCopySqlNotice}>
              <Copy size={16} /> Salin Petunjuk File
            </button>
            <button className="btn btn-primary" onClick={fetchData}>
              <RefreshCw size={16} /> Cek Ulang Database
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2>Patching Server (OLT - OTB)</h2>
            <span className="badge badge-accent" style={{ fontSize: '11px', textTransform: 'uppercase' }}>Cross-Connect</span>
          </div>
          <p>Manajemen koneksi fisik port OLT ke OTB &amp; pelacakan jalur server secara dua arah</p>
        </div>
        <div className="page-header-right" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select 
            className="form-input filter-select" 
            style={{ minWidth: '160px', height: '38px', fontWeight: 600 }}
            value={site} 
            onChange={e => setSite(e.target.value)}
          >
            {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => setIsAddDeviceModalOpen(true)} title="Tambah Perangkat Baru di Site Ini">
            <Plus size={15} /> Tambah Device
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportExcel} title="Export Rekap Koneksi ke Excel">
            <Download size={15} /> Export Excel
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setRefreshing(true); fetchData(); }} title="Segarkan Data">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Stats: Detail Terhubung & Kosong */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
            <Link2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Port Terhubung</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {stats.totalConnections} <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>port aktif</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)' }}>
            <Server size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Port OLT ({SITES.find(s => s.value === site)?.label || site})</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>{stats.oltUsed} Terhubung</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--success)' }}>· {stats.oltFree} Kosong</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Total: {stats.oltTotal} port PON</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--warning)' }}>
            <Cable size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Kapasitas OTB ({SITES.find(s => s.value === site)?.label || site})</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>{stats.otbUsed} Terhubung</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--success)' }}>· {stats.otbFree} Kosong</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Total: {stats.otbTotal} port OTB</div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation (Device list for current site) */}
      {devices.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border)', overflowX: 'auto', paddingBottom: '2px' }}>
          {devices.map(dev => {
            const isOlt = dev.device_type === 'olt'
            const devPorts = ports.filter(p => p.device_id === dev.id)
            const usedCount = devPorts.filter(p => p.status === 'connected').length
            const freeCount = devPorts.length - usedCount
            const isActive = activeTab === dev.id

            return (
              <button
                key={dev.id}
                onClick={() => {
                  setActiveTab(dev.id)
                  setSelectedSlotFilter('all')
                  setDeviceSearchQuery('')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 14px',
                  background: isActive ? 'var(--bg-card)' : 'transparent',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--border)' : 'transparent',
                  borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  borderRadius: '8px 8px 0 0',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {isOlt ? <Server size={15} style={{ color: isActive ? 'var(--accent)' : 'inherit' }} /> : <Cable size={15} style={{ color: isActive ? 'var(--warning)' : 'inherit' }} />}
                {dev.name}
                <span 
                  style={{ 
                    fontSize: '11px', 
                    padding: '1px 6px', 
                    borderRadius: '10px', 
                    background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-tertiary)',
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: 600 
                  }}
                >
                  {usedCount}/{devPorts.length} ({freeCount} kosong)
                </span>
              </button>
            )
          })}

          <button
            onClick={() => setActiveTab('rekap')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 14px',
              background: activeTab === 'rekap' ? 'var(--bg-card)' : 'transparent',
              border: '1px solid',
              borderColor: activeTab === 'rekap' ? 'var(--border)' : 'transparent',
              borderBottom: activeTab === 'rekap' ? '2px solid var(--accent)' : '2px solid transparent',
              borderRadius: '8px 8px 0 0',
              color: activeTab === 'rekap' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'rekap' ? 600 : 500,
              fontSize: '13px',
              cursor: 'pointer',
              marginLeft: 'auto',
              whiteSpace: 'nowrap'
            }}
          >
            <Layers size={15} />
            Daftar Rekap Koneksi ({rekapList.length})
          </button>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="card" style={{ height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" />
        </div>
      ) : devices.length === 0 ? (
        /* ========================================================
           EMPTY STATE UNTUK SITE YANG BELUM MEMILIKI PERANGKAT
           ======================================================== */
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', border: '1px dashed var(--border)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--accent)' }}>
            <Server size={32} />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
            Belum Ada Perangkat Terdaftar di {SITES.find(s => s.value === site)?.label || site}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '480px', margin: '0 auto 24px', lineHeight: 1.6 }}>
            Setiap site memiliki konfigurasi perangkat server mandiri. Anda dapat mendaftarkan perangkat OLT atau OTB khusus untuk site ini untuk mulai mencatat patching.
          </p>
          <button className="btn btn-primary" onClick={() => setIsAddDeviceModalOpen(true)} style={{ margin: '0 auto' }}>
            <Plus size={16} /> Tambah Perangkat di {SITES.find(s => s.value === site)?.label || site}
          </button>
        </div>
      ) : activeTab === 'rekap' ? (
        /* ========================================================
           TAB REKAP / TRACING TABEL KONEKSI
           ======================================================== */
        <div className="card">
          <div className="filter-bar" style={{ flexWrap: 'wrap', gap: '10px' }}>
            <div className="search-box" style={{ maxWidth: '320px' }}>
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Cari port (3/1, no 109, OTB 96, Pageralang)..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setRekapPage(1); }}
              />
            </div>

            <select
              className="filter-select"
              value={filterOtb}
              onChange={e => { setFilterOtb(e.target.value); setRekapPage(1); }}
              style={{ minWidth: '180px' }}
            >
              <option value="all">Semua Perangkat OTB</option>
              {devices.filter(d => d.device_type === 'otb').map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            <div style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Menampilkan <strong>{filteredRekap.length}</strong> jalur koneksi
            </div>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>No</th>
                  <th>Port OLT</th>
                  <th>Tipe Patchcord</th>
                  <th>Perangkat OTB Tujuan</th>
                  <th>Posisi / Port OTB</th>
                  <th>Arah / Catatan</th>
                  <th style={{ textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRekap.length > 0 ? (
                  paginatedRekap.map((item, idx) => (
                    <tr key={item.id}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {(rekapPage - 1) * rekapPerPage + idx + 1}
                      </td>
                      <td>
                        <span className="badge badge-accent" style={{ fontSize: '12px', fontWeight: 700 }}>
                          {item.leftPort.port_label}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {item.cableType}
                        </span>
                      </td>
                      <td>
                        <strong style={{ fontSize: '13px' }}>{item.rightDev?.name}</strong>
                      </td>
                      <td>
                        <span className="badge badge-warning" style={{ fontSize: '12px', fontWeight: 600 }}>
                          {item.rightPort.port_label}
                        </span>
                      </td>
                      <td>
                        {item.note && item.note !== '-' ? (
                          <span style={{ 
                            fontSize: '12px', 
                            fontWeight: 600, 
                            color: '#38bdf8', 
                            background: 'rgba(56, 189, 248, 0.1)', 
                            padding: '3px 8px', 
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <MapPin size={12} />
                            {item.note}
                          </span>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            className="btn-icon"
                            title="Ubah Koneksi"
                            onClick={() => openConnectModal(item.leftPort)}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="btn-icon text-danger"
                            title="Putuskan Koneksi"
                            onClick={() => handleDisconnect(item.leftPort.id)}
                          >
                            <Unlink size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      Tidak ditemukan data koneksi yang sesuai kriteria pencarian.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={rekapPage}
            setPage={setRekapPage}
            perPage={rekapPerPage}
            setPerPage={setRekapPerPage}
            totalItems={filteredRekap.length}
          />
        </div>
      ) : activeDevice?.device_type === 'olt' ? (
        /* ========================================================
           TAB TAMPILAN OLT DENGAN SEARCH, FILTER & TAMPILAN ARAH CATATAN
           ======================================================== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Header Summary Banner */}
          <div className="card" style={{ padding: '14px 18px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{activeDevice?.name || 'OLT'}</h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {activeDevice?.brand_model || 'ZTE C300'} · Slot 3 s/d 16 (Card GPON)
                </p>
              </div>

              {/* Status Legenda & Total Terhubung/Kosong */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px' }}>
                <span style={{ 
                  display: 'flex', alignItems: 'center', gap: '6px', 
                  padding: '4px 10px', borderRadius: '6px', 
                  background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: 'var(--accent)', fontWeight: 600
                }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} />
                  {activeDevicePorts.filter(p => p.status === 'connected').length} Terhubung
                </span>

                <span style={{ 
                  display: 'flex', alignItems: 'center', gap: '6px', 
                  padding: '4px 10px', borderRadius: '6px', 
                  background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: 'var(--success)', fontWeight: 600
                }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
                  {activeDevicePorts.filter(p => p.status === 'available').length} Kosong
                </span>

                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  Total {activeDevicePorts.length} port
                </span>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Search Box */}
              <div className="search-box" style={{ maxWidth: '300px', flex: '1 1 200px' }}>
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Cari port / arah (misal 3/1, Pageralang)..."
                  value={deviceSearchQuery}
                  onChange={e => setDeviceSearchQuery(e.target.value)}
                />
              </div>

              {/* Status Filter */}
              <select
                className="filter-select"
                value={deviceStatusFilter}
                onChange={e => setDeviceStatusFilter(e.target.value)}
                style={{ height: '38px', minWidth: '140px' }}
              >
                <option value="all">Semua Status</option>
                <option value="connected">Hanya Terhubung</option>
                <option value="available">Hanya Kosong</option>
              </select>

              {/* Reset filter button if active */}
              {(deviceSearchQuery || deviceStatusFilter !== 'all' || selectedSlotFilter !== 'all') && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setDeviceSearchQuery('')
                    setDeviceStatusFilter('all')
                    setSelectedSlotFilter('all')
                  }}
                  title="Reset Filter"
                  style={{ fontSize: '12px', height: '38px' }}
                >
                  <X size={14} /> Reset Filter
                </button>
              )}
            </div>

            {/* Quick Slot Filter Pills */}
            <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Filter size={12} /> Pilih Slot Cepat (Mobile / Desktop):
              </div>
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                <button
                  onClick={() => setSelectedSlotFilter('all')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    border: '1px solid',
                    borderColor: selectedSlotFilter === 'all' ? 'var(--accent)' : 'var(--border)',
                    background: selectedSlotFilter === 'all' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: selectedSlotFilter === 'all' ? '#0d1117' : 'var(--text-secondary)'
                  }}
                >
                  Semua Slot ({availableSlots.length})
                </button>

                {availableSlots.map(slotNum => {
                  const sPorts = activeDevicePorts.filter(p => p.slot_number === slotNum)
                  const used = sPorts.filter(p => p.status === 'connected').length
                  const isSel = selectedSlotFilter === String(slotNum)

                  return (
                    <button
                      key={slotNum}
                      onClick={() => setSelectedSlotFilter(isSel ? 'all' : String(slotNum))}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        border: '1px solid',
                        borderColor: isSel ? 'var(--accent)' : 'var(--border)',
                        background: isSel ? 'var(--accent)' : 'var(--bg-secondary)',
                        color: isSel ? '#0d1117' : 'var(--text-secondary)'
                      }}
                    >
                      Slot {slotNum} <span style={{ opacity: 0.8, fontSize: '10px' }}>({used}/{sPorts.length})</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Slot Cards Layout: 2 Kolom Kesamping pada Desktop / Rapi pada Mobile */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', 
            gap: '14px',
            alignItems: 'start'
          }}>
            {filteredOltSlots.length > 0 ? (
              filteredOltSlots.map(slotData => (
                <div key={slotData.slotNum} className="card" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Slot Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge badge-accent" style={{ fontSize: '11px', padding: '2px 8px' }}>
                        SLOT {slotData.slotNum}
                      </span>
                      <span style={{ color: 'var(--text-primary)' }}>Card GPON</span>
                    </div>
                    <div style={{ fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{slotData.usedInSlot} Terhubung</span>
                      <span style={{ color: 'var(--text-muted)' }}>·</span>
                      <span style={{ color: 'var(--success)', fontWeight: 600 }}>{slotData.freeInSlot} Kosong</span>
                    </div>
                  </div>

                  {/* Ports Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px' }}>
                    {slotData.ports.map(port => {
                      const conn = portConnectionMap.get(port.id)
                      const isConnected = port.status === 'connected' && !!conn

                      return (
                        <div
                          key={port.id}
                          onClick={() => openConnectModal(port)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: isConnected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                            border: `1px solid ${isConnected ? 'rgba(59, 130, 246, 0.5)' : 'var(--border)'}`,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)'
                            e.currentTarget.style.borderColor = isConnected ? 'var(--accent)' : '#94a3b8'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.borderColor = isConnected ? 'rgba(59, 130, 246, 0.5)' : 'var(--border)'
                          }}
                        >
                          {/* Top: Port Label & Status Badge */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px', color: isConnected ? '#38bdf8' : '#f1f5f9' }}>
                              {port.port_label}
                            </span>
                            <span 
                              style={{ 
                                fontSize: '10px', 
                                padding: '2px 6px', 
                                borderRadius: '4px',
                                background: isConnected ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                                color: isConnected ? '#0d1117' : '#94a3b8',
                                fontWeight: 700,
                                textTransform: 'uppercase'
                              }}
                            >
                              {isConnected ? 'Terhubung' : 'Kosong'}
                            </span>
                          </div>

                          {/* Body: Connected Target & REVISI #1: Arah Catatan Desa/ODC */}
                          {isConnected ? (
                            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: '#f8fafc' }}>
                                <ChevronRight size={13} style={{ color: 'var(--accent)' }} />
                                {conn.targetDevice?.name}
                              </div>
                              <div style={{ paddingLeft: '17px', color: '#fbbf24', fontWeight: 700, fontSize: '12px' }}>
                                {conn.targetPort?.port_label}
                              </div>

                              {/* REVISI 1: Tampilkan Arah Catatan (Desa/ODC/Jalur) */}
                              {conn.note && (
                                <div 
                                  style={{ 
                                    marginTop: '4px', 
                                    padding: '4px 8px', 
                                    borderRadius: '5px', 
                                    background: 'rgba(56, 189, 248, 0.12)', 
                                    border: '1px solid rgba(56, 189, 248, 0.3)',
                                    color: '#38bdf8', 
                                    fontSize: '11px', 
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                  }}
                                  title={`Arah / Catatan: ${conn.note}`}
                                >
                                  <MapPin size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {conn.note}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ 
                              fontSize: '11px', 
                              fontWeight: 600,
                              color: '#94a3b8', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '5px',
                              background: 'rgba(255,255,255,0.03)',
                              padding: '5px 8px',
                              borderRadius: '4px',
                              border: '1px dashed rgba(255,255,255,0.15)'
                            }}>
                              <Plus size={12} style={{ color: 'var(--accent)' }} />
                              <span>Klik untuk hubungkan port</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="card" style={{ gridColumn: '1 / -1', padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Tidak ada port PON yang cocok dengan filter pencarian.
              </div>
            )}
          </div>
        </div>
      ) : activeDevice ? (
        /* ========================================================
           TAB TAMPILAN OTB (VISUAL GRID MATRIKS)
           ======================================================== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Header Summary Banner */}
          <div className="card" style={{ padding: '14px 18px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{activeDevice?.name || 'OTB'}</h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Matriks Port ({activeDevice?.rows_count || 1} Baris kebawah × {activeDevice?.cols_count || 1} Kolom kesamping = {activeDevice?.total_ports || activeDevicePorts.length} Port)
                </p>
              </div>

              {/* Status Legenda & Total Terhubung/Kosong */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px' }}>
                <span style={{ 
                  display: 'flex', alignItems: 'center', gap: '6px', 
                  padding: '4px 10px', borderRadius: '6px', 
                  background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: 'var(--accent)', fontWeight: 600
                }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} />
                  {activeDevicePorts.filter(p => p.status === 'connected').length} Terhubung ke OLT
                </span>

                <span style={{ 
                  display: 'flex', alignItems: 'center', gap: '6px', 
                  padding: '4px 10px', borderRadius: '6px', 
                  background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: 'var(--success)', fontWeight: 600
                }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
                  {activeDevicePorts.filter(p => p.status === 'available').length} Port Kosong
                </span>

                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  Total {activeDevicePorts.length} port
                </span>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '24px 20px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: `${Math.max((activeDevice?.cols_count || 12) * 40 + 120, 600)}px` }}>
              {/* Baris dibalik: Baris terakhir (tertinggi) di atas, Baris 1 di bawah — sesuai fisik OTB */}
              {Array.from({ length: activeDevice?.rows_count || 1 }, (_, rIdx) => {
                // rIdx=0 → tampilkan baris paling atas (rows_count), rIdx terakhir → tampilkan baris 1
                const totalRows = activeDevice?.rows_count || 1
                const rowNum = totalRows - rIdx  // reversed
                const rowPorts = activeDevicePorts.filter(p => p.row_number === rowNum).sort((a, b) => a.col_number - b.col_number)

                return (
                  <div key={rowNum} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '70px', flexShrink: 0, fontWeight: 700, fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                      Baris {rowNum}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${activeDevice?.cols_count || 12}, minmax(44px, 1fr))`, gap: '6px', flex: 1 }}>
                      {rowPorts.map(port => {
                        const conn = portConnectionMap.get(port.id)
                        const isConnected = port.status === 'connected' && !!conn
                        const portLabel = port.port_label // e.g. "Baris 2 No 5"
                        const colNo = port.col_number || port.port_number

                        // PON label to show: e.g. "3/1"
                        const ponLabel = conn?.targetPort?.port_label?.replace('PON ', '') || ''
                        // Note/direction to show
                        const noteText = conn?.note || ''

                        return (
                          <div
                            key={port.id}
                            onClick={() => openConnectModal(port)}
                            title={isConnected
                              ? `${portLabel}\n↔ ${conn.targetDevice?.name} — ${conn.targetPort?.port_label}${noteText ? `\n📍 ${noteText}` : ''}`
                              : `${portLabel} — Kosong (Klik untuk hubungkan)`
                            }
                            style={{
                              minHeight: isConnected ? '58px' : '42px',
                              borderRadius: '6px',
                              background: isConnected ? 'rgba(59, 130, 246, 0.22)' : 'var(--bg-primary)',
                              border: `2px solid ${isConnected ? 'var(--accent)' : 'var(--border)'}`,
                              color: isConnected ? '#38bdf8' : '#cbd5e1',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              position: 'relative',
                              transition: 'all 0.15s ease',
                              userSelect: 'none',
                              padding: '4px 2px',
                              gap: '2px'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.transform = 'scale(1.06)'
                              e.currentTarget.style.zIndex = '5'
                              e.currentTarget.style.borderColor = '#38bdf8'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.transform = 'scale(1)'
                              e.currentTarget.style.zIndex = '1'
                              e.currentTarget.style.borderColor = isConnected ? 'var(--accent)' : 'var(--border)'
                            }}
                          >
                            {/* Nomor kolom / no port OTB */}
                            <span style={{ fontSize: '11px', fontWeight: 700, lineHeight: 1, color: isConnected ? '#f1f5f9' : '#94a3b8' }}>
                              {colNo}
                            </span>

                            {isConnected ? (
                              <>
                                {/* PON yang terhubung */}
                                <span style={{ fontSize: '10px', fontWeight: 800, color: '#facc15', lineHeight: 1.1, textAlign: 'center', maxWidth: '42px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {ponLabel}
                                </span>
                                {/* Arah/Catatan jika ada */}
                                {noteText && (
                                  <span style={{ fontSize: '8px', fontWeight: 600, color: '#38bdf8', lineHeight: 1.1, textAlign: 'center', maxWidth: '42px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>
                                    {noteText.length > 8 ? noteText.slice(0, 8) + '…' : noteText}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ fontSize: '8px', color: 'rgba(148,163,184,0.4)', lineHeight: 1 }}>—</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* ========================================================
         MODAL TAMBAH PERANGKAT DI SITE INI (REVISI #2)
         ======================================================== */}
      {isAddDeviceModalOpen && (
        <div className="modal-overlay" onClick={() => !savingDevice && setIsAddDeviceModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '520px', width: '92%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Server size={18} style={{ color: 'var(--accent)' }} />
                Tambah Perangkat di Site {SITES.find(s => s.value === site)?.label || site}
              </h3>
              <button className="btn-icon" onClick={() => !savingDevice && setIsAddDeviceModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveNewDevice}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tipe Perangkat <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select
                    className="form-input filter-select"
                    value={newDeviceForm.device_type}
                    onChange={e => setNewDeviceForm(f => ({
                      ...f,
                      device_type: e.target.value,
                      name: e.target.value === 'olt' ? `OLT ${site.toUpperCase()}` : `OTB 96 Core 1`,
                      brand_model: e.target.value === 'olt' ? 'ZTE C320' : 'OTB Rackmount'
                    }))}
                  >
                    <option value="olt">OLT (Optical Line Terminal)</option>
                    <option value="otb">OTB / ODF Patch Panel</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Nama Perangkat <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: OLT ZTE C320 Cilacap"
                    value={newDeviceForm.name}
                    onChange={e => setNewDeviceForm(f => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Merk / Model</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: ZTE C320 / Huawei / Fiberhome"
                    value={newDeviceForm.brand_model}
                    onChange={e => setNewDeviceForm(f => ({ ...f, brand_model: e.target.value }))}
                  />
                </div>

                {newDeviceForm.device_type === 'olt' ? (
                  <div style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>Konfigurasi Slot &amp; Port PON:</div>
                    <div className="grid-3" style={{ gap: '8px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>Mulai Slot</label>
                        <input
                          type="number"
                          className="form-input"
                          min="1"
                          max="20"
                          value={newDeviceForm.start_slot}
                          onChange={e => setNewDeviceForm(f => ({ ...f, start_slot: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>Sampai Slot</label>
                        <input
                          type="number"
                          className="form-input"
                          min="1"
                          max="20"
                          value={newDeviceForm.end_slot}
                          onChange={e => setNewDeviceForm(f => ({ ...f, end_slot: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>Port / Slot</label>
                        <select
                          className="form-input filter-select"
                          value={newDeviceForm.ports_per_slot}
                          onChange={e => setNewDeviceForm(f => ({ ...f, ports_per_slot: e.target.value }))}
                        >
                          <option value="8">8 Port PON</option>
                          <option value="16">16 Port PON</option>
                          <option value="4">4 Port PON</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--warning)' }}>Konfigurasi Grid OTB:</div>
                    <div className="grid-2" style={{ gap: '8px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>Baris Kebawah</label>
                        <input
                          type="number"
                          className="form-input"
                          min="1"
                          max="24"
                          value={newDeviceForm.rows_count}
                          onChange={e => setNewDeviceForm(f => ({ ...f, rows_count: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>Kolom Kesamping</label>
                        <input
                          type="number"
                          className="form-input"
                          min="1"
                          max="48"
                          value={newDeviceForm.cols_count}
                          onChange={e => setNewDeviceForm(f => ({ ...f, cols_count: e.target.value }))}
                          required
                        />
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Total port yang akan otomatis dibuat: <strong>{(Number(newDeviceForm.rows_count) || 4) * (Number(newDeviceForm.cols_count) || 24)} port</strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAddDeviceModalOpen(false)}
                  disabled={savingDevice}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingDevice}
                >
                  {savingDevice ? 'Membuat Perangkat & Port...' : 'Simpan Perangkat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
         MODAL DETAIL & HUBUNGKAN KONEKSI PORT
         ======================================================== */}
      {isConnectModalOpen && selectedPort && (
        <div className="modal-overlay" onClick={() => !savingConnection && setIsConnectModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '520px', width: '92%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Link2 size={18} style={{ color: 'var(--accent)' }} />
                Detail Koneksi Port
              </h3>
              <button className="btn-icon" onClick={() => !savingConnection && setIsConnectModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveConnection}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
                {/* Port Asal Info */}
                <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                    Port Terpilih:
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {devices.find(d => d.id === selectedPort.device_id)?.name}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--accent)', fontWeight: 700, marginTop: '2px' }}>
                    {selectedPort.port_label}
                  </div>
                </div>

                {/* Status Koneksi Saat ini */}
                {portConnectionMap.has(selectedPort.id) && (
                  <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                      Koneksi Aktif Saat Ini:
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Terhubung ke: <strong>{portConnectionMap.get(selectedPort.id).targetDevice?.name}</strong> ({portConnectionMap.get(selectedPort.id).targetPort?.port_label})
                    </div>
                    {portConnectionMap.get(selectedPort.id).note && (
                      <div style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={12} /> Arah: {portConnectionMap.get(selectedPort.id).note}
                      </div>
                    )}
                  </div>
                )}

                {/* Pilih Target Device */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Sambungkan ke Perangkat Tujuan</label>
                  <select
                    className="form-input filter-select"
                    value={connectForm.targetDeviceId}
                    onChange={e => setConnectForm(f => ({ ...f, targetDeviceId: e.target.value, portBId: '' }))}
                  >
                    <option value="">-- Pilih Perangkat Tujuan --</option>
                    {devices.filter(d => d.id !== selectedPort.device_id).map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.device_type.toUpperCase()})</option>
                    ))}
                  </select>
                </div>

                {/* Pilih Target Port */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Pilih Port Tujuan</label>
                  <select
                    className="form-input filter-select"
                    value={connectForm.portBId}
                    onChange={e => setConnectForm(f => ({ ...f, portBId: e.target.value }))}
                    disabled={!connectForm.targetDeviceId}
                  >
                    <option value="">-- Pilih Port --</option>
                    {targetAvailablePorts.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.port_label} {p.status === 'connected' ? '(Terhubung saat ini)' : '(Kosong)'}
                      </option>
                    ))}
                  </select>
                  {connectForm.targetDeviceId && targetAvailablePorts.length === 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '4px', display: 'block' }}>
                      Semua port pada perangkat ini sudah terpakai!
                    </span>
                  )}
                </div>

                {/* Tipe Patchcord & Arah / Catatan (Desa/ODC) */}
                <div className="grid-2">
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Tipe Patchcord</label>
                    <select
                      className="form-input filter-select"
                      value={connectForm.cableType}
                      onChange={e => setConnectForm(f => ({ ...f, cableType: e.target.value }))}
                    >
                      <option value="Patchcord SC-SC">Patchcord SC-SC</option>
                      <option value="Patchcord SC-SC UPC-APC">Patchcord SC UPC-APC</option>
                      <option value="Patchcord LC-SC">Patchcord LC-SC</option>
                      <option value="Patchcord LC-LC">Patchcord LC-LC</option>
                      <option value="DAC Cable SFP+">DAC Cable SFP+</option>
                      <option value="Kabel UTP">Kabel UTP LAN</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Arah / Catatan (Desa / ODC)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Contoh: Desa Pageralang / ODC 01"
                      value={connectForm.note}
                      onChange={e => setConnectForm(f => ({ ...f, note: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {portConnectionMap.has(selectedPort.id) && (
                    <button
                      type="button"
                      className="btn btn-secondary text-danger btn-sm"
                      onClick={() => handleDisconnect(selectedPort.id)}
                      disabled={savingConnection}
                    >
                      <Unlink size={14} /> Putuskan Koneksi
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsConnectModalOpen(false)}
                    disabled={savingConnection}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingConnection || !connectForm.portBId}
                  >
                    {savingConnection ? 'Menyimpan...' : 'Simpan Koneksi'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

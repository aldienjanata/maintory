import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getDailyQuote } from '../../utils/quotes'
import { 
  AlertTriangle, 
  AlertCircle,
  Wrench, 
  Package, 
  ArrowDownToLine, 
  Truck,
  Plus,
  History,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  XCircle
} from 'lucide-react'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts'
import { format, subDays, isToday, isYesterday, differenceInDays } from 'date-fns'
import { id } from 'date-fns/locale'

const COLORS = ['#00d4ff', '#f85149', '#3fb950', '#d29922', '#bc8cff']

const SITE_LABELS = { banyumas: 'Banyumas', cilacap: 'Cilacap', cilacap_herman: 'Cilacap (Herman)' }
const WORK_LABELS = { ikr_psb: 'IKR/PSB', maintenance: 'Maintenance', odc_odp: 'Instalasi ODC/ODP' }

export default function Dashboard() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'

  if (role === 'backbone') {
    return <Navigate to="/bon-barang" replace />
  }

  const [quote, setQuote] = useState({ text: '', author: '' })
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState([])
  const [overdueTickets, setOverdueTickets] = useState([])
  const [recentActiveTickets, setRecentActiveTickets] = useState([])
  const [showAllAlerts, setShowAllAlerts] = useState(false)
  const [pendingSchedules, setPendingSchedules] = useState([])
  const [maintenanceChartData, setMaintenanceChartData] = useState([])
  const [allTickets, setAllTickets] = useState([])
  const [maintenanceByStatus, setMaintenanceByStatus] = useState([])
  const [statusFilter, setStatusFilter] = useState('bulan')
  const [stats, setStats] = useState({
    maintenanceToday: 0,
    maintenanceOpen: 0,
    pengeluaranToday: 0,
    stockOnt: 0,
    dismantleActive: 0,
    ontReplaced: 0
  })

  useEffect(() => {
    setQuote(getDailyQuote())
    fetchDashboardData()
  }, [])

  useEffect(() => {
    if (!allTickets.length) return
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const thisMonthStr = format(new Date(), 'yyyy-MM')
    const thisYearStr = format(new Date(), 'yyyy')
    
    let filtered = allTickets
    if (statusFilter === 'hari') {
      filtered = allTickets.filter(t => t.date_input === todayStr)
    } else if (statusFilter === 'bulan') {
      filtered = allTickets.filter(t => t.date_input?.startsWith(thisMonthStr))
    } else if (statusFilter === 'tahun') {
      filtered = allTickets.filter(t => t.date_input?.startsWith(thisYearStr))
    }
    
    setMaintenanceByStatus([
      { name: 'Aktif', value: filtered.filter(t => t.status === 'aktif').length, color: 'var(--danger)' },
      { name: 'Pending', value: filtered.filter(t => t.status === 'pending').length, color: '#ffaa00' },
      { name: 'Close', value: filtered.filter(t => t.status === 'close').length, color: 'var(--success)' },
    ])
  }, [statusFilter, allTickets])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      // Fetch semua maintenance tickets
      const { data: tickets } = await supabase
        .from('maintenance_tickets')
        .select('*')
        .order('date_input', { ascending: false })

      if (tickets) {
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        const todayTickets = tickets.filter(t => isToday(new Date(t.created_at)))
        const openTickets = tickets.filter(t => t.status === 'aktif')
        const unresolvedTickets = tickets.filter(t => t.status === 'aktif' || t.status === 'pending')

        // Tiket Alert: aktif atau pending yang masuk TEPAT kemarin (H-1)
        let overdue = unresolvedTickets.filter(t => {
          return isYesterday(new Date(t.date_input))
        }).sort((a, b) => new Date(a.date_input) - new Date(b.date_input))

        // Untuk teknisi: hanya tampilkan tiket yang melibatkan mereka
        if (role === 'teknisi') {
          overdue = overdue.filter(t => t.technicians?.includes(profile.id))
        }
        const activeTodayTickets = todayTickets.filter(t => t.status === 'aktif' || t.status === 'pending')

        setAllTickets(tickets)
        setOverdueTickets(overdue)
        setRecentActiveTickets(openTickets.slice(0, 5))
        setStats(prev => ({
          ...prev,
          maintenanceToday: todayTickets.length,
          maintenanceOpen: activeTodayTickets.length, // total aktif & pending hari ini
        }))

        // Chart data: maintenance 7 hari terakhir
        const last7Days = Array.from({ length: 7 }, (_, i) => {
          const date = subDays(new Date(), 6 - i)
          const dateStr = format(date, 'yyyy-MM-dd')
          const dayTickets = tickets.filter(t => t.date_input === dateStr)
          return {
            name: format(date, 'EEE', { locale: id }),
            Masuk: dayTickets.length,
            Close: dayTickets.filter(t => t.status === 'close').length,
            Aktif: dayTickets.filter(t => t.status === 'aktif').length,
            Pending: dayTickets.filter(t => t.status === 'pending').length,
          }
        })
        setMaintenanceChartData(last7Days)

        // Default pie: bulan berjalan
        const thisMonthStr = format(new Date(), 'yyyy-MM')
        const thisMonthTickets = tickets.filter(t => t.date_input?.startsWith(thisMonthStr))
        setMaintenanceByStatus([
          { name: 'Aktif', value: thisMonthTickets.filter(t => t.status === 'aktif').length, color: 'var(--danger)' },
          { name: 'Pending', value: thisMonthTickets.filter(t => t.status === 'pending').length, color: '#ffaa00' },
          { name: 'Close', value: thisMonthTickets.filter(t => t.status === 'close').length, color: 'var(--success)' },
        ])
      }

      // Fetch dismantle aktif
      const { data: dismantles } = await supabase
        .from('dismantles')
        .select('id')
        .eq('aksi', 'aktif')
      if (dismantles) {
        setStats(prev => ({ ...prev, dismantleActive: dismantles.length }))
      }

      // Fetch stok ONT (dari serial_number tersedia)
      const { data: snStok, count: snCount } = await supabase
        .from('serial_numbers')
        .select('id', { count: 'exact' })
        .eq('status', 'tersedia')
      if (snCount !== null) {
        setStats(prev => ({ ...prev, stockOnt: snCount }))
      }

      // Fetch pending schedules untuk user saat ini
      // Jadwal yang tanggalnya sudah lewat (sebelum hari ini) tapi statusnya masih pending
      const todayStr = format(new Date(), 'yyyy-MM-dd')
      const { data: scheds } = await supabase
        .from('technician_schedules')
        .select('*')
        .eq('status', 'pending')
        .lt('schedule_date', todayStr)
        .order('schedule_date', { ascending: true })
      
      if (scheds) {
        // Filter hanya jadwal yang melibatkan user ini
        const myPending = scheds.filter(s => s.technicians?.includes(profile.id))
        setPendingSchedules(myPending)
      }

      // Fetch recent logs
      const { data: recentLogs } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8)
      if (recentLogs) setLogs(recentLogs)

    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const StatCard = ({ title, value, icon: Icon, colorVar, subLabel }) => (
    <div className="stat-card" style={{ 
      padding: '20px', 
      borderRadius: '16px', 
      background: `linear-gradient(135deg, var(--bg-card) 0%, rgba(255,255,255,0.02) 100%)`, 
      border: `1px solid ${colorVar}30`, 
      position: 'relative', 
      overflow: 'hidden', 
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)' 
    }}>
      {/* Background Icon Watermark */}
      <Icon size={110} style={{ position: 'absolute', right: '-20px', bottom: '-20px', color: colorVar, opacity: 0.08, transform: 'rotate(-15deg)', zIndex: 0 }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="stat-card-label" style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</div>
          <div style={{ background: `${colorVar}15`, padding: '8px', borderRadius: '10px' }}>
            <Icon size={18} style={{ color: colorVar }} />
          </div>
        </div>
        <div>
          <div className="stat-card-value" style={{ color: colorVar, fontSize: '32px', fontWeight: 800, lineHeight: 1 }}>{value}</div>
          {subLabel && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>{subLabel}</div>}
        </div>
      </div>
    </div>
  )

  const getDateLabel = (dateStr) => {
    const d = new Date(dateStr)
    if (isToday(d)) return 'Hari ini'
    if (isYesterday(d)) return 'Kemarin'
    const diff = differenceInDays(new Date(), d)
    return `${diff} hari lalu`
  }

  const visibleAlerts = showAllAlerts ? overdueTickets : overdueTickets.slice(0, 3)

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px' }}>
          <p style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>{label}</p>
          {payload.map(p => (
            <p key={p.name} style={{ color: p.fill || p.stroke, fontSize: '13px' }}>
              {p.name}: <strong>{p.value}</strong>
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Dashboard Overview</h2>
          <p className="dashboard-date">{format(new Date(), 'EEEE, dd MMMM yyyy', { locale: id })}</p>
        </div>
        <div className="page-header-right">
          {(role === 'admin' || role === 'superadmin') && (
            <Link to="/maintenance" className="btn btn-primary">
              <Plus size={16} /> Input Tiket
            </Link>
          )}
        </div>
      </div>

      {/* ===== QUOTE OF THE DAY — TOP ===== */}
      <div className="quote-card" style={{ marginBottom: '12px' }}>
        <div className="quote-text">{quote.text}</div>
        <div className="quote-author">— {quote.author}</div>
      </div>

      {/* ===== ALERT: Maintenance Belum Close ===== */}
      {overdueTickets.length > 0 && (
        <div className="card mb-4" style={{ 
          borderColor: 'rgba(248, 81, 73, 0.3)', 
          background: 'linear-gradient(to right, rgba(248, 81, 73, 0.08), rgba(248, 81, 73, 0.02))', 
          padding: '16px 20px',
          boxShadow: '0 4px 12px rgba(248,81,73,0.05)'
        }}>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2.5">
              <div style={{ background: 'var(--danger)', borderRadius: '50%', padding: '6px', display: 'flex' }}>
                <AlertTriangle size={16} style={{ color: 'white' }} />
              </div>
              <span className="font-semibold" style={{ color: 'var(--danger)', fontSize: '14.5px', letterSpacing: '0.2px' }}>
                {overdueTickets.length} Tiket Kemarin Belum Selesai
              </span>
            </div>
            {overdueTickets.length > 3 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowAllAlerts(!showAllAlerts)}
                style={{ color: 'var(--danger)', flexShrink: 0, padding: '4px 8px', fontSize: '11.5px', background: 'rgba(248,81,73,0.1)' }}
              >
                {showAllAlerts ? <ChevronUp size={14} /> : <><ChevronDown size={14} /> Tampilkan Semua (+{overdueTickets.length - 3})</>}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {visibleAlerts.map((ticket) => (
              <div key={ticket.id} className="alert-ticket-row" style={{ padding: '12px 16px', background: 'var(--bg-primary)', borderColor: 'var(--border)', borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1, minWidth: 0 }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: ticket.status === 'pending' ? 'rgba(255,170,0,0.1)' : 'var(--danger-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: ticket.status === 'pending' ? '#ffaa00' : 'var(--danger)' }}>#{ticket.ticket_number}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ticket.customer_name} {ticket.village && <span className="text-secondary" style={{ fontSize: '11px' }}>({ticket.village})</span>}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ticket.complaint}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span className={`badge ${ticket.status === 'pending' ? '' : 'badge-danger'}`} style={{ fontSize: '10px', ...(ticket.status === 'pending' ? { background: 'rgba(255,170,0,0.15)', color: '#ffaa00', border: '1px solid rgba(255,170,0,0.3)' } : {}) }}>
                    {ticket.status === 'pending' ? <Clock size={9} /> : <AlertTriangle size={9} />} {ticket.status === 'pending' ? 'Pending' : 'Aktif'}
                  </span>
                  <Link to="/maintenance" className="btn btn-danger btn-sm" style={{ padding: '4px 10px', fontSize: '11px', background: ticket.status === 'pending' ? '#ffaa00' : 'var(--danger)', borderColor: ticket.status === 'pending' ? '#ffaa00' : 'var(--danger)', color: ticket.status === 'pending' ? 'black' : 'white' }}>
                    Selesai
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== ALERT: Tunggakan Pengeluaran ===== */}
      {pendingSchedules.length > 0 && (
        <div className="card mb-4" style={{ borderColor: 'rgba(248, 81, 73, 0.5)', background: 'rgba(248, 81, 73, 0.05)', padding: '14px 16px' }}>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} style={{ color: 'var(--danger)' }} />
              <span className="font-semibold" style={{ color: 'var(--danger)', fontSize: '13.5px' }}>
                {pendingSchedules.length} Jadwal Belum Dilaporkan!
              </span>
            </div>
            <Link to="/pengeluaran" className="btn btn-danger btn-sm" style={{ padding: '4px 12px', fontSize: '11px' }}>
              Isi Sekarang
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pendingSchedules.map(sched => (
              <div key={sched.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(248, 81, 73, 0.08)', borderRadius: '6px',
                padding: '8px 12px', gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--danger)' }}>
                    {format(new Date(sched.schedule_date), 'dd MMM yyyy', { locale: id })}
                  </span>
                  <span className="badge badge-danger" style={{ fontSize: '10px' }}>
                    {SITE_LABELS[sched.site] || sched.site}
                  </span>
                  <span className="badge badge-muted" style={{ fontSize: '10px' }}>
                    {WORK_LABELS[sched.work_type] || sched.work_type}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  ⚠ Belum diisi
                </span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--danger)', marginTop: '10px', fontStyle: 'italic' }}>
            Harap segera isi laporan pengeluaran untuk jadwal di atas. Jika tidak ada pengeluaran, tetap harus mengisi dengan catatan.
          </div>
        </div>
      )}

      {/* ===== STATS GRID ===== */}
      <div className="stats-grid mb-4">
        <StatCard title="Masuk Hari Ini" value={stats.maintenanceToday} icon={Wrench} colorVar="var(--accent)" />
        <StatCard title="Aktif Hari Ini" value={stats.maintenanceOpen} icon={AlertTriangle} colorVar="var(--danger)" />
        <StatCard title="Stok ONT" value={stats.stockOnt} icon={Package} colorVar="var(--success)" />
        <StatCard title="Dismantle Aktif" value={stats.dismantleActive} icon={ArrowDownToLine} colorVar="var(--danger)" />
      </div>

      {/* ===== CHARTS ROW ===== */}
      <div className="grid-2 mb-4">
        {/* Maintenance Chart 7 Hari */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Tren Maintenance 7 Hari</h3>
              <p className="text-secondary" style={{ fontSize: '12px', marginTop: '2px' }}>Tiket masuk, close, dan aktif</p>
            </div>
            <span className="badge badge-accent">
              <Wrench size={10} /> Mingguan
            </span>
          </div>
          <div style={{ height: '280px', marginTop: '10px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={maintenanceChartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.5} />
                <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11.5} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="var(--text-secondary)" fontSize={11.5} tickLine={false} axisLine={false} allowDecimals={false} dx={-10} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }} />
                <Bar dataKey="Masuk" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Aktif" fill="var(--danger)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Pending" fill="#ffaa00" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Close" fill="var(--success)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Maintenance by Status (Pie) */}
        <div className="card">
          <div className="flex justify-between items-center mb-3" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Status Tiket</h3>
              <p className="text-secondary" style={{ fontSize: '12px' }}>
                {statusFilter === 'hari' ? 'Hari ini' : statusFilter === 'bulan' ? `Bulan ${format(new Date(), 'MMMM yyyy', { locale: id })}` : statusFilter === 'tahun' ? `Tahun ${format(new Date(), 'yyyy')}` : 'Semua data'}
              </p>
            </div>
            <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border)', gap: '2px' }}>
              {[['hari', 'Hari Ini'], ['bulan', 'Bulan Ini'], ['tahun', 'Tahun Ini'], ['semua', 'Semua']].map(([key, label]) => (
                <button key={key} onClick={() => setStatusFilter(key)} style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', background: statusFilter === key ? 'var(--bg-card)' : 'transparent', color: statusFilter === key ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: statusFilter === key ? '0 2px 5px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s ease' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '30px', padding: '10px 0' }}>
            <div style={{ width: '160px', height: '160px', flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={maintenanceByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {maintenanceByStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, paddingRight: '20px' }}>
              {maintenanceByStatus.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between" style={{ marginBottom: '14px' }}>
                  <div className="flex items-center gap-3">
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: item.color, flexShrink: 0, boxShadow: `0 0 10px ${item.color}60` }} />
                    <span style={{ fontSize: '13.5px', color: 'var(--text-secondary)', fontWeight: 500 }}>{item.name}</span>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: '17px', color: 'var(--text-primary)' }}>{item.value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total</span>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                  {maintenanceByStatus.reduce((s, i) => s + i.value, 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== BOTTOM SECTION (LOGS & TICKETS) ===== */}
      <div className="grid-2">
        {/* RECENT ACTIVITY */}
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Log Aktivitas Terbaru</h3>
            <Link to="/logs" className="btn btn-ghost btn-sm text-accent">Lihat Semua</Link>
          </div>

          {logs.length > 0 ? (
            logs.map(log => (
              <div key={log.id} className="log-item">
                <div className="log-avatar" style={{
                  background: 'var(--accent-dim)',
                  color: 'var(--accent)',
                  width: '34px',
                  height: '34px',
                  fontSize: '13px',
                  fontWeight: 700,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {(log.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="log-content">
                  <div className="log-name">{log.full_name || log.username}</div>
                  <div className="log-action">
                    <span className="badge badge-muted" style={{ fontSize: '10px', marginRight: '6px' }}>{log.module}</span>
                    {log.action}
                  </div>
                  <div className="log-time">
                    {format(new Date(log.created_at), 'dd MMM yyyy, HH:mm', { locale: id })}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ padding: '30px 10px' }}>
              <History size={32} />
              <p>Belum ada aktivitas tercatat</p>
            </div>
          )}
        </div>

        {/* TIKET AKTIF TERBARU */}
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Tiket Aktif Terbaru</h3>
            <Link to="/maintenance" className="btn btn-ghost btn-sm text-accent">Lihat Semua</Link>
          </div>
          {recentActiveTickets.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentActiveTickets.map(ticket => (
                <div key={ticket.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ticket.full_name || ticket.customer_id}
                    </div>
                    <div className="text-secondary" style={{ fontSize: '11px', marginTop: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>
                      {ticket.complaint}
                    </div>
                  </div>
                  <span className="badge badge-danger" style={{ fontSize: '10px', marginLeft: '12px', flexShrink: 0 }}>Aktif</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '30px 10px' }}>
              <CheckCircle size={32} style={{ color: 'var(--success)' }} />
              <p>Semua tiket sudah terselesaikan!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


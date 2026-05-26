import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
const WORK_LABELS = { ikr_psb: 'IKR/PSB', maintenance: 'Maintenance' }

export default function Dashboard() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const [quote, setQuote] = useState({ text: '', author: '' })
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState([])
  const [overdueTickets, setOverdueTickets] = useState([])
  const [showAllAlerts, setShowAllAlerts] = useState(false)
  const [pendingSchedules, setPendingSchedules] = useState([])
  const [maintenanceChartData, setMaintenanceChartData] = useState([])
  const [maintenanceByStatus, setMaintenanceByStatus] = useState([])
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

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      // Fetch semua maintenance tickets
      const { data: allTickets } = await supabase
        .from('maintenance_tickets')
        .select('*')
        .order('date_input', { ascending: false })

      if (allTickets) {
        const todayTickets = allTickets.filter(t => isToday(new Date(t.created_at)))
        const openTickets = allTickets.filter(t => t.status === 'aktif')
        const unresolvedTickets = allTickets.filter(t => t.status === 'aktif' || t.status === 'pending')

        // Tiket Alert: aktif atau pending yang masuk TEPAT kemarin (H-1)
        let overdue = unresolvedTickets.filter(t => {
          return isYesterday(new Date(t.date_input))
        }).sort((a, b) => new Date(a.date_input) - new Date(b.date_input))

        // Untuk teknisi: hanya tampilkan tiket yang melibatkan mereka
        if (role === 'teknisi') {
          overdue = overdue.filter(t => t.technicians?.includes(profile.id))
        }

        setOverdueTickets(overdue)
        setStats(prev => ({
          ...prev,
          maintenanceToday: todayTickets.length,
          maintenanceOpen: unresolvedTickets.length, // total aktif & pending
        }))

        // Chart data: maintenance 7 hari terakhir
        const last7Days = Array.from({ length: 7 }, (_, i) => {
          const date = subDays(new Date(), 6 - i)
          const dateStr = format(date, 'yyyy-MM-dd')
          const dayTickets = allTickets.filter(t => t.date_input === dateStr)
          return {
            name: format(date, 'EEE', { locale: id }),
            Masuk: dayTickets.length,
            Close: dayTickets.filter(t => t.status === 'close').length,
            Aktif: dayTickets.filter(t => t.status === 'aktif').length,
            Pending: dayTickets.filter(t => t.status === 'pending').length,
          }
        })
        setMaintenanceChartData(last7Days)

        setMaintenanceByStatus([
          { name: 'Aktif', value: openTickets.length, color: 'var(--danger)' },
          { name: 'Pending', value: allTickets.filter(t => t.status === 'pending').length, color: '#ffaa00' },
          { name: 'Close', value: allTickets.filter(t => t.status === 'close').length, color: 'var(--success)' },
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
    <div className="stat-card stat-card-compact">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div className="stat-card-icon" style={{ background: `${colorVar}20`, width: '40px', height: '40px', flexShrink: 0 }}>
          <Icon size={20} style={{ color: colorVar }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="stat-card-value" style={{ color: colorVar, fontSize: '22px' }}>{value}</div>
          <div className="stat-card-label" style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
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
        <div className="card mb-3" style={{ borderColor: 'rgba(248, 81, 73, 0.4)', background: 'rgba(248, 81, 73, 0.04)', padding: '12px 14px' }}>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
              <span className="font-semibold" style={{ color: 'var(--danger)', fontSize: '13.5px' }}>
                {overdueTickets.length} Tiket Kemarin Belum Selesai
              </span>
            </div>
            {overdueTickets.length > 3 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowAllAlerts(!showAllAlerts)}
                style={{ color: 'var(--danger)', flexShrink: 0, padding: '2px 6px', fontSize: '11px' }}
              >
                {showAllAlerts ? <ChevronUp size={14} /> : <><ChevronDown size={14} /> +{overdueTickets.length - 3}</>}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {visibleAlerts.map((ticket) => (
              <div key={ticket.id} className="alert-ticket-row">
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
        <StatCard title="Tiket Aktif" value={stats.maintenanceOpen} icon={AlertTriangle} colorVar="var(--danger)" />
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
          <div style={{ height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={maintenanceChartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
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
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Status Tiket</h3>
              <p className="text-secondary" style={{ fontSize: '12px' }}>Distribusi semua tiket</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '120px', height: '120px', flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={maintenanceByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={55}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {maintenanceByStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1 }}>
              {maintenanceByStatus.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
                  <div className="flex items-center gap-2">
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{item.name}</span>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{item.value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total</span>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                  {maintenanceByStatus.reduce((s, i) => s + i.value, 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== RECENT ACTIVITY ===== */}
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
    </div>
  )
}

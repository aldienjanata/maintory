import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import {
  Users, Wrench, Package, Activity,
  ShieldAlert, Clock, Database, TrendingUp
} from 'lucide-react'

export default function WebMonitor() {
  const [stats, setStats] = useState(null)
  const [recentLogs, setRecentLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [])

  const loadStats = async () => {
    try {
      const [usersRes, ticketsRes, stockRes, logsRes, todayTickets] = await Promise.all([
        supabase.from('users').select('id, full_name, role, is_active, created_at'),
        supabase.from('maintenance_tickets').select('id, status, created_at'),
        supabase.from('warehouses').select('id, item_name'),
        supabase.from('activity_logs').select('id, action, user_id, created_at, users(full_name)').order('created_at', { ascending: false }).limit(15),
        supabase.from('maintenance_tickets').select('id').gte('created_at', new Date().toISOString().split('T')[0]),
      ])

      setStats({
        totalUsers: usersRes.data?.length || 0,
        activeUsers: usersRes.data?.filter(u => u.is_active).length || 0,
        totalTickets: ticketsRes.data?.length || 0,
        openTickets: ticketsRes.data?.filter(t => t.status === 'aktif').length || 0,
        todayTickets: todayTickets.data?.length || 0,
        totalStock: stockRes.data?.length || 0,
        users: usersRes.data || [],
      })
      setRecentLogs(logsRes.data || [])
    } catch (err) {
      console.error('Error loading stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const cardStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    padding: '20px',
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#6e7681' }}>
      <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
      Memuat data monitoring...
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
        {[
          { icon: <Users size={20} />, label: 'Total User', value: stats.totalUsers, sub: `${stats.activeUsers} aktif`, color: '#00a3ff' },
          { icon: <Wrench size={20} />, label: 'Total Tiket', value: stats.totalTickets, sub: `${stats.openTickets} belum selesai`, color: '#f97316' },
          { icon: <TrendingUp size={20} />, label: 'Tiket Hari Ini', value: stats.todayTickets, sub: 'dibuat hari ini', color: '#10b981' },
          { icon: <Package size={20} />, label: 'Item Stok', value: stats.totalStock, sub: 'jenis barang', color: '#8b5cf6' },
        ].map((s, i) => (
          <div key={i} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '10px',
              background: `${s.color}20`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: s.color, flexShrink: 0,
            }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: '#e6edf3', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '2px' }}>{s.label}</div>
              <div style={{ fontSize: '11px', color: '#6e7681' }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* User List */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Users size={16} color="#00a3ff" />
            <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: '14px' }}>Daftar User</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {stats.users.map(u => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', background: 'rgba(255,255,255,0.03)',
                borderRadius: '6px',
              }}>
                <div>
                  <div style={{ color: '#e6edf3', fontSize: '13px', fontWeight: 500 }}>{u.full_name}</div>
                  <div style={{ color: '#6e7681', fontSize: '11px' }}>{u.role}</div>
                </div>
                <span style={{
                  fontSize: '10px', padding: '2px 8px', borderRadius: '100px',
                  background: u.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                  color: u.is_active ? '#10b981' : '#ef4444',
                  fontWeight: 600,
                }}>
                  {u.is_active ? 'AKTIF' : 'NONAKTIF'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Activity size={16} color="#10b981" />
            <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: '14px' }}>Aktivitas Terbaru</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recentLogs.length === 0 ? (
              <p style={{ color: '#6e7681', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                Belum ada aktivitas
              </p>
            ) : recentLogs.map(log => (
              <div key={log.id} style={{
                padding: '8px 10px', background: 'rgba(255,255,255,0.03)',
                borderRadius: '6px', borderLeft: '2px solid #10b98130',
              }}>
                <div style={{ color: '#e6edf3', fontSize: '12px' }}>{log.action}</div>
                <div style={{ color: '#6e7681', fontSize: '11px', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{log.users?.full_name || 'Unknown'}</span>
                  <span>{new Date(log.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

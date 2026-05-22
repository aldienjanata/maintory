import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import toast from 'react-hot-toast'
import { Search, Trash2, History, Filter } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'

const MODULES = ['Auth', 'Maintenance', 'Stok Gudang', 'Serial Number', 'Dropcore', 'Pengeluaran', 'Dismantle', 'Pergantian ONT', 'Settings']

export default function ActivityLogs() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => { fetchLogs() }, [page, moduleFilter, dateFilter])

  const fetchLogs = async () => {
    setLoading(true)
    let query = supabase.from('activity_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (moduleFilter !== 'all') query = query.eq('module', moduleFilter)
    if (dateFilter) {
      const start = `${dateFilter}T00:00:00Z`
      const end = `${dateFilter}T23:59:59Z`
      query = query.gte('created_at', start).lte('created_at', end)
    }

    const { data, error } = await query
    if (!error) setLogs(data || [])
    setLoading(false)
  }

  const handleClearLogs = async () => {
    if (!window.confirm('Hapus semua log aktivitas? Tindakan ini tidak bisa dibatalkan!')) return
    const { error } = await supabase.from('activity_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (!error) { toast.success('Log berhasil dihapus'); fetchLogs() }
    else toast.error('Gagal menghapus log')
  }

  const filtered = logs.filter(l =>
    l.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.detail?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getRoleBadge = (r) => {
    const map = { superadmin: 'badge-danger', admin: 'badge-accent', teknisi: 'badge-success' }
    return <span className={`badge ${map[r] || 'badge-muted'}`}>{r}</span>
  }

  const getModuleBadge = (mod) => {
    const colorMap = {
      'Auth': 'badge-purple', 'Maintenance': 'badge-warning', 'Stok Gudang': 'badge-info',
      'Serial Number': 'badge-accent', 'Dropcore': 'badge-orange', 'Pengeluaran': 'badge-success',
      'Dismantle': 'badge-danger', 'Pergantian ONT': 'badge-info', 'Settings': 'badge-muted',
    }
    return <span className={`badge ${colorMap[mod] || 'badge-muted'}`}>{mod}</span>
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Log Aktivitas</h2>
          <p>Riwayat semua tindakan pengguna dalam sistem</p>
        </div>
        <div className="page-header-right">
          {can(role, 'logs.delete') && (
            <button className="btn btn-danger" onClick={handleClearLogs}>
              <Trash2 size={15} /> Hapus Semua Log
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Cari username, aksi, detail..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <select className="filter-select" value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); setPage(0) }}>
            <option value="all">Semua Modul</option>
            {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="date" className="filter-select" value={dateFilter} onChange={e => { setDateFilter(e.target.value); setPage(0) }} style={{ padding: '0 12px' }} />
          {(dateFilter || moduleFilter !== 'all') && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setDateFilter(''); setModuleFilter('all'); setPage(0) }}>Reset Filter</button>
          )}
        </div>

        <div className="table-container">
          {loading ? (
            <div className="flex-center" style={{ height: '180px' }}><div className="spinner" /></div>
          ) : filtered.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Modul</th>
                  <th>Aksi</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }} className="text-secondary">
                      {format(new Date(log.created_at), 'dd MMM yy, HH:mm', { locale: id })}
                    </td>
                    <td>
                      <div className="font-semibold">{log.username || '-'}</div>
                    </td>
                    <td>{getRoleBadge(log.role)}</td>
                    <td>{getModuleBadge(log.module)}</td>
                    <td className="font-semibold" style={{ fontSize: '13px' }}>{log.action}</td>
                    <td className="text-secondary" style={{ fontSize: '12px', maxWidth: '250px' }}>{log.detail || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state"><History size={48} /><h3>Tidak Ada Log</h3><p>Belum ada aktivitas tercatat sesuai filter.</p></div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center mt-4">
          <span className="text-secondary" style={{ fontSize: '12px' }}>{filtered.length} entri ditampilkan</span>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Sebelumnya</button>
            <span className="btn btn-ghost btn-sm" style={{ cursor: 'default' }}>Hal. {page + 1}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => p + 1)} disabled={logs.length < PAGE_SIZE}>Berikutnya →</button>
          </div>
        </div>
      </div>
    </div>
  )
}

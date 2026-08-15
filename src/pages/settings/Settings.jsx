import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { 
  Settings as SettingsIcon, Users, UserPlus, Trash2, Edit2, X, 
  Eye, EyeOff, Key, Building, Shield, CheckCircle,
  Database, Download, AlertTriangle
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useProgress } from '../../contexts/ProgressContext'

const ROLES = ['superadmin', 'admin', 'teknisi', 'backbone']

export default function Settings() {
  const { profile, refreshProfile } = useAuth()
  const role = profile?.role || 'teknisi'
  const { showProgress, hideProgress } = useProgress()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('users')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Branch settings
  const [branchName, setBranchName] = useState('Cabang Banyumas')
  const [savingBranch, setSavingBranch] = useState(false)

  const emptyForm = { username: '', full_name: '', role: 'teknisi', password: '', is_active: true }
  const [form, setForm] = useState(emptyForm)
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null, action: '', title: '', text: '' })

  // Change own password
  const [changePwForm, setChangePwForm] = useState({ current: '', newPw: '', confirm: '' })
  const [savingPw, setSavingPw] = useState(false)

  // Data Cleanup
  const [tableCounts, setTableCounts] = useState({})
  const [tableSizes, setTableSizes] = useState({})
  const [dbSize, setDbSize] = useState(null)
  const [cleanupForm, setCleanupForm] = useState({ table: 'activity_logs', age: '3_months' })
  const [cleanupExecuting, setCleanupExecuting] = useState(false)
  const [refreshingCounts, setRefreshingCounts] = useState(false)

  useEffect(() => {
    fetchUsers()
    fetchBranchSettings()
    if (can(role, 'settings.archive')) fetchTableCounts()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('users').select('*').not('username', 'like', '[deleted]%').order('role').order('full_name')
    if (!error) setUsers(data || [])
    setLoading(false)
  }

  const fetchBranchSettings = async () => {
    const { data } = await supabase.from('app_settings').select('*').single()
    if (data) setBranchName(data.branch_name)
  }

  // Perkiraan ukuran rata-rata per baris per tabel (dalam bytes)
  const AVG_ROW_SIZE = {
    activity_logs: 300,
    dispatches: 600,
    dispatch_items: 400,
    daily_expenses: 400,
    expense_items: 300,
    maintenance_tickets: 800,
    serial_numbers: 200,
    dropcore_haspels: 250,
    adss_haspels: 280,
    dismantles: 600,
    ont_replacements: 350,
  }

  const formatSize = (bytes) => {
    if (bytes === undefined || bytes === null) return '...'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const fetchTableCounts = async () => {
    setRefreshingCounts(true)
    const tables = [
      'activity_logs', 'dispatches', 'dispatch_items',
      'daily_expenses', 'expense_items',
      'maintenance_tickets',
      'serial_numbers', 'dropcore_haspels', 'adss_haspels',
      'dismantles', 'ont_replacements',
    ]
    const counts = {}
    const sizes = {}
    for (const table of tables) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
      const c = count || 0
      counts[table] = c
      sizes[table] = c * (AVG_ROW_SIZE[table] || 300)
    }
    setTableCounts(counts)
    setTableSizes(sizes)

    try {
      const { data, error } = await supabase.rpc('get_db_size')
      if (!error && data) setDbSize(data)
    } catch (err) {
      console.log('get_db_size rpc might not exist yet')
    }
    setRefreshingCounts(false)
  }

  const openAdd = () => { setEditUser(null); setForm(emptyForm); setIsModalOpen(true) }
  const openEdit = (u) => {
    setEditUser(u)
    setForm({ username: u.username, full_name: u.full_name, role: u.role, password: '', is_active: u.is_active })
    setIsModalOpen(true)
  }

  const handleSaveUser = async () => {
    if (!form.username || !form.full_name) { toast.error('Username dan nama lengkap wajib diisi'); return }
    if (!editUser && !form.password) { toast.error('Password wajib diisi untuk user baru'); return }
    setSaving(true)
    try {
      if (editUser) {
        const { error } = await supabase.from('users').update({ full_name: form.full_name, role: form.role, is_active: form.is_active, updated_at: new Date().toISOString() }).eq('id', editUser.id)
        if (error) throw error
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Settings', action: 'Edit User', detail: `User: ${form.username}` })
        toast.success('User berhasil diperbarui')
      } else {
        // Buat user baru melalui Vercel API
        const email = `${form.username}@maintory.local`
        const response = await fetch('/api/createUser', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password: form.password,
            username: form.username,
            full_name: form.full_name,
            role: form.role
          })
        })

        const result = await response.json()
        
        if (!response.ok) {
          throw new Error(result.error || 'Gagal membuat user')
        }

        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Settings', action: 'Tambah User', detail: `User baru: ${form.username} (${form.role})` })
        toast.success('User berhasil ditambahkan')
      }
      setIsModalOpen(false)
      fetchUsers()
    } catch (err) {
      toast.error('Gagal: ' + (err.message || 'Terjadi kesalahan'))
    } finally { setSaving(false) }
  }

  const handleDeleteUser = async () => {
    const u = confirmModal.item
    setConfirmModal({ ...confirmModal, isOpen: false })
    
    const loadingToast = toast.loading('Menghapus user...')
    try {
      const response = await fetch('/api/deleteUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Gagal menghapus user')

      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Settings', action: 'Hapus User', detail: `User: ${u.username}` })
      toast.success('User berhasil dihapus', { id: loadingToast })
      fetchUsers()
    } catch (err) {
      toast.error(err.message, { id: loadingToast })
    }
  }

  const handleToggleActive = async (u) => {
    const { error } = await supabase.from('users').update({ is_active: !u.is_active, updated_at: new Date().toISOString() }).eq('id', u.id)
    if (!error) {
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Settings', action: u.is_active ? 'Nonaktifkan User' : 'Aktifkan User', detail: u.username })
      toast.success(u.is_active ? 'User dinonaktifkan' : 'User diaktifkan')
      fetchUsers()
    }
  }

  const handleChangePassword = async () => {
    if (!changePwForm.newPw || changePwForm.newPw.length < 6) { toast.error('Password minimal 6 karakter'); return }
    if (changePwForm.newPw !== changePwForm.confirm) { toast.error('Konfirmasi password tidak cocok'); return }
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: changePwForm.newPw })
    if (!error) {
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Settings', action: 'Ganti Password', detail: '' })
      toast.success('Password berhasil diubah')
      setChangePwForm({ current: '', newPw: '', confirm: '' })
    } else {
      toast.error('Gagal mengubah password: ' + error.message)
    }
    setSavingPw(false)
  }

  const handleSaveBranch = async () => {
    setSavingBranch(true)
    const { error } = await supabase.from('app_settings').update({ branch_name: branchName, updated_at: new Date().toISOString(), updated_by: profile.id }).eq('id', 1)
    if (!error) {
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Settings', action: 'Ubah Nama Cabang', detail: branchName })
      toast.success('Nama cabang berhasil diperbarui')
    } else toast.error('Gagal menyimpan')
    setSavingBranch(false)
  }

  const handleCleanup = async () => {
    if (!cleanupForm.table) return
    if (!window.confirm(`Yakin ingin MENGARSIPKAN dan MENGHAPUS data dari ${cleanupForm.table}? Data yang dihapus tidak bisa dikembalikan ke sistem.`)) return
    
    // Calculate cutoff date based on age
    const cutoff = new Date()
    if (cleanupForm.age === '1_month') cutoff.setMonth(cutoff.getMonth() - 1)
    else if (cleanupForm.age === '3_months') cutoff.setMonth(cutoff.getMonth() - 3)
    else if (cleanupForm.age === '6_months') cutoff.setMonth(cutoff.getMonth() - 6)
    else if (cleanupForm.age === '1_year') cutoff.setFullYear(cutoff.getFullYear() - 1)
    
    const cutoffIso = cutoff.toISOString()
    const cutoffDate = cutoffIso.split('T')[0] // for dates

    setCleanupExecuting(true)
    showProgress('Pembersihan Data', 'Mengambil data lama...', 10)

    try {
      let dataToExport = []
      let parentIds = []

      if (cleanupForm.table === 'activity_logs') {
        const { data, error } = await supabase.from('activity_logs').select('*').lt('created_at', cutoffIso)
        if (error) throw error
        dataToExport = data
      } else if (cleanupForm.table === 'dispatches') {
        const { data, error } = await supabase.from('dispatches').select('*, dispatch_items(*)').lt('dispatch_date', cutoffDate).eq('status', 'selesai')
        if (error) throw error
        parentIds = data.map(d => d.id)
        dataToExport = data.flatMap(d => {
           if (!d.dispatch_items || d.dispatch_items.length === 0) return [d]
           return d.dispatch_items.map(item => ({ ...d, dispatch_items: undefined, item_id: item.id, item_type: item.item_type, qty: item.quantity, note: item.note }))
        })
      } else if (cleanupForm.table === 'daily_expenses') {
        const { data, error } = await supabase.from('daily_expenses').select('*, expense_items(*)').lt('expense_date', cutoffDate)
        if (error) throw error
        parentIds = data.map(d => d.id)
        dataToExport = data.flatMap(d => {
           if (!d.expense_items || d.expense_items.length === 0) return [d]
           return d.expense_items.map(item => ({ ...d, expense_items: undefined, item_id: item.id, item_type: item.item_type, qty: item.quantity, note: item.note }))
        })
      } else if (cleanupForm.table === 'maintenance_tickets') {
        const { data, error } = await supabase.from('maintenance_tickets').select('*').lt('date_input', cutoffDate).eq('status', 'close')
        if (error) throw error
        dataToExport = data
      } else if (cleanupForm.table === 'dismantles') {
        const { data, error } = await supabase.from('dismantles').select('*').lt('date_input', cutoffDate).eq('aksi', 'close')
        if (error) throw error
        dataToExport = data
      } else if (cleanupForm.table === 'ont_replacements') {
        const { data, error } = await supabase.from('ont_replacements').select('*').lt('replacement_date', cutoffDate)
        if (error) throw error
        dataToExport = data
      }

      if (dataToExport.length === 0) {
        toast.success('Tidak ada data lama yang ditemukan untuk kriteria ini.')
        hideProgress()
        setCleanupExecuting(false)
        return
      }

      showProgress('Pembersihan Data', 'Membuat file Excel...', 40)
      
      // Export to Excel
      const ws = XLSX.utils.json_to_sheet(dataToExport)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Arsip")
      XLSX.writeFile(wb, `Arsip_${cleanupForm.table}_${cutoffDate}.xlsx`)

      showProgress('Pembersihan Data', 'Menghapus data dari database...', 70)

      // Delete from DB Safely (Items first if needed)
      let delError = null
      if (cleanupForm.table === 'activity_logs') {
        const { error } = await supabase.from('activity_logs').delete().lt('created_at', cutoffIso)
        delError = error
      } else if (cleanupForm.table === 'dispatches' && parentIds.length > 0) {
        await supabase.from('dispatch_items').delete().in('dispatch_id', parentIds)
        const { error } = await supabase.from('dispatches').delete().in('id', parentIds)
        delError = error
      } else if (cleanupForm.table === 'daily_expenses' && parentIds.length > 0) {
        await supabase.from('expense_items').delete().in('expense_id', parentIds)
        const { error } = await supabase.from('daily_expenses').delete().in('id', parentIds)
        delError = error
      } else if (cleanupForm.table === 'maintenance_tickets' && dataToExport.length > 0) {
        const ids = dataToExport.map(d => d.id)
        const { error } = await supabase.from('maintenance_tickets').delete().in('id', ids)
        delError = error
      } else if (cleanupForm.table === 'dismantles' && dataToExport.length > 0) {
        const ids = dataToExport.map(d => d.id)
        const { error } = await supabase.from('dismantles').delete().in('id', ids)
        delError = error
      } else if (cleanupForm.table === 'ont_replacements' && dataToExport.length > 0) {
        const ids = dataToExport.map(d => d.id)
        const { error } = await supabase.from('ont_replacements').delete().in('id', ids)
        delError = error
      }

      if (delError) throw delError

      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Settings', action: 'Archive & Delete Data', detail: `Tabel ${cleanupForm.table} sebelum ${cutoffDate}` })
      
      toast.success(`${dataToExport.length} baris berhasil diarsip dan dihapus!`)
      fetchTableCounts()
      
    } catch (err) {
      console.error(err)
      toast.error('Terjadi kesalahan: ' + err.message)
    }
    
    hideProgress()
    setCleanupExecuting(false)
  }

  const getRoleBadge = (r) => {
    const map = { superadmin: 'badge-danger', admin: 'badge-accent', teknisi: 'badge-success', backbone: 'badge-warning' }
    return <span className={`badge ${map[r] || 'badge-muted'}`}><Shield size={10} /> {r}</span>
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Pengaturan</h2>
          <p>Kelola pengguna, akses, dan konfigurasi sistem</p>
        </div>
      </div>

      <div className="tabs">
        {can(role, 'settings.users') && (
          <button className={`tab-item ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
            <Users size={14} style={{ marginRight: '6px' }} /> Manajemen Pengguna
          </button>
        )}
        <button className={`tab-item ${activeTab === 'password' ? 'active' : ''}`} onClick={() => setActiveTab('password')}>
          <Key size={14} style={{ marginRight: '6px' }} /> Ganti Password
        </button>
        {can(role, 'settings.branch') && (
          <button className={`tab-item ${activeTab === 'branch' ? 'active' : ''}`} onClick={() => setActiveTab('branch')}>
            <Building size={14} style={{ marginRight: '6px' }} /> Konfigurasi Cabang
          </button>
        )}
        {can(role, 'settings.archive') && (
          <button className={`tab-item ${activeTab === 'cleanup' ? 'active' : ''}`} onClick={() => setActiveTab('cleanup')}>
            <Database size={14} style={{ marginRight: '6px' }} /> Pembersihan Data
          </button>
        )}
      </div>

      {/* Tab: Manajemen Pengguna */}
      {activeTab === 'users' && can(role, 'settings.users') && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Daftar Pengguna ({users.length})</h3>
            {can(role, 'settings.adduser') && (
              <button className="btn btn-primary" onClick={openAdd}><UserPlus size={15} /> Tambah User</button>
            )}
          </div>
          <div className="table-container">
            {loading ? (
              <div className="flex-center" style={{ height: '150px' }}><div className="spinner" /></div>
            ) : (
              <>
                <table className="desktop-only">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Nama Lengkap</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{u.username}</span></td>
                        <td>{u.full_name}</td>
                        <td>{getRoleBadge(u.role)}</td>
                        <td>
                          {u.is_active
                            ? <span className="badge badge-success"><CheckCircle size={10} /> Aktif</span>
                            : <span className="badge badge-muted">Nonaktif</span>
                          }
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="flex" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                            <button className="btn-icon" onClick={() => openEdit(u)} title="Edit"><Edit2 size={15} /></button>
                            <button className="btn-icon text-danger" onClick={() => setConfirmModal({ isOpen: true, item: u, action: 'delete_user', title: 'Hapus Pengguna', text: `Yakin ingin menghapus ${u.full_name} (${u.username}) secara permanen?` })} title="Hapus"><Trash2 size={15} /></button>
                            <button
                              className={`btn-icon ${u.is_active ? 'text-warning' : 'text-success'}`}
                              onClick={() => handleToggleActive(u)}
                              title={u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                              disabled={u.id === profile?.id}
                            >
                              {u.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mobile-only mobile-card-list">
                  {users.map(u => (
                    <div key={u.id} className="mobile-card">
                      <div className="mobile-card-header" style={{ cursor: 'default' }}>
                        <div style={{ flex: 1 }}>
                          <div className="mobile-card-title" style={{ fontFamily: 'monospace' }}>{u.username}</div>
                          <div className="mobile-card-subtitle">{u.full_name}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          {getRoleBadge(u.role)}
                          {u.is_active
                            ? <span className="badge badge-success"><CheckCircle size={10} /> Aktif</span>
                            : <span className="badge badge-muted">Nonaktif</span>
                          }
                        </div>
                      </div>
                      <div className="mobile-card-body">
                        <div className="mobile-card-actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}><Edit2 size={14} /> Edit</button>
                          <button className="btn btn-secondary btn-sm text-danger" onClick={() => setConfirmModal({ isOpen: true, item: u, action: 'delete_user', title: 'Hapus Pengguna', text: `Yakin ingin menghapus ${u.full_name} (${u.username}) secara permanen?` })}><Trash2 size={14} /> Hapus</button>
                          <button
                            className={`btn btn-sm ${u.is_active ? 'btn-secondary text-warning' : 'btn-secondary text-success'}`}
                            onClick={() => handleToggleActive(u)}
                            disabled={u.id === profile?.id}
                          >
                            {u.is_active ? <><EyeOff size={14} /> Nonaktifkan</> : <><Eye size={14} /> Aktifkan</>}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab: Ganti Password */}
      {activeTab === 'password' && (
        <div className="card" style={{ maxWidth: '480px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '20px' }}>Ganti Password Akun Anda</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Password Baru</label>
              <div className="input-with-btn">
                <input type={showPassword ? 'text' : 'password'} className="form-input" placeholder="Min. 6 karakter" value={changePwForm.newPw} onChange={e => setChangePwForm(f => ({ ...f, newPw: e.target.value }))} />
                <button className="toggle-btn" type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Konfirmasi Password Baru</label>
              <input type="password" className="form-input" placeholder="Ulangi password baru" value={changePwForm.confirm} onChange={e => setChangePwForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
            <button className="btn btn-primary" onClick={handleChangePassword} disabled={savingPw} style={{ marginTop: '4px' }}>
              {savingPw ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : <><Key size={15} /> Simpan Password</>}
            </button>
          </div>
        </div>
      )}

      {/* Tab: Konfigurasi Cabang */}
      {activeTab === 'branch' && can(role, 'settings.branch') && (
        <div className="card" style={{ maxWidth: '480px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '20px' }}>Konfigurasi Cabang</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Nama Cabang</label>
              <input className="form-input" value={branchName} onChange={e => setBranchName(e.target.value)} placeholder="Cabang Banyumas" />
            </div>
            <button className="btn btn-primary" onClick={handleSaveBranch} disabled={savingBranch}>
              {savingBranch ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : <><Building size={15} /> Simpan Konfigurasi</>}
            </button>
          </div>
        </div>
      )}

      {/* Tab: Pembersihan Data */}
      {activeTab === 'cleanup' && can(role, 'settings.archive') && (
        <div className="grid-2">
          {/* Bagian Kiri: Analyzer */}
          <div className="card">
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} className="text-accent" /> Storage Analyzer
            </h3>
            
            {dbSize !== null && (
              <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--bg-hover)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}>
                  <span>Penggunaan Database</span>
                  <span>{((dbSize / (1024 * 1024))).toFixed(2)} MB / 500 MB</span>
                </div>
                <div style={{ width: '100%', height: '10px', background: 'var(--border)', borderRadius: '5px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{ 
                    height: '100%', 
                    background: (dbSize / (500 * 1024 * 1024)) > 0.8 ? 'var(--danger)' : (dbSize / (500 * 1024 * 1024)) > 0.5 ? 'var(--warning)' : 'var(--success)',
                    width: `${Math.min((dbSize / (500 * 1024 * 1024)) * 100, 100)}%`,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--secondary)' }}>
                  Sisa kapasitas: <strong>{((500 * 1024 * 1024 - dbSize) / (1024 * 1024)).toFixed(2)} MB</strong>
                </div>
              </div>
            )}

            <p className="text-secondary" style={{ fontSize: '13px', marginBottom: '16px' }}>
              Perkiraan jumlah baris pada tabel-tabel utama:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { key: 'activity_logs', label: 'Log Aktivitas', group: 'Log & Operasional' },
                { key: 'dispatches', label: 'Bon Barang (Header)', group: 'Log & Operasional' },
                { key: 'dispatch_items', label: '↳ Item Bon Barang', group: 'Log & Operasional' },
                { key: 'daily_expenses', label: 'Pengeluaran Tim (Header)', group: 'Log & Operasional' },
                { key: 'expense_items', label: '↳ Item Pengeluaran', group: 'Log & Operasional' },
                { key: 'maintenance_tickets', label: 'Tiket Maintenance', group: 'Log & Operasional' },
                { key: 'dismantles', label: 'Dismantle', group: 'Log & Operasional' },
                { key: 'ont_replacements', label: 'Pergantian ONT', group: 'Log & Operasional' },
                { key: 'serial_numbers', label: 'Serial Number ONT', group: 'Data Master' },
                { key: 'dropcore_haspels', label: 'Haspel Dropcore', group: 'Data Master' },
                { key: 'adss_haspels', label: 'Haspel ADSS', group: 'Data Master' },
              ].map((t, i, arr) => {
                const count = tableCounts[t.key]
                const estBytes = tableSizes[t.key] || 0
                const isHeader = i === 0 || arr[i - 1].group !== t.group
                return (
                  <div key={t.key}>
                    {isHeader && (
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: i > 0 ? '8px' : '0', marginBottom: '6px' }}>
                        {t.group}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'var(--bg-hover)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '13px', fontWeight: t.key.startsWith('↳') || t.label.startsWith('↳') ? 400 : 500, color: t.label.startsWith('↳') ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{t.label}</span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {refreshingCounts ? '...' : formatSize(estBytes)}
                        </span>
                        <span className={`badge ${count > 5000 ? 'badge-danger' : count > 1000 ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '11px', minWidth: '70px', textAlign: 'center' }}>
                          {refreshingCounts ? '...' : count !== undefined ? `${count.toLocaleString()} baris` : '...'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '16px', width: '100%', justifyContent: 'center' }}
              onClick={fetchTableCounts}
              disabled={refreshingCounts}
            >
              {refreshingCounts
                ? <><span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} /> Memuat...
                  </>
                : '🔄 Refresh Data'
              }
            </button>
          </div>

          {/* Bagian Kanan: Eksekusi */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)' }}>
              <AlertTriangle size={16} /> Arsip & Hapus Data Lama
            </h3>
            <div style={{ padding: '12px', background: 'var(--danger-dim)', border: '1px solid var(--danger)', borderRadius: '6px', marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', color: 'var(--danger)', margin: 0, lineHeight: 1.5 }}>
                <strong>Peringatan:</strong> Fitur ini akan menghapus data lama dari database secara permanen untuk menghemat ruang. 
                Data akan <strong>diunduh ke format Excel (XLSX)</strong> terlebih dahulu sebelum dihapus. Simpan file hasil unduhan dengan baik.
              </p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
              <div className="form-group">
                <label className="form-label">Tabel yang Dibersihkan</label>
                <select className="form-input" style={{ height: 'auto' }} value={cleanupForm.table} onChange={e => setCleanupForm({ ...cleanupForm, table: e.target.value })}>
                  <optgroup label="── Log & Operasional ──">
                    <option value="activity_logs">Log Aktivitas (Paling disarankan)</option>
                    <option value="dispatches">Bon Barang — status Selesai (Termasuk Item)</option>
                    <option value="daily_expenses">Pengeluaran Tim (Termasuk Item)</option>
                    <option value="maintenance_tickets">Tiket Maintenance — status Close</option>
                    <option value="dismantles">Dismantle — status Close</option>
                    <option value="ont_replacements">Pergantian ONT</option>
                  </optgroup>
                </select>
              </div>
              
              <div className="form-group">
                <label className="form-label">Rentang Waktu (Hapus Data Lebih Lama Dari)</label>
                <select className="form-input" style={{ height: 'auto' }} value={cleanupForm.age} onChange={e => setCleanupForm({ ...cleanupForm, age: e.target.value })}>
                  <option value="1_month">1 Bulan Lalu</option>
                  <option value="3_months">3 Bulan Lalu</option>
                  <option value="6_months">6 Bulan Lalu</option>
                  <option value="1_year">1 Tahun Lalu</option>
                </select>
              </div>
            </div>

            <button className="btn btn-primary" style={{ background: 'var(--danger)', color: 'white', marginTop: '20px' }} onClick={handleCleanup} disabled={cleanupExecuting}>
              {cleanupExecuting ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderColor: 'white', borderRightColor: 'transparent' }} /> : <><Download size={15} /> Arsip & Hapus Data</>}
            </button>
          </div>
        </div>
      )}

      {/* Modal Add/Edit User */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{editUser ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Username <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="form-input" placeholder="huruf kecil, tanpa spasi" value={form.username} disabled={!!editUser} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Nama Lengkap <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="form-input" placeholder="Nama lengkap" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-input" style={{ height: 'auto' }} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {!editUser && (
                <div className="form-group">
                  <label className="form-label">Password <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <div className="input-with-btn">
                    <input type={showPassword ? 'text' : 'password'} className="form-input" placeholder="Min. 6 karakter" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                    <button className="toggle-btn" type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSaveUser} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : (editUser ? 'Simpan Perubahan' : 'Buat Pengguna')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>{confirmModal.title}</h2>
              <button className="btn-icon" onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ color: 'var(--text-secondary)' }}>
              {confirmModal.text}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}>Batal</button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)', color: 'white', borderColor: 'var(--danger)' }} onClick={() => {
                if (confirmModal.action === 'delete_user') handleDeleteUser()
              }}>
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { 
  Settings as SettingsIcon, Users, UserPlus, Trash2, Edit2, X, 
  Eye, EyeOff, Key, Building, Shield, CheckCircle
} from 'lucide-react'

const ROLES = ['superadmin', 'admin', 'teknisi']

export default function Settings() {
  const { profile, refreshProfile } = useAuth()
  const role = profile?.role || 'teknisi'

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

  // Change own password
  const [changePwForm, setChangePwForm] = useState({ current: '', newPw: '', confirm: '' })
  const [savingPw, setSavingPw] = useState(false)

  useEffect(() => {
    fetchUsers()
    fetchBranchSettings()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('users').select('*').order('role').order('full_name')
    if (!error) setUsers(data || [])
    setLoading(false)
  }

  const fetchBranchSettings = async () => {
    const { data } = await supabase.from('app_settings').select('*').single()
    if (data) setBranchName(data.branch_name)
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
        // Register new user via Supabase Auth
        const email = `${form.username}@maintory.local`
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
          email, password: form.password, email_confirm: true,
          user_metadata: { username: form.username, full_name: form.full_name, role: form.role }
        })
        if (authErr) throw authErr

        // Insert into public.users
        const { error: dbErr } = await supabase.from('users').insert({
          id: authData.user.id,
          username: form.username,
          full_name: form.full_name,
          role: form.role,
          is_active: true
        })
        if (dbErr) throw dbErr

        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Settings', action: 'Tambah User', detail: `User baru: ${form.username} (${form.role})` })
        toast.success('User berhasil ditambahkan')
      }
      setIsModalOpen(false)
      fetchUsers()
    } catch (err) {
      toast.error('Gagal: ' + (err.message || 'Terjadi kesalahan'))
    } finally { setSaving(false) }
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

  const getRoleBadge = (r) => {
    const map = { superadmin: 'badge-danger', admin: 'badge-accent', teknisi: 'badge-success' }
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
    </div>
  )
}

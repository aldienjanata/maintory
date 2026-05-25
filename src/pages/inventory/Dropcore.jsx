import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, Cable, AlertTriangle, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'

export default function Dropcore() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'

  const [haspels, setHaspels] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ haspel_code: '', type: '1c', initial_meters: 1000, used_meters: 0, date_in: format(new Date(), 'yyyy-MM-dd'), note: '' })
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => { fetchHaspels() }, [])

  const fetchHaspels = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('dropcore_haspels').select('*').order('date_in', { ascending: false })
    if (!error) setHaspels(data || [])
    setLoading(false)
  }

  const generateNextCode = (typeToGenerate, currentHaspels = haspels) => {
    const typePrefix = typeToGenerate === '1c' ? 'H1C-' : 'H4C-'
    const existingNums = currentHaspels
      .filter(h => h.haspel_code && h.haspel_code.toUpperCase().startsWith(typePrefix))
      .map(h => {
        const numStr = h.haspel_code.substring(typePrefix.length)
        return parseInt(numStr, 10)
      })
      .filter(n => !isNaN(n))
    
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1
    return `${typePrefix}${String(nextNum).padStart(3, '0')}`
  }

  const openAdd = () => {
    setEditItem(null)
    setForm({ haspel_code: generateNextCode('1c'), type: '1c', initial_meters: 1000, used_meters: 0, date_in: format(new Date(), 'yyyy-MM-dd'), note: '' })
    setIsModalOpen(true)
  }

  const openEdit = (h) => {
    setEditItem(h)
    setForm({ haspel_code: h.haspel_code, type: h.type, initial_meters: h.initial_meters, used_meters: h.used_meters, date_in: h.date_in, note: h.note || '' })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.haspel_code) { toast.error('Kode Haspel wajib diisi'); return }
    if (Number(form.used_meters) > Number(form.initial_meters)) { toast.error('Meter terpakai tidak boleh melebihi meter awal'); return }
    setSaving(true)
    const remaining = Number(form.initial_meters) - Number(form.used_meters)
    const status = remaining <= 0 ? 'habis' : 'tersedia'
    try {
      if (editItem) {
        const { error } = await supabase.from('dropcore_haspels').update({ ...form, status, updated_at: new Date().toISOString() }).eq('id', editItem.id)
        if (error) throw error
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dropcore', action: 'Edit Haspel', detail: `Haspel: ${form.haspel_code}` })
        toast.success('Haspel berhasil diperbarui')
      } else {
        const { error } = await supabase.from('dropcore_haspels').insert({ ...form, status, created_by: profile.id })
        if (error) throw error
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dropcore', action: 'Tambah Haspel', detail: `Haspel: ${form.haspel_code}` })
        toast.success('Haspel berhasil ditambahkan')
      }
      setIsModalOpen(false)
      fetchHaspels()
    } catch (err) {
      toast.error(err.code === '23505' ? 'Kode haspel sudah digunakan!' : 'Gagal: ' + err.message)
    } finally { setSaving(false) }
  }

  const handleDelete = async (h) => {
    if (!window.confirm(`Hapus haspel ${h.haspel_code}?`)) return
    await supabase.from('dropcore_haspels').delete().eq('id', h.id)
    await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dropcore', action: 'Hapus Haspel', detail: h.haspel_code })
    toast.success('Haspel dihapus')
    fetchHaspels()
  }

  const filtered = haspels.filter(h => {
    const matchSearch = h.haspel_code?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchType = typeFilter === 'all' || h.type === typeFilter
    const matchStatus = statusFilter === 'all' || h.status === statusFilter
    return matchSearch && matchType && matchStatus
  })

  const totalMeter = haspels.reduce((s, h) => s + Number(h.initial_meters || 0), 0)
  const usedMeter = haspels.reduce((s, h) => s + Number(h.used_meters || 0), 0)
  const remainingMeter = totalMeter - usedMeter

  const pct = (h) => {
    const used = Number(h.used_meters)
    const total = Number(h.initial_meters)
    if (!total) return 0
    return Math.round((used / total) * 100)
  }

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(h => ({
      'Kode Haspel': h.haspel_code,
      'Tipe': h.type === '1c' ? 'Dropcore 1C' : 'Dropcore 4C',
      'Tanggal Masuk': h.date_in,
      'Meter Awal': Number(h.initial_meters),
      'Terpakai': Number(h.used_meters),
      'Sisa': Number(h.initial_meters) - Number(h.used_meters),
      'Status': h.status,
      'Note': h.note || ''
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Dropcore')
    XLSX.writeFile(wb, `dropcore_${new Date().toISOString().slice(0,10)}.xlsx`)
    toast.success('Export berhasil')
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Dropcore Haspel</h2>
          <p>Kelola inventaris kabel dropcore berdasarkan haspel</p>
        </div>
        <div className="page-header-right">
          {can(role, 'inventory.dropcore.export') && (
            <button className="btn btn-secondary" onClick={handleExportExcel}><Download size={16} /> Export</button>
          )}
          {can(role, 'inventory.dropcore.add') && (
            <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Tambah Haspel</button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="stats-grid mb-4">
        {[
          { key: 'total', label: 'Total Haspel Utuh', value: haspels.filter(h => (Number(h.initial_meters || 0) - Number(h.used_meters || 0)) === 1000).length, color: 'var(--accent)' },
          { key: 'meters', label: 'Meter Tersisa', value: `${remainingMeter.toLocaleString()} m`, color: 'var(--success)' },
          { key: 'used', label: 'Meter Terpakai', value: `${usedMeter.toLocaleString()} m`, color: 'var(--warning)' },
          { key: 'habis', label: 'Haspel Habis', value: haspels.filter(h => h.status === 'habis').length, color: 'var(--danger)' },
          { 
            key: '1c', 
            label: 'Haspel 1C Utuh', 
            value: (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{haspels.filter(h => h.type === '1c' && (Number(h.initial_meters || 0) - Number(h.used_meters || 0)) === 1000).length}</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {haspels.filter(h => h.type === '1c').reduce((s, h) => s + Number(h.initial_meters || 0) - Number(h.used_meters || 0), 0).toLocaleString()} m tersisa
                </span>
              </div>
            ), 
            color: 'var(--purple)' 
          },
          { 
            key: '4c', 
            label: 'Haspel 4C Utuh', 
            value: (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{haspels.filter(h => h.type === '4c' && (Number(h.initial_meters || 0) - Number(h.used_meters || 0)) === 1000).length}</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {haspels.filter(h => h.type === '4c').reduce((s, h) => s + Number(h.initial_meters || 0) - Number(h.used_meters || 0), 0).toLocaleString()} m tersisa
                </span>
              </div>
            ), 
            color: 'var(--orange)' 
          },
        ].map(s => (
          <div key={s.key} className="stat-card">
            <div className="stat-card-header">
              <div className="stat-card-icon" style={{ background: `${s.color}20` }}>
                <Cable size={20} style={{ color: s.color }} />
              </div>
            </div>
            <div className="stat-card-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="search-box" style={{ maxWidth: '180px' }}>
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Cari kode..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">Semua Tipe</option>
            <option value="1c">1C</option>
            <option value="4c">4C</option>
          </select>
          <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="tersedia">Tersedia</option>
            <option value="habis">Habis</option>
          </select>
        </div>

        <div className="table-container">
          {loading ? (
            <div className="flex-center" style={{ height: '180px' }}><div className="spinner" /></div>
          ) : filtered.length > 0 ? (
            <>
              <table className="desktop-only">
                <thead>
                  <tr>
                    <th>Kode Haspel</th>
                    <th>Tipe</th>
                    <th>Tanggal Masuk</th>
                    <th>Meter Awal</th>
                    <th>Terpakai</th>
                    <th>Sisa</th>
                    <th>Progress</th>
                    <th>Status</th>
                    {can(role, 'inventory.dropcore.edit') && <th style={{ textAlign: 'right' }}>Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(h => {
                    const rem = Number(h.initial_meters) - Number(h.used_meters)
                    const p = pct(h)
                    const color = p >= 90 ? 'var(--danger)' : p >= 60 ? 'var(--warning)' : 'var(--success)'
                    return (
                      <tr key={h.id}>
                        <td><span className="font-semibold text-accent">{h.haspel_code}</span></td>
                        <td><span className={`badge ${h.type === '1c' ? 'badge-purple' : 'badge-orange'}`}>{h.type?.toUpperCase()}</span></td>
                        <td className="text-secondary">{format(new Date(h.date_in), 'dd MMM yyyy', { locale: id })}</td>
                        <td>{Number(h.initial_meters).toLocaleString()} m</td>
                        <td style={{ color: 'var(--warning)' }}>{Number(h.used_meters).toLocaleString()} m</td>
                        <td style={{ color: rem <= 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{rem.toLocaleString()} m</td>
                        <td style={{ minWidth: '100px' }}>
                          <div style={{ background: 'var(--bg-hover)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                            <div style={{ background: color, height: '100%', width: `${Math.min(p, 100)}%`, transition: 'width 0.3s' }} />
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{p}%</div>
                        </td>
                        <td>
                          {h.status === 'habis'
                            ? <span className="badge badge-danger"><AlertTriangle size={10} /> Habis</span>
                            : <span className="badge badge-success">Tersedia</span>
                          }
                        </td>
                        {can(role, 'inventory.dropcore.edit') && (
                          <td style={{ textAlign: 'right' }}>
                            <div className="flex" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                              <button className="btn-icon" onClick={() => openEdit(h)}><Edit2 size={15} /></button>
                              {can(role, 'inventory.dropcore.delete') && (
                                <button className="btn-icon text-danger" onClick={() => handleDelete(h)}><Trash2 size={15} /></button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <div className="mobile-only mobile-card-list">
                {filtered.map(h => {
                  const rem = Number(h.initial_meters) - Number(h.used_meters)
                  const p = pct(h)
                  const color = p >= 90 ? 'var(--danger)' : p >= 60 ? 'var(--warning)' : 'var(--success)'
                  return (
                    <div key={h.id} className="mobile-card">
                      <div className="mobile-card-header" onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}>
                        <div>
                          <div className="mobile-card-title">{h.haspel_code}</div>
                          <div className="mobile-card-subtitle">
                            <span className={`badge ${h.type === '1c' ? 'badge-purple' : 'badge-orange'}`} style={{ padding: '0px 4px', fontSize: '10px' }}>{h.type?.toUpperCase()}</span>
                            <span style={{ marginLeft: '8px' }}>
                              {h.status === 'habis'
                                ? <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: 600 }}>Habis</span>
                                : <span style={{ color: 'var(--success)', fontSize: '11px', fontWeight: 600 }}>Tersedia</span>
                              }
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '14px', fontWeight: 'bold', color: rem <= 0 ? 'var(--danger)' : 'var(--success)' }}>
                            {rem.toLocaleString()} m
                          </div>
                        </div>
                      </div>
                      {expandedId === h.id && (
                        <div className="mobile-card-body">
                          <div className="mobile-info-row"><span className="mobile-info-label">Tanggal Masuk</span><span className="mobile-info-value">{format(new Date(h.date_in), 'dd MMM yyyy', { locale: id })}</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">Meter Awal</span><span className="mobile-info-value">{Number(h.initial_meters).toLocaleString()} m</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">Terpakai</span><span className="mobile-info-value" style={{ color: 'var(--warning)' }}>{Number(h.used_meters).toLocaleString()} m</span></div>
                          <div className="mobile-info-row">
                            <span className="mobile-info-label">Progress</span>
                            <span className="mobile-info-value" style={{ width: '100px' }}>
                              <div style={{ background: 'var(--border-light)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                                <div style={{ background: color, height: '100%', width: `${Math.min(p, 100)}%` }} />
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', textAlign: 'right' }}>{p}%</div>
                            </span>
                          </div>
                          {can(role, 'inventory.dropcore.edit') && (
                            <div className="mobile-card-actions">
                              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(h)}><Edit2 size={14} /> Edit</button>
                              {can(role, 'inventory.dropcore.delete') && (
                                <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(h)}><Trash2 size={14} /> Hapus</button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="empty-state"><Cable size={48} /><h3>Tidak Ada Haspel</h3><p>Belum ada data haspel dropcore.</p></div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{editItem ? 'Edit Haspel' : 'Tambah Haspel Dropcore'}</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Kode Haspel <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" placeholder="H-001" value={form.haspel_code} onChange={e => setForm(f => ({ ...f, haspel_code: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipe</label>
                  <select className="form-input" style={{ height: 'auto' }} value={form.type} onChange={e => {
                    const newType = e.target.value
                    if (!editItem) {
                      setForm(f => ({ ...f, type: newType, haspel_code: generateNextCode(newType) }))
                    } else {
                      setForm(f => ({ ...f, type: newType }))
                    }
                  }}>
                    <option value="1c">Dropcore 1C</option>
                    <option value="4c">Dropcore 4C</option>
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Meter Awal</label>
                  <input type="number" className="form-input" value={form.initial_meters} onChange={e => setForm(f => ({ ...f, initial_meters: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Meter Terpakai</label>
                  <input type="number" className="form-input" min="0" value={form.used_meters} onChange={e => setForm(f => ({ ...f, used_meters: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal Masuk</label>
                <input type="date" className="form-input" value={form.date_in} onChange={e => setForm(f => ({ ...f, date_in: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Note</label>
                <input className="form-input" placeholder="Opsional" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              {/* Preview sisa */}
              <div style={{ padding: '10px 14px', background: 'var(--bg-hover)', borderRadius: '8px', fontSize: '13px' }}>
                Sisa meter: <strong style={{ color: 'var(--accent)' }}>{Math.max(0, Number(form.initial_meters) - Number(form.used_meters))} m</strong>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : (editItem ? 'Simpan Perubahan' : 'Tambah Haspel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

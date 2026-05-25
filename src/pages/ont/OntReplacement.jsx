import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, X, RefreshCcw, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'

export default function OntReplacement() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'

  const [items, setItems] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [snList, setSnList] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const emptyForm = {
    replacement_date: format(new Date(), 'yyyy-MM-dd'),
    customer_name: '', customer_id: '',
    old_serial_number: '', new_serial_number_id: '',
    reason: '', technicians: []
  }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [res, techRes, snRes] = await Promise.all([
      supabase.from('ont_replacements').select('*, new_sn:serial_numbers(serial_number, brand:ont_brands(brand_name), type:ont_types(type_name))').order('replacement_date', { ascending: false }),
      supabase.from('users').select('id, full_name').in('role', ['admin', 'teknisi']).eq('is_active', true),
      supabase.from('serial_numbers').select('id, serial_number, brand:ont_brands(brand_name), type:ont_types(type_name)').eq('status', 'tersedia'),
    ])
    if (!res.error) setItems(res.data || [])
    if (!techRes.error) setTechnicians(techRes.data || [])
    if (!snRes.error) setSnList(snRes.data || [])
    setLoading(false)
  }

  const toggleTech = (techId) => {
    setForm(f => ({ ...f, technicians: f.technicians.includes(techId) ? f.technicians.filter(t => t !== techId) : [...f.technicians, techId] }))
  }

  const handleSave = async () => {
    if (!form.customer_name || !form.old_serial_number || !form.new_serial_number_id) {
      toast.error('Nama pelanggan, SN lama, dan SN baru wajib diisi')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('ont_replacements').insert({ ...form, created_by: profile.id })
      if (error) throw error

      // Update SN baru menjadi terpakai
      await supabase.from('serial_numbers').update({ status: 'terpakai' }).eq('id', form.new_serial_number_id)

      await logActivity({
        userId: profile.id, username: profile.username, role,
        module: 'Pergantian ONT', action: 'Input Pergantian ONT',
        detail: `Pelanggan: ${form.customer_name} | SN Lama: ${form.old_serial_number}`
      })

      toast.success('Data pergantian ONT berhasil disimpan')
      setIsModalOpen(false)
      setForm(emptyForm)
      fetchAll()
    } catch (err) {
      toast.error('Gagal: ' + err.message)
    } finally { setSaving(false) }
  }

  const handleDelete = async (item) => {
    if (!window.confirm('Hapus data pergantian ONT ini?')) return
    await supabase.from('ont_replacements').delete().eq('id', item.id)
    await logActivity({ userId: profile.id, username: profile.username, role, module: 'Pergantian ONT', action: 'Hapus', detail: `ID: ${item.customer_id}` })
    toast.success('Data dihapus')
    fetchAll()
  }

  const getTechNames = (ids) => {
    if (!ids?.length) return '-'
    return ids.map(id => technicians.find(t => t.id === id)?.full_name || '?').join(', ')
  }

  const filtered = items.filter(i =>
    i.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.customer_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.old_serial_number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Pergantian ONT</h2>
          <p>Riwayat pergantian perangkat ONT pelanggan</p>
        </div>
        <div className="page-header-right">
          {can(role, 'ont.input') && (
            <button className="btn btn-primary" onClick={() => { setForm(emptyForm); setIsModalOpen(true) }}>
              <Plus size={16} /> Tambah Pergantian
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="filter-bar mb-4">
          <div className="search-box" style={{ maxWidth: '200px' }}>
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Cari nama, ID, SN..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <div className="flex-center" style={{ height: '180px' }}><div className="spinner" /></div>
          ) : filtered.length > 0 ? (
            <>
              <table className="desktop-only">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Pelanggan</th>
                    <th>SN Lama</th>
                    <th></th>
                    <th>SN Baru</th>
                    <th>Alasan</th>
                    <th>Teknisi</th>
                    {can(role, 'ont.delete') && <th style={{ textAlign: 'right' }}>Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id}>
                      <td className="text-secondary">{format(new Date(item.replacement_date), 'dd MMM yyyy', { locale: id })}</td>
                      <td>
                        <div className="font-semibold">{item.customer_name}</div>
                        <div className="text-secondary" style={{ fontSize: '11px' }}>{item.customer_id}</div>
                      </td>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--danger)' }}>{item.old_serial_number}</span></td>
                      <td><ArrowRight size={14} style={{ color: 'var(--text-muted)' }} /></td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--success)' }}>
                          {item.new_sn?.serial_number || '-'}
                        </span>
                        {item.new_sn?.brand && (
                          <div className="text-secondary" style={{ fontSize: '10px' }}>{item.new_sn.brand.brand_name} {item.new_sn.type?.type_name}</div>
                        )}
                      </td>
                      <td className="text-secondary">{item.reason || '-'}</td>
                      <td style={{ fontSize: '12px' }}>{getTechNames(item.technicians)}</td>
                      {can(role, 'ont.delete') && (
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn-icon text-danger" onClick={() => handleDelete(item)}><Trash2 size={15} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mobile-only mobile-card-list">
                {filtered.map(item => (
                  <div key={item.id} className="mobile-card">
                    <div className="mobile-card-header" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                      <div>
                        <div className="mobile-card-title">{item.customer_name}</div>
                        <div className="mobile-card-subtitle">{item.customer_id}</div>
                      </div>
                      <div className="text-secondary" style={{ fontSize: '12px' }}>
                        {format(new Date(item.replacement_date), 'dd MMM yyyy', { locale: id })}
                      </div>
                    </div>
                    {expandedId === item.id && (
                      <div className="mobile-card-body">
                        <div className="mobile-info-row">
                          <span className="mobile-info-label">SN Lama</span>
                          <span className="mobile-info-value" style={{ fontFamily: 'monospace', color: 'var(--danger)' }}>{item.old_serial_number}</span>
                        </div>
                        <div className="mobile-info-row">
                          <span className="mobile-info-label">SN Baru</span>
                          <span className="mobile-info-value">
                            <span style={{ fontFamily: 'monospace', color: 'var(--success)' }}>{item.new_sn?.serial_number || '-'}</span>
                            {item.new_sn?.brand && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.new_sn.brand.brand_name} {item.new_sn.type?.type_name}</div>}
                          </span>
                        </div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Alasan</span><span className="mobile-info-value">{item.reason || '-'}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Teknisi</span><span className="mobile-info-value">{getTechNames(item.technicians)}</span></div>
                        {can(role, 'ont.delete') && (
                          <div className="mobile-card-actions">
                            <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(item)}><Trash2 size={14} /> Hapus</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state"><RefreshCcw size={48} /><h3>Belum Ada Data</h3><p>Belum ada riwayat pergantian ONT.</p></div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>Tambah Pergantian ONT</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Tanggal</label>
                  <input type="date" className="form-input" value={form.replacement_date} onChange={e => setForm(f => ({ ...f, replacement_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">ID Pelanggan</label>
                  <input className="form-input" placeholder="ID" value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Nama Pelanggan <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="form-input" placeholder="Nama lengkap pelanggan" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">SN Lama <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" placeholder="Serial number ONT lama" style={{ fontFamily: 'monospace' }} value={form.old_serial_number} onChange={e => setForm(f => ({ ...f, old_serial_number: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">SN Baru <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-input" style={{ height: 'auto' }} value={form.new_serial_number_id} onChange={e => setForm(f => ({ ...f, new_serial_number_id: e.target.value }))}>
                    <option value="">-- Pilih SN Baru (Tersedia) --</option>
                    {snList.map(s => <option key={s.id} value={s.id}>{s.serial_number} ({s.brand?.brand_name} {s.type?.type_name})</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Alasan Pergantian</label>
                <input className="form-input" placeholder="Contoh: ONT rusak, tidak bisa konek" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Pilih Teknisi</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {technicians.map(t => (
                    <button key={t.id} type="button" onClick={() => toggleTech(t.id)}
                      className={`badge ${form.technicians.includes(t.id) ? 'badge-accent' : 'badge-muted'}`}
                      style={{ border: 'none', cursor: 'pointer', padding: '5px 10px' }}>
                      {t.full_name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

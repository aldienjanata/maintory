import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, Truck, CalendarDays, Users, Download } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import * as XLSX from 'xlsx'

const SITES = [
  { value: 'banyumas', label: 'Banyumas' },
  { value: 'cilacap', label: 'Cilacap' },
  { value: 'cilacap_herman', label: 'Cilacap (Herman)' },
]

const WORK_TYPES = [
  { value: 'ikr_psb', label: 'IKR/PSB' },
  { value: 'maintenance', label: 'Maintenance' },
]

export default function Pengeluaran() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'

  const [expenses, setExpenses] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [snList, setSnList] = useState([])
  const [haspelList, setHaspelList] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const [activeTab, setActiveTab] = useState('pengeluaran')
  const [scheduleTickets, setScheduleTickets] = useState([])

  const [form, setForm] = useState({
    expense_date: format(new Date(), 'yyyy-MM-dd'),
    site: 'banyumas',
    work_type: 'ikr_psb',
    technicians: [],
    note: '',
    items: []
  })

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [expRes, techRes, snRes, haspelRes, schedRes] = await Promise.all([
      supabase.from('daily_expenses').select('*, items:expense_items(*)').order('expense_date', { ascending: false }),
      supabase.from('users').select('id, full_name, username').in('role', ['admin', 'teknisi']).eq('is_active', true),
      supabase.from('serial_numbers').select('id, serial_number, brand:ont_brands(brand_name), type:ont_types(type_name)').eq('status', 'tersedia'),
      supabase.from('dropcore_haspels').select('id, haspel_code, type, remaining_meters').eq('status', 'tersedia'),
      supabase.from('maintenance_tickets').select('*').eq('status', 'aktif').order('date_input', { ascending: true }),
    ])
    if (!expRes.error) setExpenses(expRes.data || [])
    if (!techRes.error) setTechnicians(techRes.data || [])
    if (!snRes.error) setSnList(snRes.data || [])
    if (!haspelRes.error) setHaspelList(haspelRes.data || [])
    if (!schedRes.error) setScheduleTickets(schedRes.data || [])
    setLoading(false)
  }

  const toggleTech = (techId) => {
    setForm(f => ({
      ...f,
      technicians: f.technicians.includes(techId)
        ? f.technicians.filter(t => t !== techId)
        : [...f.technicians, techId]
    }))
  }

  const addItem = () => {
    setForm(f => ({
      ...f,
      items: [...f.items, { id: Math.random().toString(36).substr(2, 9), item_type: 'ont', serial_number_id: '', haspel_id: '', meters_used: '', warehouse_item_id: '', quantity: 1, item_name: '' }]
    }))
  }

  const removeItem = (itemId) => {
    setForm(f => ({ ...f, items: f.items.filter(i => i.id !== itemId) }))
  }

  const updateItem = (itemId, key, value) => {
    setForm(f => ({
      ...f,
      items: f.items.map(i => i.id === itemId ? { ...i, [key]: value } : i)
    }))
  }

  const handleSave = async () => {
    if (!form.expense_date || !form.site) { toast.error('Tanggal dan lokasi wajib diisi'); return }
    if (form.technicians.length === 0) { toast.error('Pilih minimal 1 teknisi'); return }
    setSaving(true)
    try {
      const { data: expData, error: expError } = await supabase.from('daily_expenses').insert({
        expense_date: form.expense_date,
        site: form.site,
        work_type: form.work_type,
        technicians: form.technicians,
        note: form.note,
        created_by: profile.id,
      }).select().single()
      if (expError) throw expError

      // Insert items
      if (form.items.length > 0) {
        const itemsToInsert = form.items.map(({ id, ...rest }) => ({
          expense_id: expData.id,
          item_type: rest.item_type,
          serial_number_id: rest.serial_number_id || null,
          haspel_id: rest.haspel_id || null,
          meters_used: rest.meters_used || null,
          warehouse_item_id: rest.warehouse_item_id || null,
          quantity: rest.quantity,
          item_name: rest.item_name || null,
        }))
        const { error: itemsError } = await supabase.from('expense_items').insert(itemsToInsert)
        if (itemsError) throw itemsError

        // Update SN status if used
        for (const item of form.items) {
          if (item.item_type === 'ont' && item.serial_number_id) {
            await supabase.from('serial_numbers').update({ status: 'terpakai' }).eq('id', item.serial_number_id)
          }
          if (item.item_type === 'dropcore' && item.haspel_id && item.meters_used) {
            const haspel = haspelList.find(h => h.id === item.haspel_id)
            if (haspel) {
              const newUsed = Number(haspel.remaining_meters === undefined
                ? (haspel.initial_meters - haspel.used_meters)
                : haspel.remaining_meters) - Number(item.meters_used)
              await supabase.from('dropcore_haspels')
                .update({ used_meters: supabase.rpc('increment_used_meters', { haspel_id: item.haspel_id, meters: Number(item.meters_used) }) })
                .eq('id', item.haspel_id)
            }
          }
        }
      }

      await logActivity({
        userId: profile.id, username: profile.username, role,
        module: 'Pengeluaran', action: 'Tambah Pengeluaran',
        detail: `Pengeluaran ${form.expense_date} - ${form.site} - ${form.work_type}`
      })

      toast.success('Pengeluaran berhasil disimpan')
      setIsModalOpen(false)
      resetForm()
      fetchAll()
    } catch (err) {
      toast.error('Gagal menyimpan: ' + err.message)
    } finally { setSaving(false) }
  }

  const resetForm = () => {
    setForm({ expense_date: format(new Date(), 'yyyy-MM-dd'), site: 'banyumas', work_type: 'ikr_psb', technicians: [], note: '', items: [] })
  }

  const handleDelete = async (exp) => {
    if (!window.confirm('Hapus data pengeluaran ini?')) return
    await supabase.from('daily_expenses').delete().eq('id', exp.id)
    await logActivity({ userId: profile.id, username: profile.username, role, module: 'Pengeluaran', action: 'Hapus Pengeluaran', detail: `Tanggal: ${exp.expense_date}` })
    toast.success('Data dihapus')
    fetchAll()
  }

  const getTechNames = (ids) => {
    if (!ids?.length) return '-'
    return ids.map(id => technicians.find(t => t.id === id)?.full_name || '?').join(', ')
  }

  const filtered = expenses.filter(e => {
    const matchDate = !dateFilter || e.expense_date === dateFilter
    const matchSearch = !searchTerm || getTechNames(e.technicians).toLowerCase().includes(searchTerm.toLowerCase()) || e.site?.includes(searchTerm.toLowerCase())
    return matchDate && matchSearch
  })

  const handleExportExcel = () => {
    const rows = filtered.map(exp => ({
      'Tanggal': exp.expense_date,
      'Lokasi': SITES.find(s => s.value === exp.site)?.label || exp.site,
      'Jenis Pekerjaan': WORK_TYPES.find(w => w.value === exp.work_type)?.label || exp.work_type,
      'Teknisi': getTechNames(exp.technicians),
      'Jumlah Item': exp.items?.length || 0,
      'Note': exp.note || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pengeluaran')
    XLSX.writeFile(wb, `pengeluaran_${new Date().toISOString().slice(0,10)}.xlsx`)
    toast.success('Export berhasil')
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Pengeluaran Harian</h2>
          <p>Rekap penggunaan material oleh teknisi per hari</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={handleExportExcel}>
            <Download size={16} /> Export
          </button>
          {can(role, 'pengeluaran.input') && (
            <button className="btn btn-primary" onClick={() => { resetForm(); setIsModalOpen(true) }}>
              <Plus size={16} /> Tambah Pengeluaran
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-item ${activeTab === 'pengeluaran' ? 'active' : ''}`} onClick={() => setActiveTab('pengeluaran')}>
          <Truck size={14} /> Pengeluaran Harian
        </button>
        {(role === 'admin' || role === 'superadmin') && (
          <button className={`tab-item ${activeTab === 'jadwal' ? 'active' : ''}`} onClick={() => setActiveTab('jadwal')}>
            <CalendarDays size={14} /> Jadwal Teknisi
          </button>
        )}
      </div>

      {activeTab === 'pengeluaran' && (
      <div className="card">
        <div className="filter-bar">
          <div className="search-box" style={{ maxWidth: '220px' }}>
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Cari teknisi/lokasi..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <input type="date" className="filter-select" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ padding: '0 12px' }} />
          {dateFilter && <button className="btn btn-ghost btn-sm" onClick={() => setDateFilter('')}>Reset</button>}
        </div>

        <div className="table-container">
          {loading ? (
            <div className="flex-center" style={{ height: '180px' }}><div className="spinner" /></div>
          ) : filtered.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Lokasi</th>
                  <th>Jenis Pekerjaan</th>
                  <th>Teknisi</th>
                  <th>Jumlah Item</th>
                  <th>Note</th>
                  {can(role, 'pengeluaran.delete') && <th style={{ textAlign: 'right' }}>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(exp => (
                  <tr key={exp.id}>
                    <td className="font-semibold">{format(new Date(exp.expense_date), 'dd MMM yyyy', { locale: id })}</td>
                    <td><span className="badge badge-info">{SITES.find(s => s.value === exp.site)?.label || exp.site}</span></td>
                    <td><span className="badge badge-accent">{WORK_TYPES.find(w => w.value === exp.work_type)?.label || exp.work_type}</span></td>
                    <td>{getTechNames(exp.technicians)}</td>
                    <td>{exp.items?.length || 0} item</td>
                    <td className="text-secondary">{exp.note || '-'}</td>
                    {can(role, 'pengeluaran.delete') && (
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn-icon text-danger" onClick={() => handleDelete(exp)}><Trash2 size={15} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state"><Truck size={48} /><h3>Belum Ada Data</h3><p>Belum ada pengeluaran tercatat.</p></div>
          )}
        </div>
      </div>
      )}

      {activeTab === 'jadwal' && (role === 'admin' || role === 'superadmin') && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Jadwal Teknisi — Tiket Aktif</h3>
            <span className="badge badge-warning">{scheduleTickets.length} Tiket</span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>No Tiket</th>
                  <th>Pelanggan</th>
                  <th>Desa</th>
                  <th>Keluhan</th>
                  <th>Teknisi</th>
                </tr>
              </thead>
              <tbody>
                {scheduleTickets.length > 0 ? scheduleTickets.map(t => (
                  <tr key={t.id}>
                    <td className="text-secondary">{t.date_input}</td>
                    <td><span className="font-semibold">#{t.ticket_number}</span></td>
                    <td>
                      <div className="font-semibold">{t.customer_name}</div>
                      <div className="text-secondary" style={{ fontSize: '11px' }}>{t.customer_id}</div>
                    </td>
                    <td>{t.village}</td>
                    <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.complaint}</td>
                    <td>{t.technicians?.length ? getTechNames(t.technicians) : <span className="badge badge-danger">Belum Ditugaskan</span>}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>Tidak ada tiket aktif</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>Tambah Pengeluaran Harian</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Tanggal <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="date" className="form-input" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Lokasi <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-input" style={{ height: 'auto' }} value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Jenis Pekerjaan</label>
                <select className="form-input" style={{ height: 'auto' }} value={form.work_type} onChange={e => setForm(f => ({ ...f, work_type: e.target.value }))}>
                  {WORK_TYPES.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Teknisi <span style={{ color: 'var(--danger)' }}>*</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {technicians.map(t => (
                    <button key={t.id} type="button"
                      onClick={() => toggleTech(t.id)}
                      className={`badge ${form.technicians.includes(t.id) ? 'badge-accent' : 'badge-muted'}`}
                      style={{ border: 'none', cursor: 'pointer', padding: '5px 10px' }}
                    >
                      {t.full_name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="form-label" style={{ marginBottom: 0 }}>Item Keluar</label>
                  <button className="btn btn-secondary btn-sm" onClick={addItem}><Plus size={14} /> Tambah Item</button>
                </div>
                {form.items.length === 0 && (
                  <div style={{ padding: '16px', background: 'var(--bg-hover)', borderRadius: '8px', textAlign: 'center' }}>
                    <p className="text-secondary" style={{ fontSize: '13px' }}>Belum ada item ditambahkan. Klik "Tambah Item" untuk mulai.</p>
                  </div>
                )}
                {form.items.map((item, idx) => (
                  <div key={item.id} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-secondary" style={{ fontSize: '12px' }}>Item #{idx + 1}</span>
                      <button className="btn-icon text-danger" style={{ width: '24px', height: '24px', border: 'none' }} onClick={() => removeItem(item.id)}><X size={14} /></button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <select className="form-input" style={{ height: 'auto' }} value={item.item_type} onChange={e => updateItem(item.id, 'item_type', e.target.value)}>
                        <option value="ont">ONT / Modem</option>
                        <option value="dropcore">Dropcore</option>
                        <option value="other">Barang Lainnya</option>
                      </select>
                      {item.item_type === 'ont' && (
                        <select className="form-input" style={{ height: 'auto' }} value={item.serial_number_id} onChange={e => updateItem(item.id, 'serial_number_id', e.target.value)}>
                          <option value="">-- Pilih SN --</option>
                          {snList.map(s => <option key={s.id} value={s.id}>{s.serial_number} ({s.brand?.brand_name} {s.type?.type_name})</option>)}
                        </select>
                      )}
                      {item.item_type === 'dropcore' && (
                        <div className="grid-2">
                          <select className="form-input" style={{ height: 'auto' }} value={item.haspel_id} onChange={e => updateItem(item.id, 'haspel_id', e.target.value)}>
                            <option value="">-- Pilih Haspel --</option>
                            {haspelList.map(h => <option key={h.id} value={h.id}>{h.haspel_code} ({h.type?.toUpperCase()}, sisa: {h.remaining_meters}m)</option>)}
                          </select>
                          <div className="form-group">
                            <input type="number" className="form-input" placeholder="Meter dipakai" value={item.meters_used} onChange={e => updateItem(item.id, 'meters_used', e.target.value)} />
                          </div>
                        </div>
                      )}
                      {item.item_type === 'other' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <input className="form-input" placeholder="Nama barang yang dibawa (contoh: Tang, Kabel Patch, dll)" value={item.item_name || ''} onChange={e => updateItem(item.id, 'item_name', e.target.value)} />
                          <input type="number" className="form-input" placeholder="Jumlah" min="1" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label className="form-label">Note</label>
                <textarea className="form-input" rows={2} placeholder="Keterangan tambahan (opsional)" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : 'Simpan Pengeluaran'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

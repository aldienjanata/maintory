import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, Truck, CalendarDays, Users, Download, AlertCircle, Unlock, Lock } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import Select from 'react-select'

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
  const [otherItems, setOtherItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const [activeTab, setActiveTab] = useState('pengeluaran')
  const [schedules, setSchedules] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ schedule_date: format(new Date(), 'yyyy-MM-dd'), site: 'banyumas', work_type: 'ikr_psb', technicians: [], note: '' })
  const [myPendingSchedules, setMyPendingSchedules] = useState([])
  const [myTodaySchedule, setMyTodaySchedule] = useState(null)
  const [selectedScheduleId, setSelectedScheduleId] = useState('')

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
    const [expRes, techRes, snRes, haspelRes, schedRes, whRes] = await Promise.all([
      supabase.from('daily_expenses').select('*, items:expense_items(*)').order('expense_date', { ascending: false }),
      supabase.from('users').select('id, full_name, username').in('role', ['admin', 'teknisi']).eq('is_active', true),
      supabase.from('serial_numbers').select('id, serial_number, brand:ont_brands(brand_name), type:ont_types(type_name)').eq('status', 'tersedia'),
      supabase.from('dropcore_haspels').select('id, haspel_code, type, remaining_meters').eq('status', 'tersedia'),
      supabase.from('technician_schedules').select('*').order('schedule_date', { ascending: false }),
      supabase.from('warehouses').select('id, item_name, initial_stock').eq('item_type', 'other')
    ])
    if (!expRes.error) setExpenses(expRes.data || [])
    if (!techRes.error) setTechnicians(techRes.data || [])
    if (!snRes.error) setSnList(snRes.data || [])
    if (!haspelRes.error) setHaspelList(haspelRes.data || [])
    if (!whRes.error) setOtherItems(whRes.data || [])
    if (!schedRes.error) {
      const allScheds = schedRes.data || []
      setSchedules(allScheds)
      const today = format(new Date(), 'yyyy-MM-dd')
      setMyPendingSchedules(allScheds.filter(s => s.status === 'pending' && s.technicians?.includes(profile.id) && s.schedule_date < today))
      setMyTodaySchedule(allScheds.find(s => s.schedule_date === today && s.technicians?.includes(profile.id)) || null)
    }
    setLoading(false)
  }

  // React Select Options
  const ontOptions = snList.map(s => ({ value: s.id, label: `${s.serial_number} (${s.brand?.brand_name || ''} ${s.type?.type_name || ''})` }))
  const haspelOptions = haspelList.map(h => ({ value: h.id, label: `${h.haspel_code} (${h.type?.toUpperCase() || ''}, sisa: ${h.remaining_meters}m)` }))
  const otherOptions = otherItems.map(w => ({ value: w.id, label: w.item_name }))

  const handleSaveSchedule = async () => {
    if (!scheduleForm.schedule_date || !scheduleForm.site) { toast.error('Tanggal dan lokasi wajib diisi'); return }
    if (scheduleForm.technicians.length === 0) { toast.error('Pilih minimal 1 teknisi'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('technician_schedules').insert({ ...scheduleForm, created_by: profile.id })
      if (error) throw error
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Jadwal Teknisi', action: 'Tambah Jadwal', detail: `${scheduleForm.schedule_date} - ${scheduleForm.site}` })
      toast.success('Jadwal berhasil ditambahkan')
      setIsScheduleModalOpen(false)
      fetchAll()
    } catch (err) {
      toast.error('Gagal menyimpan jadwal: ' + err.message)
    } finally { setSaving(false) }
  }

  const toggleScheduleExtraAccess = async (sched) => {
    const newVal = !sched.allow_extra_expense
    const { error } = await supabase.from('technician_schedules').update({ allow_extra_expense: newVal }).eq('id', sched.id)
    if (!error) {
      toast.success(newVal ? 'Akses pengeluaran tambahan dibuka' : 'Akses ditutup')
      fetchAll()
    }
  }

  const handleOpenAddExpense = (sched = null) => {
    resetForm()
    if (sched) {
      setSelectedScheduleId(sched.id)
      setForm(f => ({ ...f, expense_date: sched.schedule_date, site: sched.site, work_type: sched.work_type, technicians: sched.technicians }))
      setIsModalOpen(true)
    } else if (myTodaySchedule) {
      if (myTodaySchedule.status === 'completed' && !myTodaySchedule.allow_extra_expense) {
        toast.error('Tim Anda sudah mengisi pengeluaran hari ini. Hubungi admin untuk menambah pengeluaran.')
        return
      }
      setSelectedScheduleId(myTodaySchedule.id)
      setForm(f => ({ ...f, expense_date: myTodaySchedule.schedule_date, site: myTodaySchedule.site, work_type: myTodaySchedule.work_type, technicians: myTodaySchedule.technicians }))
      setIsModalOpen(true)
    } else {
      setSelectedScheduleId('')
      setIsModalOpen(true)
    }
  }

  const toggleScheduleTech = (techId) => setScheduleForm(f => ({ ...f, technicians: f.technicians.includes(techId) ? f.technicians.filter(t => t !== techId) : [...f.technicians, techId] }))

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
      items: [...f.items, { id: Math.random().toString(36).substr(2, 9), item_type: 'ont', selected_onts: [], selected_haspels: [], haspel_meters: {}, selected_other: null, quantity: 1, item_name: '' }]
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
    if (form.items.length === 0 && (!form.note || !form.note.trim())) {
      toast.error('Jika tidak ada pengeluaran barang, mohon isi Note (misal: "Tidak ada pengeluaran")')
      return
    }
    setSaving(true)
    try {
      const { data: expData, error: expError } = await supabase.from('daily_expenses').insert({
        expense_date: form.expense_date,
        site: form.site,
        work_type: form.work_type,
        technicians: form.technicians,
        note: form.note,
        schedule_id: selectedScheduleId || null,
        created_by: profile.id,
      }).select().single()
      if (expError) throw expError

      // Insert items
      if (form.items.length > 0) {
        const itemsToInsert = []
        for (const item of form.items) {
          if (item.item_type === 'ont') {
            (item.selected_onts || []).forEach(opt => {
              itemsToInsert.push({ expense_id: expData.id, item_type: 'ont', serial_number_id: opt.value, quantity: 1 })
            })
          } else if (item.item_type === 'dropcore') {
            (item.selected_haspels || []).forEach(opt => {
              const meters = item.haspel_meters?.[opt.value] || 0
              if (meters > 0) {
                 itemsToInsert.push({ expense_id: expData.id, item_type: 'dropcore', haspel_id: opt.value, meters_used: meters, quantity: 1 })
              }
            })
          } else if (item.item_type === 'other') {
            if (item.selected_other) {
               itemsToInsert.push({ expense_id: expData.id, item_type: 'other', warehouse_item_id: item.selected_other.value, quantity: item.quantity })
            }
          }
        }
        
        if (itemsToInsert.length > 0) {
          const { error: itemsError } = await supabase.from('expense_items').insert(itemsToInsert)
          if (itemsError) throw itemsError

          // Update SN status if used
          const ontIds = itemsToInsert.filter(i => i.item_type === 'ont').map(i => i.serial_number_id)
          if (ontIds.length > 0) {
            await supabase.from('serial_numbers').update({ status: 'terpakai' }).in('id', ontIds)
          }

          // Update dropcore haspels
          const dcItems = itemsToInsert.filter(i => i.item_type === 'dropcore')
          for (const dc of dcItems) {
            const haspel = haspelList.find(h => h.id === dc.haspel_id)
            if (haspel) {
              const newUsed = Number(haspel.used_meters || 0) + Number(dc.meters_used)
              await supabase.from('dropcore_haspels')
                .update({ used_meters: newUsed })
                .eq('id', dc.haspel_id)
            }
          }
        }
      }

      if (selectedScheduleId) {
        await supabase.from('technician_schedules').update({ status: 'completed' }).eq('id', selectedScheduleId)
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
    setSelectedScheduleId('')
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
            <button className="btn btn-primary" onClick={() => handleOpenAddExpense()}>
              <Plus size={16} /> Tambah Pengeluaran
            </button>
          )}
        </div>
      </div>

      {myPendingSchedules.length > 0 && (
        <div style={{ padding: '16px', background: 'var(--danger-dim)', border: '1px solid var(--danger)', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <AlertCircle size={24} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <h4 style={{ color: 'var(--danger)', margin: '0 0 4px 0', fontSize: '15px' }}>Tunggakan Laporan Pengeluaran</h4>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>Anda memiliki {myPendingSchedules.length} jadwal tugas yang belum diisi laporan pengeluarannya.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
            {myPendingSchedules.map(sched => (
              <button key={sched.id} className="btn btn-sm" style={{ background: 'var(--danger)', color: 'white', border: 'none' }} onClick={() => handleOpenAddExpense(sched)}>
                Isi Pengeluaran {format(new Date(sched.schedule_date), 'dd MMM')}
              </button>
            ))}
          </div>
        </div>
      )}

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
            <>
              <table className="desktop-only">
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

              <div className="mobile-only mobile-card-list">
                {filtered.map(exp => (
                  <div key={exp.id} className="mobile-card">
                    <div className="mobile-card-header" onClick={() => setExpandedId(expandedId === exp.id ? null : exp.id)}>
                      <div>
                        <div className="mobile-card-title">{format(new Date(exp.expense_date), 'dd MMM yyyy', { locale: id })}</div>
                        <div className="mobile-card-subtitle">{SITES.find(s => s.value === exp.site)?.label || exp.site}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="badge badge-accent">{WORK_TYPES.find(w => w.value === exp.work_type)?.label || exp.work_type}</span>
                      </div>
                    </div>
                    {expandedId === exp.id && (
                      <div className="mobile-card-body">
                        <div className="mobile-info-row"><span className="mobile-info-label">Teknisi</span><span className="mobile-info-value">{getTechNames(exp.technicians)}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Jumlah Item</span><span className="mobile-info-value">{exp.items?.length || 0} item</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Note</span><span className="mobile-info-value">{exp.note || '-'}</span></div>
                        {can(role, 'pengeluaran.delete') && (
                          <div className="mobile-card-actions">
                            <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(exp)}><Trash2 size={14} /> Hapus</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state"><Truck size={48} /><h3>Belum Ada Data</h3><p>Belum ada pengeluaran tercatat.</p></div>
          )}
        </div>
      </div>
      )}

      {activeTab === 'jadwal' && (role === 'admin' || role === 'superadmin') && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Jadwal Tim Teknisi</h3>
            <button className="btn btn-primary btn-sm" onClick={() => { setScheduleForm({ schedule_date: format(new Date(), 'yyyy-MM-dd'), site: 'banyumas', work_type: 'ikr_psb', technicians: [], note: '' }); setIsScheduleModalOpen(true); }}>
              <Plus size={14} /> Tambah Jadwal
            </button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Lokasi</th>
                  <th>Pekerjaan</th>
                  <th>Tim Teknisi</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Akses Ekstra</th>
                </tr>
              </thead>
              <tbody>
                {schedules.length > 0 ? schedules.map(t => (
                  <tr key={t.id}>
                    <td className="text-secondary">{format(new Date(t.schedule_date), 'dd MMM yyyy', { locale: id })}</td>
                    <td><span className="badge badge-info">{SITES.find(s => s.value === t.site)?.label || t.site}</span></td>
                    <td>{WORK_TYPES.find(w => w.value === t.work_type)?.label || t.work_type}</td>
                    <td>{t.technicians?.length ? getTechNames(t.technicians) : <span className="badge badge-danger">Kosong</span>}</td>
                    <td>
                      {t.status === 'completed' 
                        ? <span className="badge badge-success">Selesai</span> 
                        : <span className="badge badge-warning">Belum Isi</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {t.status === 'completed' && (
                        <button 
                          className={`btn-icon ${t.allow_extra_expense ? 'text-success' : 'text-secondary'}`} 
                          title={t.allow_extra_expense ? 'Tutup Akses Ekstra' : 'Buka Akses Pengeluaran Tambahan'}
                          onClick={() => toggleScheduleExtraAccess(t)}
                        >
                          {t.allow_extra_expense ? <Unlock size={16} /> : <Lock size={16} />}
                        </button>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>Tidak ada jadwal teknisi</td></tr>
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
              {selectedScheduleId && (
                <div style={{ background: 'var(--accent-dim)', padding: '10px 12px', borderRadius: '6px', fontSize: '13px', color: 'var(--accent)' }}>
                  Mengisi pengeluaran untuk Jadwal Tim tanggal {format(new Date(form.expense_date), 'dd MMM yyyy')}
                </div>
              )}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Tanggal <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="date" className="form-input" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} disabled={!!selectedScheduleId} />
                </div>
                <div className="form-group">
                  <label className="form-label">Lokasi <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-input" style={{ height: 'auto' }} value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))} disabled={!!selectedScheduleId}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Jenis Pekerjaan</label>
                <select className="form-input" style={{ height: 'auto' }} value={form.work_type} onChange={e => setForm(f => ({ ...f, work_type: e.target.value }))} disabled={!!selectedScheduleId}>
                  {WORK_TYPES.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Teknisi <span style={{ color: 'var(--danger)' }}>*</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {technicians.map(t => (
                    <button key={t.id} type="button"
                      onClick={() => !selectedScheduleId && toggleTech(t.id)}
                      className={`badge ${form.technicians.includes(t.id) ? 'badge-accent' : 'badge-muted'}`}
                      style={{ border: 'none', cursor: selectedScheduleId ? 'default' : 'pointer', padding: '5px 10px', opacity: selectedScheduleId && !form.technicians.includes(t.id) ? 0.5 : 1 }}
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
                        <Select 
                          isMulti 
                          options={ontOptions} 
                          placeholder="Pilih beberapa ONT/Modem..."
                          value={item.selected_onts || []}
                          onChange={val => updateItem(item.id, 'selected_onts', val)}
                          styles={{
                            control: (base) => ({
                              ...base,
                              background: 'var(--bg-input)',
                              borderColor: 'var(--border)',
                              color: 'var(--text-primary)',
                            }),
                            menu: (base) => ({
                              ...base,
                              background: 'var(--bg-input)',
                              color: 'var(--text-primary)',
                            }),
                            option: (base, state) => ({
                              ...base,
                              backgroundColor: state.isFocused ? 'var(--accent-dim)' : 'transparent',
                              color: state.isFocused ? 'var(--accent)' : 'var(--text-primary)',
                              cursor: 'pointer'
                            }),
                            multiValue: (base) => ({
                              ...base,
                              backgroundColor: 'var(--accent-dim)',
                            }),
                            multiValueLabel: (base) => ({
                              ...base,
                              color: 'var(--accent)',
                            })
                          }}
                        />
                      )}
                      {item.item_type === 'dropcore' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <Select 
                            isMulti 
                            options={haspelOptions} 
                            placeholder="Pilih beberapa Haspel..."
                            value={item.selected_haspels || []}
                            onChange={val => updateItem(item.id, 'selected_haspels', val)}
                            styles={{
                              control: (base) => ({
                                ...base,
                                background: 'var(--bg-input)',
                                borderColor: 'var(--border)',
                                color: 'var(--text-primary)',
                              }),
                              menu: (base) => ({
                                ...base,
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                              }),
                              option: (base, state) => ({
                                ...base,
                                backgroundColor: state.isFocused ? 'var(--accent-dim)' : 'transparent',
                                color: state.isFocused ? 'var(--accent)' : 'var(--text-primary)',
                                cursor: 'pointer'
                              }),
                              multiValue: (base) => ({
                                ...base,
                                backgroundColor: 'var(--accent-dim)',
                              }),
                              multiValueLabel: (base) => ({
                                ...base,
                                color: 'var(--accent)',
                              })
                            }}
                          />
                          {(item.selected_haspels || []).map(h => (
                            <div key={h.value} className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ flex: 1, fontSize: '12px', color: 'var(--text-secondary)' }}>{h.label}</div>
                              <input 
                                type="number" 
                                className="form-input" 
                                placeholder="Meter dipakai" 
                                style={{ width: '130px' }}
                                value={(item.haspel_meters || {})[h.value] || ''} 
                                onChange={e => updateItem(item.id, 'haspel_meters', { ...(item.haspel_meters || {}), [h.value]: e.target.value })} 
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {item.item_type === 'other' && (
                        <div className="grid-2">
                          <Select 
                            options={otherOptions} 
                            placeholder="Pilih Barang Lainnya..."
                            value={item.selected_other || null}
                            onChange={val => updateItem(item.id, 'selected_other', val)}
                            styles={{
                              control: (base) => ({
                                ...base,
                                background: 'var(--bg-input)',
                                borderColor: 'var(--border)',
                                color: 'var(--text-primary)',
                              }),
                              menu: (base) => ({
                                ...base,
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                              }),
                              option: (base, state) => ({
                                ...base,
                                backgroundColor: state.isFocused ? 'var(--accent-dim)' : 'transparent',
                                color: state.isFocused ? 'var(--accent)' : 'var(--text-primary)',
                                cursor: 'pointer'
                              }),
                              singleValue: (base) => ({
                                ...base,
                                color: 'var(--text-primary)',
                              })
                            }}
                          />
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
      {isScheduleModalOpen && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>Tambah Jadwal Tim Teknisi</h3>
              <button className="btn-icon" onClick={() => setIsScheduleModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Tanggal <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="date" className="form-input" value={scheduleForm.schedule_date} onChange={e => setScheduleForm(f => ({ ...f, schedule_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Lokasi <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-input" style={{ height: 'auto' }} value={scheduleForm.site} onChange={e => setScheduleForm(f => ({ ...f, site: e.target.value }))}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Jenis Pekerjaan</label>
                <select className="form-input" style={{ height: 'auto' }} value={scheduleForm.work_type} onChange={e => setScheduleForm(f => ({ ...f, work_type: e.target.value }))}>
                  {WORK_TYPES.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Anggota Tim Teknisi <span style={{ color: 'var(--danger)' }}>*</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {technicians.map(t => (
                    <button key={t.id} type="button"
                      onClick={() => toggleScheduleTech(t.id)}
                      className={`badge ${scheduleForm.technicians.includes(t.id) ? 'badge-accent' : 'badge-muted'}`}
                      style={{ border: 'none', cursor: 'pointer', padding: '5px 10px' }}
                    >
                      {t.full_name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Note</label>
                <textarea className="form-input" rows={2} placeholder="Keterangan jadwal" value={scheduleForm.note} onChange={e => setScheduleForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsScheduleModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSaveSchedule} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : 'Simpan Jadwal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

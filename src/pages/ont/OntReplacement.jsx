import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, X, RefreshCcw, ArrowRight, Download } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { useProgress } from '../../contexts/ProgressContext'
import Pagination from '../../components/common/Pagination'

const SITES = [
  { value: 'banyumas', label: 'Banyumas' },
  { value: 'cilacap', label: 'Cilacap' },
  { value: 'cilacap_herman', label: 'Cilacap (Herman)' }
]

export default function OntReplacement() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const { showProgress, hideProgress } = useProgress()

  const [items, setItems] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [snList, setSnList] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [snSearch, setSnSearch] = useState('')
  const [snDropdownOpen, setSnDropdownOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  const emptyForm = {
    replacement_date: format(new Date(), 'yyyy-MM-dd'),
    site: 'banyumas',
    customer_name: '', customer_id: '',
    old_serial_number: '', new_serial_number_id: '',
    reason: '', technicians: []
  }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { setPage(1) }, [searchTerm, dateFilter])

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
    if (!form.customer_name || !form.customer_id || !form.old_serial_number || !form.new_serial_number_id) {
      toast.error('Nama pelanggan, ID pelanggan, SN lama, dan SN baru wajib diisi')
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
      setSnSearch('')
      setSnDropdownOpen(false)
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

  const filtered = items.filter(i => {
    const matchSearch = i.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        i.customer_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        i.old_serial_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        i.new_sn?.serial_number?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchDate = !dateFilter || i.replacement_date === dateFilter
    return matchSearch && matchDate
  })

  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const handleExportExcel = async () => {
    try {
      showProgress('Menyiapkan Export', 'Menginisialisasi file Excel...', 10)
      const { applyHeaderStyle, applyDataRowStyles, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const ws = workbook.addWorksheet('Pergantian ONT')
      
      const headers = ['Tanggal', 'ID Pelanggan', 'Nama Pelanggan', 'SN Lama', 'SN Baru', 'Teknisi', 'Alasan']
      setColumnWidths(ws, [16, 16, 24, 20, 20, 24, 30])
      applyHeaderStyle(ws, headers)
      
      for (let i = 0; i < filtered.length; i++) {
        const item = filtered[i]
        ws.addRow([
          item.replacement_date,
          item.customer_id,
          item.customer_name,
          item.old_serial_number,
          item.new_sn?.serial_number || '',
          getTechNames(item.technicians),
          item.reason || ''
        ])
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses baris ${i + 1} dari ${filtered.length}...`, 10 + ((i + 1) / filtered.length) * 80)
          await new Promise(r => setTimeout(r, 0))
        }
      }
      applyDataRowStyles(ws)

      showProgress('Menyelesaikan Export', 'Mengunduh file Excel...', 95)
      await downloadWorkbook(workbook, `Pergantian ONT ${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      toast.success('Export berhasil!')
    } catch (err) {
      toast.error('Gagal export: ' + err.message)
    } finally {
      hideProgress()
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Pergantian ONT</h2>
          <p>Riwayat pergantian perangkat ONT pelanggan</p>
        </div>
        <div className="page-header-right">
          {can(role, 'ont.export') && (
            <button className="btn btn-secondary" onClick={handleExportExcel}>
              <Download size={16} /> Export
            </button>
          )}
          {can(role, 'ont.input') && (
            <button className="btn btn-primary" onClick={() => { setForm(emptyForm); setSnSearch(''); setSnDropdownOpen(false); setIsModalOpen(true) }}>
              <Plus size={16} /> Tambah Pergantian
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="filter-bar mb-4" style={{ gridTemplateColumns: '1fr', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <div className="search-box" style={{ flex: 1, minWidth: '200px' }}>
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Cari nama, ID, SN..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>

          <div className="date-filter-group" style={{ position: 'relative', flex: 1, minWidth: '150px', maxWidth: '250px' }}>
            <input
              type={dateFilter ? 'date' : 'text'}
              placeholder="Semua Tanggal"
              onFocus={(e) => e.target.type = 'date'}
              onBlur={(e) => { if (!e.target.value) e.target.type = 'text' }}
              className="filter-select date-input"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{ width: '100%', paddingRight: dateFilter ? '30px' : '12px' }}
            />
            {dateFilter && (
              <button
                className="btn-clear-date"
                onClick={() => setDateFilter('')}
                title="Tampilkan semua tanggal"
                style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', padding: '4px' }}
              >
                <X size={16} />
              </button>
            )}
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
                    <th>Lokasi</th>
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
                  {paginated.map(item => (
                    <tr key={item.id}>
                      <td className="text-secondary">{format(new Date(item.replacement_date), 'dd MMM yyyy', { locale: id })}</td>
                      <td>
                        <span className="badge badge-accent">
                          {SITES.find(s => s.value === item.site)?.label || item.site || '-'}
                        </span>
                      </td>
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
                {paginated.map(item => (
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
                          <span className="mobile-info-label">Lokasi</span>
                          <span className="mobile-info-value">{SITES.find(s => s.value === item.site)?.label || item.site || '-'}</span>
                        </div>
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
              {/* Pagination */}
              <Pagination 
                page={page} 
                setPage={setPage} 
                perPage={perPage} 
                setPerPage={setPerPage} 
                totalItems={filtered.length} 
              />
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
                  <input type="date" className="form-input" value={form.replacement_date} onChange={e => setForm(f => ({ ...f, replacement_date: e.target.value }))} disabled={role !== 'superadmin'} />
                </div>
                <div className="form-group">
                  <label className="form-label">Lokasi</label>
                  <select className="form-input" style={{ height: 'auto' }} value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">ID Pelanggan <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" placeholder="ID Pelanggan" value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nama Pelanggan <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" placeholder="Nama lengkap pelanggan" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">SN Lama <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" placeholder="Serial number ONT lama" style={{ fontFamily: 'monospace' }} value={form.old_serial_number} onChange={e => setForm(f => ({ ...f, old_serial_number: e.target.value }))} />
                </div>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">SN Baru <span style={{ color: 'var(--danger)' }}>*</span></label>
                  {/* Jika sudah dipilih, tampilkan chip dengan tombol X */}
                  {form.new_serial_number_id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(0,200,83,0.08)', border: '1px solid var(--success)', borderRadius: '8px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '12px', flex: 1, wordBreak: 'break-all' }}>
                        {snList.find(s => s.id === form.new_serial_number_id)?.serial_number}
                      </span>
                      <span className="text-secondary" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>
                        {snList.find(s => s.id === form.new_serial_number_id)?.brand?.brand_name}
                      </span>
                      <button type="button" onClick={() => { setForm(f => ({ ...f, new_serial_number_id: '' })); setSnSearch('') }} className="btn-icon" style={{ width: '18px', height: '18px', minWidth: 'unset', flexShrink: 0 }}>
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'relative' }}>
                        <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input
                          className="form-input"
                          style={{ paddingLeft: '30px', fontFamily: 'monospace', fontSize: '12px' }}
                          placeholder="Cari SN..."
                          value={snSearch}
                          onChange={e => { setSnSearch(e.target.value); setSnDropdownOpen(true) }}
                          onFocus={() => setSnDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setSnDropdownOpen(false), 200)}
                        />
                      </div>
                      {snDropdownOpen && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
                          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                          borderRadius: '8px', maxHeight: '180px', overflowY: 'auto',
                          marginTop: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                        }}>
                          {snList
                            .filter(s =>
                              s.serial_number.toLowerCase().includes(snSearch.toLowerCase()) ||
                              s.brand?.brand_name?.toLowerCase().includes(snSearch.toLowerCase()) ||
                              s.type?.type_name?.toLowerCase().includes(snSearch.toLowerCase())
                            )
                            .slice(0, 50)
                            .map(s => (
                              <div
                                key={s.id}
                                onMouseDown={() => { setForm(f => ({ ...f, new_serial_number_id: s.id })); setSnDropdownOpen(false); setSnSearch('') }}
                                style={{
                                  padding: '9px 12px', cursor: 'pointer',
                                  borderBottom: '1px solid var(--border-color)',
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  gap: '8px'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{s.serial_number}</span>
                                <span className="text-secondary" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>
                                  {s.brand?.brand_name} {s.type?.type_name}
                                </span>
                              </div>
                            ))}
                          {snList.filter(s =>
                            s.serial_number.toLowerCase().includes(snSearch.toLowerCase()) ||
                            s.brand?.brand_name?.toLowerCase().includes(snSearch.toLowerCase())
                          ).length === 0 && (
                            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Tidak ditemukan</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
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

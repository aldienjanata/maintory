import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, ArrowDownToLine, CheckCircle, Clock, MapPin, Phone, FileDown, Upload, Download } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'

export default function Dismantle() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'

  const [items, setItems] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false)
  const [closeItem, setCloseItem] = useState(null)
  const [closeForm, setCloseForm] = useState({ pickup_date: format(new Date(), 'yyyy-MM-dd'), technicians: [] })
  const [editItem, setEditItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  const emptyForm = {
    date_input: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '', full_name: '', address: '', sharelok: '',
    phone_number: '', last_payment: '', serial_number: '',
    technicians: [], aksi: 'aktif', pickup_date: '', note: '', lokasi: ''
  }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { setPage(1) }, [searchTerm, statusFilter, dateFilter])

  const fetchAll = async () => {
    setLoading(true)
    const [res, techRes] = await Promise.all([
      supabase.from('dismantles').select('*').order('date_input', { ascending: false }),
      supabase.from('users').select('id, full_name').in('role', ['admin', 'teknisi']).eq('is_active', true),
    ])
    if (!res.error) setItems(res.data || [])
    if (!techRes.error) setTechnicians(techRes.data || [])
    setLoading(false)
  }

  const openAdd = () => { setEditItem(null); setForm(emptyForm); setIsModalOpen(true) }
  const openEdit = (item) => {
    setEditItem(item)
    setForm({
      date_input: item.date_input, customer_id: item.customer_id, full_name: item.full_name,
      address: item.address || '', sharelok: item.sharelok || '', phone_number: item.phone_number || '',
      last_payment: item.last_payment || '', serial_number: item.serial_number || '',
      technicians: item.technicians || [], aksi: item.aksi || 'aktif', pickup_date: item.pickup_date || '', note: item.note || '', lokasi: item.lokasi || ''
    })
    setIsModalOpen(true)
  }

  const toggleTech = (techId) => {
    setForm(f => ({ ...f, technicians: f.technicians.includes(techId) ? f.technicians.filter(t => t !== techId) : [...f.technicians, techId] }))
  }

  const toggleCloseTech = (techId) => {
    setCloseForm(f => ({ ...f, technicians: f.technicians.includes(techId) ? f.technicians.filter(t => t !== techId) : [...f.technicians, techId] }))
  }

  const handleSave = async () => {
    if (!form.customer_id || !form.full_name) { toast.error('ID Pelanggan dan nama wajib diisi'); return }
    setSaving(true)
    try {
      if (editItem) {
        const { error } = await supabase.from('dismantles').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editItem.id)
        if (error) throw error
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dismantle', action: 'Edit Dismantle', detail: `ID: ${form.customer_id}` })
        toast.success('Data dismantle diperbarui')
      } else {
        const { error } = await supabase.from('dismantles').insert({ ...form, created_by: profile.id })
        if (error) throw error
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dismantle', action: 'Tambah Dismantle', detail: `ID: ${form.customer_id} - ${form.full_name}` })
        toast.success('Data dismantle ditambahkan')
      }
      setIsModalOpen(false)
      fetchAll()
    } catch (err) {
      toast.error(err.code === '23505' ? 'ID Pelanggan sudah ada!' : 'Gagal: ' + err.message)
    } finally { setSaving(false) }
  }

  const openCloseModal = (item) => {
    setCloseItem(item)
    setCloseForm({ pickup_date: format(new Date(), 'yyyy-MM-dd'), technicians: item.technicians || [] })
    setIsCloseModalOpen(true)
  }

  const submitClose = async () => {
    if (!closeForm.technicians.length) {
      toast.error('Pilih minimal 1 teknisi yang melakukan eksekusi close')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('dismantles').update({ 
      aksi: 'close', 
      pickup_date: closeForm.pickup_date, 
      technicians: closeForm.technicians,
      updated_at: new Date().toISOString() 
    }).eq('id', closeItem.id)
    
    if (!error) {
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dismantle', action: 'Close Dismantle', detail: `ID: ${closeItem.customer_id}` })
      toast.success('Dismantle ditandai selesai')
      setIsCloseModalOpen(false)
      fetchAll()
    } else {
      toast.error('Gagal close: ' + error.message)
    }
    setSaving(false)
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Hapus data dismantle ${item.full_name}?`)) return
    await supabase.from('dismantles').delete().eq('id', item.id)
    await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dismantle', action: 'Hapus Dismantle', detail: item.customer_id })
    toast.success('Data dihapus')
    fetchAll()
  }

  const getTechNames = (ids) => {
    if (!ids?.length) return '-'
    return ids.map(id => technicians.find(t => t.id === id)?.full_name || '?').join(', ')
  }

  const filtered = items.filter(i => {
    const matchSearch = i.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || i.customer_id?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = statusFilter === 'all' || i.aksi === statusFilter
    const matchDate = !dateFilter || i.date_input === dateFilter
    return matchSearch && matchStatus && matchDate
  })

  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const handleExportExcel = async () => {
    try {
      const { applyHeaderStyle, applyDataRowStyles, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const ws = workbook.addWorksheet('Dismantle')
      
      const headers = ['Tanggal Input', 'ID Pelanggan', 'Nama Lengkap', 'No HP', 'Alamat', 'Lokasi', 'SN ONT', 'Bayar Terakhir', 'Teknisi', 'Status', 'Tanggal Ambil', 'Note']
      setColumnWidths(ws, [16, 16, 24, 16, 30, 16, 20, 16, 24, 16, 16, 24])
      applyHeaderStyle(ws, headers)
      
      filtered.forEach(item => {
        ws.addRow([
          item.date_input,
          item.customer_id,
          item.full_name,
          item.phone_number || '',
          item.address || '',
          item.lokasi || '',
          item.serial_number || '',
          item.last_payment || '',
          getTechNames(item.technicians),
          item.aksi,
          item.pickup_date || '',
          item.note || ''
        ])
      })
      applyDataRowStyles(ws)

      await downloadWorkbook(workbook, `Dismantle ${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      toast.success('Export berhasil!')
    } catch (err) {
      toast.error('Gagal export: ' + err.message)
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const { applyHeaderStyle, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const ws = workbook.addWorksheet('Template')
      
      const headers = ['Tanggal Input (yyyy-mm-dd)', 'ID Pelanggan', 'Nama Lengkap', 'No HP', 'Alamat', 'Lokasi', 'Status', 'SN ONT', 'Bayar Terakhir', 'Note']
      setColumnWidths(ws, [26, 16, 24, 16, 30, 16, 16, 20, 16, 24])
      applyHeaderStyle(ws, headers)
      
      await downloadWorkbook(workbook, 'Template Import Dismantle.xlsx')
    } catch(err) {
      toast.error('Gagal download template')
    }
  }

  const handleImportExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const { read, utils } = await import('xlsx')
        const wb = read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = utils.sheet_to_json(ws)
        if (!data.length) { toast.error('File kosong'); return }
        const toInsert = data.map(row => ({
          date_input: row['Tanggal Input (yyyy-mm-dd)'] || row['Tanggal Input'] || format(new Date(), 'yyyy-MM-dd'),
          customer_id: String(row['ID Pelanggan'] || '').trim(),
          full_name: String(row['Nama Lengkap'] || '').trim(),
          phone_number: String(row['No HP'] || '').trim(),
          address: String(row['Alamat'] || '').trim(),
          lokasi: String(row['Lokasi'] || '').trim(),
          aksi: String(row['Status'] || 'aktif').trim().toLowerCase().replace(' ', '_'),
          serial_number: String(row['SN ONT'] || '').trim(),
          last_payment: String(row['Bayar Terakhir'] || '').trim(),
          note: String(row['Note'] || '').trim(),
          technicians: [],
          created_by: profile.id,
        })).filter(r => r.customer_id && r.full_name)
        if (!toInsert.length) { toast.error('Tidak ada data valid'); return }
        const { error } = await supabase.from('dismantles').insert(toInsert)
        if (error) throw error
        toast.success(`${toInsert.length} data dismantle berhasil diimport`)
        fetchAll()
      } catch (err) {
        toast.error('Gagal import: ' + err.message)
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Data Dismantle</h2>
          <p>Kelola pencabutan perangkat pelanggan</p>
        </div>
        <div className="page-header-right">
          {can(role, 'dismantle.input') && (
            <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Tambah Dismantle</button>
          )}
        </div>
      </div>

      <div className="stats-grid mb-4">
        {[
          { label: 'Total', val: items.length, color: 'var(--accent)' },
          { label: 'Aktif', val: items.filter(i => i.aksi === 'aktif').length, color: 'var(--warning)' },
          { label: 'Selesai', val: items.filter(i => i.aksi === 'close').length, color: 'var(--success)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-header"><div className="stat-card-icon" style={{ background: `${s.color}20` }}><ArrowDownToLine size={20} style={{ color: s.color }} /></div></div>
            <div className="stat-card-value" style={{ color: s.color }}>{s.val}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Cari nama/ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>

          <div className="date-filter-group" style={{ position: 'relative' }}>
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

          <select className="filter-select status-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="close">Close</option>
          </select>

          <div className="filter-actions" style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}><FileDown size={14} /> Template</button>
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginBottom: 0 }}>
              <Upload size={14} /> Import
              <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportExcel} />
            </label>
            <button className="btn btn-secondary btn-sm" onClick={handleExportExcel}><Download size={14} /> Export</button>
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
                    <th>Bayar Terakhir</th>
                    <th>SN</th>
                    <th>Lokasi</th>
                    <th>Teknisi</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(item => (
                    <tr key={item.id}>
                      <td className="text-secondary">{format(new Date(item.date_input), 'dd MMM yy', { locale: id })}</td>
                      <td>
                        <div className="font-semibold">{item.full_name}</div>
                        <div className="text-secondary" style={{ fontSize: '11px' }}>{item.customer_id}</div>
                        {item.phone_number && (
                          <a href={`https://wa.me/${item.phone_number.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="badge badge-success" style={{ marginTop: '4px', textDecoration: 'none', fontSize: '10px' }}>
                            <Phone size={10} /> {item.phone_number}
                          </a>
                        )}
                      </td>
                      <td>{item.last_payment || '-'}</td>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{item.serial_number || '-'}</span></td>
                      <td>
                        <div style={{ fontSize: '13px' }}>{item.lokasi || '-'}</div>
                        {item.sharelok && (
                          <a href={item.sharelok} target="_blank" rel="noreferrer" className="text-accent" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px', marginTop: '4px' }}>
                            <MapPin size={10} /> Maps
                          </a>
                        )}
                      </td>
                      <td style={{ fontSize: '12px' }}>{getTechNames(item.technicians)}</td>
                      <td>
                        {item.aksi === 'close' ? <span className="badge badge-success"><CheckCircle size={10} /> Close</span> :
                         item.aksi === 'disable' ? <span className="badge badge-muted"><X size={10} /> Disable</span> :
                         item.aksi === 'berhenti_sementara' ? <span className="badge badge-warning"><Clock size={10} /> Sementara</span> :
                         item.aksi === 'berhenti_berlangganan' ? <span className="badge badge-danger"><Trash2 size={10} /> Berhenti</span> :
                         <span className="badge badge-warning"><Clock size={10} /> Aktif</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                          {item.aksi !== 'close' && (
                            <button className="btn-icon text-success" title="Selesaikan" onClick={() => openCloseModal(item)}><CheckCircle size={15} /></button>
                          )}
                          {can(role, 'dismantle.edit') && (
                            <button className="btn-icon" title="Edit" onClick={() => openEdit(item)}><Edit2 size={15} /></button>
                          )}
                          {can(role, 'dismantle.delete') && (
                            <button className="btn-icon text-danger" title="Hapus" onClick={() => handleDelete(item)}><Trash2 size={15} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mobile-only mobile-card-list">
                {paginated.map(item => (
                  <div key={item.id} className="mobile-card">
                    <div className="mobile-card-header" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                      <div>
                        <div className="mobile-card-title">{item.full_name}</div>
                        <div className="mobile-card-subtitle">{item.customer_id}</div>
                      </div>
                      <div>
                        {item.aksi === 'close'
                          ? <span className="badge badge-success"><CheckCircle size={10} /> Close</span>
                          : <span className="badge badge-warning"><Clock size={10} /> Aktif</span>
                        }
                      </div>
                    </div>
                    {expandedId === item.id && (
                      <div className="mobile-card-body">
                        <div className="mobile-info-row"><span className="mobile-info-label">Tanggal</span><span className="mobile-info-value">{format(new Date(item.date_input), 'dd MMM yyyy', { locale: id })}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Bayar Terakhir</span><span className="mobile-info-value">{item.last_payment || '-'}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">SN</span><span className="mobile-info-value" style={{ fontFamily: 'monospace' }}>{item.serial_number || '-'}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Lokasi</span><span className="mobile-info-value">{item.lokasi || '-'}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Teknisi</span><span className="mobile-info-value">{getTechNames(item.technicians)}</span></div>
                        
                        {item.phone_number && (
                          <div className="mobile-info-row">
                            <span className="mobile-info-label">WhatsApp</span>
                            <span className="mobile-info-value">
                              <a href={`https://wa.me/${item.phone_number.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-success" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                <Phone size={14} /> Hubungi
                              </a>
                            </span>
                          </div>
                        )}
                        
                        {item.sharelok && (
                          <div className="mobile-info-row">
                            <span className="mobile-info-label">Maps</span>
                            <span className="mobile-info-value">
                              <a href={item.sharelok} target="_blank" rel="noreferrer" className="text-accent" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                <MapPin size={14} /> Buka Maps
                              </a>
                            </span>
                          </div>
                        )}

                        <div className="mobile-card-actions">
                          {item.aksi !== 'close' && (
                            <button className="btn btn-secondary btn-sm text-success" onClick={() => openCloseModal(item)}>
                              <CheckCircle size={14} /> Selesaikan
                            </button>
                          )}
                          {can(role, 'dismantle.edit') && (
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>
                              <Edit2 size={14} /> Edit
                            </button>
                          )}
                          {can(role, 'dismantle.delete') && (
                            <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(item)}>
                              <Trash2 size={14} /> Hapus
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Pagination */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', marginTop: '4px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Showing {filtered.length === 0 ? 0 : (page-1)*perPage+1}–{Math.min(page*perPage, filtered.length)} of {filtered.length} entries
                  </span>
                  <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }} style={{ padding: '3px 8px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer' }}>
                    {[10,25,50,100].map(n => <option key={n} value={n}>{n} / hal</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {(() => {
                    const tp = Math.ceil(filtered.length / perPage)
                    const btns = []
                    btns.push(<button key="first" onClick={() => setPage(1)} disabled={page===1} style={{ padding:'4px 8px', borderRadius:'6px', background:'var(--bg-card)', border:'1px solid var(--border)', color: page===1?'var(--text-muted)':'var(--text-primary)', cursor: page===1?'default':'pointer', fontSize:'13px' }}>«</button>)
                    btns.push(<button key="prev" onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{ padding:'4px 8px', borderRadius:'6px', background:'var(--bg-card)', border:'1px solid var(--border)', color: page===1?'var(--text-muted)':'var(--text-primary)', cursor: page===1?'default':'pointer', fontSize:'13px' }}>‹</button>)
                    let s=Math.max(1,page-2), e=Math.min(tp,page+2)
                    if(s>1) btns.push(<span key="se" style={{padding:'4px 4px',color:'var(--text-muted)',fontSize:'13px'}}>...</span>)
                    for(let i=s;i<=e;i++) btns.push(<button key={i} onClick={()=>setPage(i)} style={{ padding:'4px 10px', borderRadius:'6px', background: i===page?'var(--accent)':'var(--bg-card)', border:'1px solid var(--border)', color: i===page?'#000':'var(--text-primary)', cursor:'pointer', fontWeight: i===page?700:400, fontSize:'13px' }}>{i}</button>)
                    if(e<tp) btns.push(<span key="ee" style={{padding:'4px 4px',color:'var(--text-muted)',fontSize:'13px'}}>...</span>)
                    btns.push(<button key="next" onClick={() => setPage(p=>Math.min(tp,p+1))} disabled={page>=tp} style={{ padding:'4px 8px', borderRadius:'6px', background:'var(--bg-card)', border:'1px solid var(--border)', color: page>=tp?'var(--text-muted)':'var(--text-primary)', cursor: page>=tp?'default':'pointer', fontSize:'13px' }}>›</button>)
                    btns.push(<button key="last" onClick={() => setPage(tp)} disabled={page>=tp} style={{ padding:'4px 8px', borderRadius:'6px', background:'var(--bg-card)', border:'1px solid var(--border)', color: page>=tp?'var(--text-muted)':'var(--text-primary)', cursor: page>=tp?'default':'pointer', fontSize:'13px' }}>»</button>)
                    return btns
                  })()}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state"><ArrowDownToLine size={48} /><h3>Tidak Ada Data</h3><p>Belum ada data dismantle.</p></div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>{editItem ? 'Edit Data Dismantle' : 'Tambah Dismantle'}</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Tanggal Input</label>
                  <input type="date" className="form-input" value={form.date_input} onChange={e => setForm(f => ({ ...f, date_input: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">ID Pelanggan <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" placeholder="ID Pelanggan" value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} disabled={!!editItem} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Nama Lengkap <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" placeholder="Nama Pelanggan" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">No HP</label>
                  <input className="form-input" placeholder="08xx" value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Alamat</label>
                <input className="form-input" placeholder="Alamat lengkap" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Sharelok (Link Maps)</label>
                  <input className="form-input" placeholder="https://maps.google.com/..." value={form.sharelok} onChange={e => setForm(f => ({ ...f, sharelok: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Bayar Terakhir</label>
                  <input className="form-input" placeholder="Contoh: Januari 2024" value={form.last_payment} onChange={e => setForm(f => ({ ...f, last_payment: e.target.value }))} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Lokasi <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-input" style={{ height: 'auto' }} value={form.lokasi} onChange={e => setForm(f => ({ ...f, lokasi: e.target.value }))}>
                    <option value="">Pilih Lokasi</option>
                    <option value="Banyumas">Banyumas</option>
                    <option value="Cilacap">Cilacap</option>
                    <option value="Cilacap-Herman">Cilacap-Herman</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-input" style={{ height: 'auto' }} value={form.aksi} onChange={e => setForm(f => ({ ...f, aksi: e.target.value }))}>
                    <option value="aktif">Aktif</option>
                    <option value="disable">Disable</option>
                    <option value="berhenti_sementara">Berhenti Sementara</option>
                    <option value="berhenti_berlangganan">Berhenti Berlangganan</option>
                    <option value="close">Close</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Serial Number ONT</label>
                <input className="form-input" placeholder="SN perangkat yang akan dicabut" value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} />
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
              <div className="form-group">
                <label className="form-label">Note</label>
                <textarea className="form-input" rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Keterangan tambahan..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : (editItem ? 'Simpan Perubahan' : 'Tambah')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCloseModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Selesaikan Dismantle</h3>
              <button className="btn-icon" onClick={() => setIsCloseModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '12px', background: 'var(--bg-hover)', borderRadius: '8px', fontSize: '13px' }}>
                Menandai dismantle <strong>{closeItem?.full_name}</strong> sebagai selesai.
              </div>
              <div className="form-group">
                <label className="form-label">Pilih Teknisi Eksekutor <span style={{ color: 'var(--danger)' }}>*</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {technicians.map(t => (
                    <button key={t.id} type="button" onClick={() => toggleCloseTech(t.id)}
                      className={`badge ${closeForm.technicians.includes(t.id) ? 'badge-accent' : 'badge-muted'}`}
                      style={{ border: 'none', cursor: 'pointer', padding: '5px 10px' }}>
                      {t.full_name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal Close</label>
                <input type="date" className="form-input" value={closeForm.pickup_date} onChange={e => setCloseForm(f => ({ ...f, pickup_date: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsCloseModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={submitClose} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : 'Selesaikan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

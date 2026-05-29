import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, ArrowDownToLine, CheckCircle, Clock, MapPin, Phone, FileDown, Upload, Download } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { useProgress } from '../../contexts/ProgressContext'
import Pagination from '../../components/common/Pagination'

export default function Dismantle() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const { showProgress, hideProgress } = useProgress()

  const [items, setItems] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false)
  const [closeItem, setCloseItem] = useState(null)
  const [closeForm, setCloseForm] = useState({ aksi: 'close', pickup_date: format(new Date(), 'yyyy-MM-dd'), technicians: [], note: '' })
  const [editItem, setEditItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [koordinatorFilter, setKoordinatorFilter] = useState('all')

  const emptyForm = {
    date_input: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '', full_name: '', address: '', sharelok: '',
    phone_number: '', last_payment: '', serial_number: '',
    technicians: [], aksi: 'aktif', pickup_date: '', note: '', lokasi: '', koordinator: ''
  }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { setPage(1) }, [searchTerm, statusFilter, dateFilter, koordinatorFilter])

  useEffect(() => {
    if (isModalOpen || isCloseModalOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [isModalOpen, isCloseModalOpen])

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
      technicians: item.technicians || [], aksi: item.aksi || 'aktif', pickup_date: item.pickup_date || '', note: item.note || '', lokasi: item.lokasi || '', koordinator: item.koordinator || ''
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
    setCloseForm({ aksi: 'close', pickup_date: format(new Date(), 'yyyy-MM-dd'), technicians: item.technicians || [], note: item.note || '' })
    setIsCloseModalOpen(true)
  }

  const submitClose = async () => {
    if (!closeForm.technicians.length) {
      toast.error('Pilih minimal 1 teknisi yang melakukan eksekusi')
      return
    }
    if (closeForm.aksi === 'pending' && !closeForm.note.trim()) {
      toast.error('Note wajib diisi untuk status Pending')
      return
    }
    setSaving(true)
    const updateData = { 
      aksi: closeForm.aksi, 
      technicians: closeForm.technicians,
      updated_at: new Date().toISOString() 
    }
    if (closeForm.aksi === 'close') {
      updateData.pickup_date = closeForm.pickup_date
      updateData.note = closeForm.note || ''
    } else if (closeForm.aksi === 'pending') {
      updateData.note = closeForm.note
    }

    const { error } = await supabase.from('dismantles').update(updateData).eq('id', closeItem.id)
    
    if (!error) {
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dismantle', action: closeForm.aksi === 'close' ? 'Close Dismantle' : 'Pending Dismantle', detail: `ID: ${closeItem.customer_id}` })
      toast.success(`Dismantle ditandai ${closeForm.aksi}`)
      setIsCloseModalOpen(false)
      fetchAll()
    } else {
      toast.error('Gagal update status: ' + error.message)
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

  const koordinatorList = [...new Set(items.map(i => i.koordinator).filter(Boolean))].sort()

  const filtered = items.filter(i => {
    const matchSearch = i.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || i.customer_id?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = statusFilter === 'all' || i.aksi === statusFilter
    const matchDate = !dateFilter || i.date_input === dateFilter
    const matchKoordinator = koordinatorFilter === 'all' || (i.koordinator || '') === koordinatorFilter
    return matchSearch && matchStatus && matchDate && matchKoordinator
  })

  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const handleExportExcel = async () => {
    try {
      showProgress('Menyiapkan Export', 'Menginisialisasi file Excel...', 10)
      const { applyHeaderStyle, applyDataRowStyles, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const ws = workbook.addWorksheet('Dismantle')
      
      const headers = ['Tanggal Input', 'ID Pelanggan', 'Nama Lengkap', 'No HP', 'Alamat', 'Lokasi', 'Koordinator', 'SN ONT', 'Bayar Terakhir', 'Teknisi', 'Status', 'Tanggal Ambil', 'Note']
      setColumnWidths(ws, [16, 16, 24, 16, 30, 16, 20, 20, 16, 24, 16, 16, 24])
      applyHeaderStyle(ws, headers)
      
      for (let i = 0; i < filtered.length; i++) {
        const item = filtered[i]
        ws.addRow([
          item.date_input,
          item.customer_id,
          item.full_name,
          item.phone_number || '',
          item.address || '',
          item.lokasi || '',
          item.koordinator || '',
          item.serial_number || '',
          item.last_payment || '',
          getTechNames(item.technicians),
          item.aksi,
          item.pickup_date || '',
          item.note || ''
        ])
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses baris ${i + 1} dari ${filtered.length}...`, 10 + ((i + 1) / filtered.length) * 80)
          await new Promise(r => setTimeout(r, 0))
        }
      }
      applyDataRowStyles(ws)

      showProgress('Menyelesaikan Export', 'Mengunduh file Excel...', 95)
      await downloadWorkbook(workbook, `Dismantle ${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      toast.success('Export berhasil!')
    } catch (err) {
      toast.error('Gagal export: ' + err.message)
    } finally {
      hideProgress()
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const { applyHeaderStyle, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const ws = workbook.addWorksheet('Template')
      
      const headers = ['Tanggal Input (yyyy-mm-dd)', 'ID Pelanggan', 'Nama Lengkap', 'No HP', 'Alamat', 'Lokasi', 'Koordinator', 'Status', 'SN ONT', 'Bayar Terakhir', 'Note']
      setColumnWidths(ws, [26, 16, 24, 16, 30, 16, 20, 16, 20, 16, 24])
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
        showProgress('Membaca File', 'Menganalisis isi Excel...', 10)
        const { read, utils } = await import('xlsx')
        const wb = read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = utils.sheet_to_json(ws)
        if (!data.length) { toast.error('File kosong'); hideProgress(); return }
        
        showProgress('Memvalidasi Data', 'Mencocokkan kolom...', 20)
        const toInsert = data.map(row => ({
          date_input: row['Tanggal Input (yyyy-mm-dd)'] || row['Tanggal Input'] || format(new Date(), 'yyyy-MM-dd'),
          customer_id: String(row['ID Pelanggan'] || '').trim(),
          full_name: String(row['Nama Lengkap'] || '').trim(),
          phone_number: String(row['No HP'] || '').trim(),
          address: String(row['Alamat'] || '').trim(),
          lokasi: String(row['Lokasi'] || '').trim(),
          koordinator: String(row['Koordinator'] || '').trim(),
          aksi: String(row['Status'] || 'aktif').trim().toLowerCase().replace(/ /g, '_'),
          serial_number: String(row['SN ONT'] || '').trim(),
          last_payment: String(row['Bayar Terakhir'] || '').trim(),
          note: String(row['Note'] || '').trim(),
          technicians: [],
          created_by: profile.id,
        })).filter(r => r.customer_id && r.full_name)
        if (!toInsert.length) { toast.error('Tidak ada data valid'); hideProgress(); return }
        
        let inserted = 0
        const batchSize = 50
        for (let i = 0; i < toInsert.length; i += batchSize) {
          const batch = toInsert.slice(i, i + batchSize)
          const { error } = await supabase.from('dismantles').insert(batch)
          if (error) throw error
          inserted += batch.length
          showProgress('Menyimpan ke Database', `Menyimpan ${inserted} dari ${toInsert.length} data...`, 20 + (inserted / toInsert.length) * 80)
        }
        
        toast.success(`${inserted} data dismantle berhasil diimport`)
        fetchAll()
      } catch (err) {
        toast.error('Gagal import: ' + err.message)
      } finally {
        hideProgress()
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
            <option value="disable">Disable</option>
            <option value="berhenti_sementara">Berhenti Sementara</option>
            <option value="berhenti_berlangganan">Berhenti Berlangganan</option>
            <option value="close">Close</option>
          </select>

          <select className="filter-select" value={koordinatorFilter} onChange={e => setKoordinatorFilter(e.target.value)}>
            <option value="all">Semua Koordinator</option>
            {koordinatorList.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
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
                    <th>Koordinator</th>
                    <th>Teknisi</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(item => (
                    <tr key={item.id}>
                      <td>
                        <div>{format(new Date(item.date_input), 'dd MMM yyyy', { locale: id })}</div>
                        {item.aksi === 'close' && item.pickup_date && (
                          <div className="text-success" style={{ fontSize: '10px', marginTop: '4px', fontWeight: 600 }}>
                            Close: {format(new Date(item.pickup_date), 'dd MMM yy', { locale: id })}
                          </div>
                        )}
                      </td>
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
                      <td style={{ fontSize: '12px' }}>{item.koordinator || '-'}</td>
                      <td style={{ fontSize: '12px' }}>{getTechNames(item.technicians)}</td>
                      <td>
                        {item.aksi === 'close' ? <span className="badge badge-success"><CheckCircle size={10} /> Close</span> :
                         item.aksi === 'pending' ? <span className="badge badge-info" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><Clock size={10} /> Pending</span> :
                         item.aksi === 'disable' ? <span className="badge badge-muted"><X size={10} /> Disable</span> :
                         item.aksi === 'berhenti_sementara' ? <span className="badge badge-warning"><Clock size={10} /> Berhenti Sementara</span> :
                         item.aksi === 'berhenti_berlangganan' ? <span className="badge badge-danger"><Trash2 size={10} /> Berhenti Berlangganan</span> :
                         <span className="badge badge-accent"><CheckCircle size={10} /> Aktif</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                          {item.aksi !== 'close' && (
                            <button className="btn-icon text-success" title="Update Status" onClick={() => openCloseModal(item)}><CheckCircle size={15} /></button>
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
                        {item.aksi === 'close' ? <span className="badge badge-success"><CheckCircle size={10} /> Close</span> :
                         item.aksi === 'pending' ? <span className="badge badge-info" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><Clock size={10} /> Pending</span> :
                         item.aksi === 'disable' ? <span className="badge badge-muted"><X size={10} /> Disable</span> :
                         item.aksi === 'berhenti_sementara' ? <span className="badge badge-warning"><Clock size={10} /> Berhenti Sementara</span> :
                         item.aksi === 'berhenti_berlangganan' ? <span className="badge badge-danger"><Trash2 size={10} /> Berhenti Berlangganan</span> :
                         <span className="badge badge-accent"><CheckCircle size={10} /> Aktif</span>}
                      </div>
                    </div>
                    {expandedId === item.id && (
                      <div className="mobile-card-body">
                        <div className="mobile-info-row"><span className="mobile-info-label">Tanggal Input</span><span className="mobile-info-value">{format(new Date(item.date_input), 'dd MMM yyyy', { locale: id })}</span></div>
                        {item.aksi === 'close' && item.pickup_date && (
                          <div className="mobile-info-row"><span className="mobile-info-label">Tanggal Close</span><span className="mobile-info-value text-success font-semibold">{format(new Date(item.pickup_date), 'dd MMM yyyy', { locale: id })}</span></div>
                        )}
                        <div className="mobile-info-row"><span className="mobile-info-label">Bayar Terakhir</span><span className="mobile-info-value">{item.last_payment || '-'}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">SN</span><span className="mobile-info-value" style={{ fontFamily: 'monospace' }}>{item.serial_number || '-'}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Lokasi</span><span className="mobile-info-value">{item.lokasi || '-'}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Koordinator</span><span className="mobile-info-value">{item.koordinator || '-'}</span></div>
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
                            <button className="btn btn-secondary btn-sm text-success" onClick={(e) => { e.stopPropagation(); openCloseModal(item) }}>
                              <CheckCircle size={14} /> Update Status
                            </button>
                          )}
                          {can(role, 'dismantle.edit') && (
                            <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(item) }}>
                              <Edit2 size={14} /> Edit
                            </button>
                          )}
                          {can(role, 'dismantle.delete') && (
                            <button className="btn btn-secondary btn-sm text-danger" onClick={(e) => { e.stopPropagation(); handleDelete(item) }}>
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
              <Pagination 
                page={page} 
                setPage={setPage} 
                perPage={perPage} 
                setPerPage={setPerPage} 
                totalItems={filtered.length} 
              />
            </>
          ) : (
            <div className="empty-state"><ArrowDownToLine size={48} /><h3>Tidak Ada Data</h3><p>Belum ada data dismantle.</p></div>
          )}
        </div>
      </div>

      {isModalOpen && createPortal(
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
                <label className="form-label">Koordinator</label>
                <input className="form-input" placeholder="Nama koordinator..." value={form.koordinator} onChange={e => setForm(f => ({ ...f, koordinator: e.target.value }))} />
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
      , document.body)}

      {isCloseModalOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Update Status Eksekusi</h3>
              <button className="btn-icon" onClick={() => setIsCloseModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Status Eksekusi <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select className="form-input" style={{ height: 'auto' }} value={closeForm.aksi} onChange={e => setCloseForm(f => ({ ...f, aksi: e.target.value }))}>
                  <option value="close">Close (ONT Terambil)</option>
                  <option value="pending">Pending (Tertunda / Gagal Ambil)</option>
                </select>
              </div>
              <div style={{ padding: '12px', background: 'var(--bg-hover)', borderRadius: '8px', fontSize: '13px' }}>
                {closeForm.aksi === 'close' ? (
                  <>Menandai <strong>{closeItem?.full_name}</strong> sebagai <strong>Close</strong> — pelanggan sudah close dan ONT sudah diambil.</>
                ) : (
                  <>Menandai <strong>{closeItem?.full_name}</strong> sebagai <strong>Pending</strong> — teknisi sudah ke rumah pelanggan tetapi ONT belum terambil.</>
                )}
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
              {closeForm.aksi === 'close' && (
                <div className="form-group">
                  <label className="form-label">Tanggal Close</label>
                  <input type="date" className="form-input" value={closeForm.pickup_date} onChange={e => setCloseForm(f => ({ ...f, pickup_date: e.target.value }))} />
                </div>
              )}
              {closeForm.aksi === 'pending' && (
                <div className="form-group">
                  <label className="form-label">Note / Alasan <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <textarea className="form-input" placeholder="Alasan belum terambil (misal: rumah kosong)" rows="3" value={closeForm.note} onChange={e => setCloseForm(f => ({ ...f, note: e.target.value }))}></textarea>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsCloseModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={submitClose} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : 'Simpan Status'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}

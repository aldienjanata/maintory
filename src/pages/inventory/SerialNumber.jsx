import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, X, Hash, UploadCloud, CheckCircle, Clock, FileDown, Upload, Download } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import * as XLSX from 'xlsx'

export default function SerialNumber() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'

  const [items, setItems] = useState([])
  const [brands, setBrands] = useState([])
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [brandFilter, setBrandFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [form, setForm] = useState({ brand_id: '', type_id: '', serial_number: '', date_in: format(new Date(), 'yyyy-MM-dd'), note: '', status: 'tersedia' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [snRes, brandRes] = await Promise.all([
      supabase.from('serial_numbers').select('*, brand:ont_brands(brand_name), type:ont_types(type_name)').order('date_in', { ascending: false }),
      supabase.from('ont_brands').select('*').order('brand_name')
    ])
    if (!snRes.error) setItems(snRes.data || [])
    if (!brandRes.error) setBrands(brandRes.data || [])
    setLoading(false)
  }

  const fetchTypes = async (brandId) => {
    if (!brandId) { setTypes([]); return }
    const { data } = await supabase.from('ont_types').select('*').eq('brand_id', brandId).order('type_name')
    setTypes(data || [])
  }

  const handleBrandChange = (brandId) => {
    setForm(f => ({ ...f, brand_id: brandId, type_id: '' }))
    fetchTypes(brandId)
  }

  const handleSaveSingle = async () => {
    if (!form.serial_number) { toast.error('Serial Number wajib diisi'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('serial_numbers').insert({ ...form, created_by: profile.id })
      if (error) throw error
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Serial Number', action: 'Tambah SN', detail: `SN: ${form.serial_number}` })
      toast.success('Serial Number berhasil ditambahkan')
      setIsModalOpen(false)
      fetchAll()
    } catch (err) {
      toast.error(err.code === '23505' ? 'Serial Number sudah ada!' : 'Gagal: ' + err.message)
    } finally { setSaving(false) }
  }

  const handleSaveBulk = async () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) { toast.error('Masukkan minimal 1 serial number'); return }
    if (!form.brand_id) { toast.error('Pilih merk terlebih dahulu'); return }
    setSaving(true)
    try {
      const inserts = lines.map(sn => ({
        brand_id: form.brand_id || null,
        type_id: form.type_id || null,
        serial_number: sn,
        date_in: form.date_in,
        status: 'tersedia',
        created_by: profile.id
      }))
      const { error } = await supabase.from('serial_numbers').insert(inserts)
      if (error) throw error
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Serial Number', action: 'Input Massal SN', detail: `${lines.length} SN ditambahkan` })
      toast.success(`${lines.length} Serial Number berhasil ditambahkan`)
      setIsModalOpen(false)
      setBulkText('')
      fetchAll()
    } catch (err) {
      toast.error('Gagal: ' + err.message)
    } finally { setSaving(false) }
  }

  const handleDelete = async (item) => {
    if (item.status === 'terpakai') { toast.error('SN yang sudah terpakai tidak bisa dihapus'); return }
    if (!window.confirm(`Hapus SN ${item.serial_number}?`)) return
    await supabase.from('serial_numbers').delete().eq('id', item.id)
    await logActivity({ userId: profile.id, username: profile.username, role, module: 'Serial Number', action: 'Hapus SN', detail: `SN: ${item.serial_number}` })
    toast.success('SN dihapus')
    fetchAll()
  }

  const filtered = items.filter(i => {
    const matchSearch = i.serial_number?.toLowerCase().includes(searchTerm.toLowerCase()) || i.brand?.brand_name?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = statusFilter === 'all' || i.status === statusFilter
    const matchBrand = brandFilter === 'all' || i.brand_id === brandFilter
    return matchSearch && matchStatus && matchBrand
  })

  const statsData = {
    total: items.length,
    tersedia: items.filter(i => i.status === 'tersedia').length,
    terpakai: items.filter(i => i.status === 'terpakai').length,
  }

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(i => ({
      'Serial Number': i.serial_number,
      'Merk': i.brand?.brand_name || '-',
      'Tipe': i.type?.type_name || '-',
      'Tanggal Masuk': i.date_in,
      'Status': i.status,
      'Note': i.note || '',
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Serial Number')
    XLSX.writeFile(wb, `serial_number_${new Date().toISOString().slice(0,10)}.xlsx`)
    toast.success('Export berhasil')
  }

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Serial Number', 'Tanggal Masuk (yyyy-mm-dd)']])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, 'template_serial_number.xlsx')
  }

  const handleImportExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws)
        if (!data.length) { toast.error('File kosong'); return }
        const toInsert = data
          .map(row => ({
            serial_number: String(row['Serial Number'] || '').trim(),
            date_in: row['Tanggal Masuk (yyyy-mm-dd)'] || row['Tanggal Masuk'] || format(new Date(), 'yyyy-MM-dd'),
            status: 'tersedia',
            created_by: profile.id,
          }))
          .filter(r => r.serial_number)
        if (!toInsert.length) { toast.error('Tidak ada data valid'); return }
        const { error } = await supabase.from('serial_numbers').insert(toInsert)
        if (error) throw error
        toast.success(`${toInsert.length} SN berhasil diimport`)
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
          <h2>Serial Number ONT</h2>
          <p>Kelola stok ONT berdasarkan serial number</p>
        </div>
        <div className="page-header-right">
          {can(role, 'inventory.add') && (
            <button className="btn btn-primary" onClick={() => { setIsModalOpen(true); setIsBulkMode(false); setForm(f => ({ ...f, serial_number: '', note: '' })) }}>
              <Plus size={16} /> Tambah SN
            </button>
          )}
        </div>
      </div>

      <div className="stats-grid mb-4">
        <div className="stat-card">
          <div className="stat-card-header"><div className="stat-card-icon" style={{ background: 'var(--accent-dim)' }}><Hash size={20} style={{ color: 'var(--accent)' }} /></div></div>
          <div className="stat-card-value" style={{ color: 'var(--accent)' }}>{statsData.total}</div>
          <div className="stat-card-label">Total SN</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header"><div className="stat-card-icon" style={{ background: 'var(--success-dim)' }}><CheckCircle size={20} style={{ color: 'var(--success)' }} /></div></div>
          <div className="stat-card-value" style={{ color: 'var(--success)' }}>{statsData.tersedia}</div>
          <div className="stat-card-label">Tersedia</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header"><div className="stat-card-icon" style={{ background: 'var(--warning-dim)' }}><Clock size={20} style={{ color: 'var(--warning)' }} /></div></div>
          <div className="stat-card-value" style={{ color: 'var(--warning)' }}>{statsData.terpakai}</div>
          <div className="stat-card-label">Terpakai</div>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="search-box" style={{ maxWidth: '200px' }}>
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Cari SN..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <select className="filter-select" value={brandFilter} onChange={e => setBrandFilter(e.target.value)}>
            <option value="all">Semua Merk</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.brand_name}</option>)}
          </select>
          <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="tersedia">Tersedia</option>
            <option value="terpakai">Terpakai</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}><FileDown size={14} /> Template</button>
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginBottom: 0 }}>
              <Upload size={14} /> Import
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportExcel} />
            </label>
            <button className="btn btn-secondary btn-sm" onClick={handleExportExcel}><Download size={14} /> Export</button>
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <div className="flex-center" style={{ height: '180px' }}><div className="spinner" /></div>
          ) : filtered.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Serial Number</th>
                  <th>Merk</th>
                  <th>Tipe</th>
                  <th>Tanggal Masuk</th>
                  <th>Status</th>
                  <th>Note</th>
                  {can(role, 'inventory.delete') && <th style={{ textAlign: 'right' }}>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td><span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '13px' }}>{item.serial_number}</span></td>
                    <td>{item.brand?.brand_name || '-'}</td>
                    <td>{item.type?.type_name || '-'}</td>
                    <td className="text-secondary">{item.date_in ? format(new Date(item.date_in), 'dd MMM yyyy', { locale: id }) : '-'}</td>
                    <td>
                      {item.status === 'tersedia'
                        ? <span className="badge badge-success"><CheckCircle size={10} /> Tersedia</span>
                        : <span className="badge badge-warning"><Clock size={10} /> Terpakai</span>
                      }
                    </td>
                    <td className="text-secondary">{item.note || '-'}</td>
                    {can(role, 'inventory.delete') && (
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn-icon text-danger" onClick={() => handleDelete(item)}><Trash2 size={15} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state"><Hash size={48} /><h3>Tidak Ada SN</h3><p>Belum ada serial number tersimpan.</p></div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Tambah Serial Number</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Mode toggle */}
              <div className="tabs" style={{ marginBottom: 0 }}>
                <button className={`tab-item ${!isBulkMode ? 'active' : ''}`} onClick={() => setIsBulkMode(false)}>Input Satu</button>
                <button className={`tab-item ${isBulkMode ? 'active' : ''}`} onClick={() => setIsBulkMode(true)}><UploadCloud size={14} /> Input Massal</button>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Merk ONT</label>
                  <select className="form-input" style={{ height: 'auto' }} value={form.brand_id} onChange={e => handleBrandChange(e.target.value)}>
                    <option value="">-- Pilih Merk --</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.brand_name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipe</label>
                  <select className="form-input" style={{ height: 'auto' }} value={form.type_id} onChange={e => setForm(f => ({ ...f, type_id: e.target.value }))} disabled={!types.length}>
                    <option value="">-- Pilih Tipe --</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.type_name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal Masuk</label>
                <input type="date" className="form-input" value={form.date_in} onChange={e => setForm(f => ({ ...f, date_in: e.target.value }))} />
              </div>
              {!isBulkMode ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Serial Number <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input className="form-input" placeholder="ZXHN..." value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Note</label>
                    <input className="form-input" placeholder="Opsional..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
                  </div>
                </>
              ) : (
                <div className="form-group">
                  <label className="form-label">Daftar Serial Number (satu per baris)</label>
                  <textarea className="form-input" rows={8} placeholder={"ZXHN12345\nZXHN67890\nZXHN11111"} value={bulkText} onChange={e => setBulkText(e.target.value)} style={{ fontFamily: 'monospace', resize: 'vertical' }} />
                  <span className="text-secondary" style={{ fontSize: '12px' }}>
                    {bulkText.split('\n').filter(l => l.trim()).length} SN terdeteksi
                  </span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={isBulkMode ? handleSaveBulk : handleSaveSingle} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

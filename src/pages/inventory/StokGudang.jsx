import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, Package, TrendingDown, TrendingUp, FileDown, Upload, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

const UNITS = ['unit', 'buah', 'pcs', 'meter', 'roll', 'set', 'dus', 'kg', 'haspel']
const ITEM_TYPES = [
  { value: 'ont', label: 'ONT / Modem' },
  { value: 'dropcore_1c', label: 'Dropcore 1C' },
  { value: 'dropcore_4c', label: 'Dropcore 4C' },
  { value: 'other', label: 'Lainnya' },
]

export default function StokGudang() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ item_name: '', initial_stock: '', unit: 'unit', item_type: 'other' })
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => { fetchItems() }, [])

  const fetchItems = async () => {
    setLoading(true)
    const [whRes, snRes, dcRes, expItemRes] = await Promise.all([
      supabase.from('warehouses').select('*').order('item_name'),
      supabase.from('serial_numbers').select('status'),
      supabase.from('dropcore_haspels').select('type, status, initial_meters, used_meters, remaining_meters'),
      supabase.from('expense_items').select('warehouse_item_id, quantity').eq('item_type', 'other')
    ])
    
    if (!whRes.error) {
      const whItems = whRes.data || []
      const sns = snRes.data || []
      const haspels = dcRes.data || []
      const expItems = expItemRes.data || []
      
      const totalSnCount = sns.length
      const usedSnCount = sns.filter(s => s.status === 'terpakai').length
      const availSnCount = totalSnCount - usedSnCount
      
      const dc1cList = haspels.filter(h => h.type === '1c')
      const dc1cHaspelsTotal = dc1cList.length
      const dc1cHaspelsCurrent = dc1cList.filter(h => (Number(h.initial_meters || 0) - Number(h.used_meters || 0)) === 1000).length
      const dc1cHaspelsOut = dc1cHaspelsTotal - dc1cHaspelsCurrent
      const dc1cRemainingMeters = dc1cList.reduce((acc, h) => acc + (Number(h.initial_meters || 0) - Number(h.used_meters || 0)), 0)
      
      const dc4cList = haspels.filter(h => h.type === '4c')
      const dc4cHaspelsTotal = dc4cList.length
      const dc4cHaspelsCurrent = dc4cList.filter(h => (Number(h.initial_meters || 0) - Number(h.used_meters || 0)) === 1000).length
      const dc4cHaspelsOut = dc4cHaspelsTotal - dc4cHaspelsCurrent
      const dc4cRemainingMeters = dc4cList.reduce((acc, h) => acc + (Number(h.initial_meters || 0) - Number(h.used_meters || 0)), 0)
      
      const processed = whItems.map(item => {
        let initial = Number(item.initial_stock) || 0
        let out = 0
        let current = initial
        let remaining_meters = 0

        const isOnt = item.item_type === 'ont' || (/ont|modem/i.test(item.item_name) && item.item_type === 'other')
        const isDc1c = item.item_type === 'dropcore_1c' || (/dropcore/i.test(item.item_name) && /1c/i.test(item.item_name) && item.item_type === 'other')
        const isDc4c = item.item_type === 'dropcore_4c' || (/dropcore/i.test(item.item_name) && /4c/i.test(item.item_name) && item.item_type === 'other')

        if (isOnt) {
          initial = totalSnCount
          out = usedSnCount
          current = availSnCount
        } else if (isDc1c) {
          initial = dc1cHaspelsTotal
          out = dc1cHaspelsOut
          current = dc1cHaspelsCurrent
          remaining_meters = dc1cRemainingMeters
        } else if (isDc4c) {
          initial = dc4cHaspelsTotal
          out = dc4cHaspelsOut
          current = dc4cHaspelsCurrent
          remaining_meters = dc4cRemainingMeters
        } else {
          const totalOut = expItems
            .filter(ei => ei.warehouse_item_id === item.id)
            .reduce((acc, ei) => acc + Number(ei.quantity || 0), 0)
          out = totalOut
          current = initial - out
        }
        
        return {
          ...item,
          display_initial: initial,
          display_out: out,
          display_current: current,
          remaining_meters
        }
      })
      
      setItems(processed)
    }
    setLoading(false)
  }

  const openAdd = () => {
    setEditItem(null)
    setForm({ item_name: '', initial_stock: '', unit: 'unit', item_type: 'other' })
    setIsModalOpen(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({ item_name: item.item_name, initial_stock: item.initial_stock, unit: item.unit, item_type: item.item_type })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.item_name || (form.item_type === 'other' && form.initial_stock === '')) {
      toast.error('Nama dan stok awal wajib diisi')
      return
    }
    const finalForm = { ...form, initial_stock: form.item_type !== 'other' ? 0 : form.initial_stock }
    setSaving(true)
    try {
      if (editItem) {
        const { error } = await supabase.from('warehouses').update({ ...finalForm, updated_at: new Date().toISOString() }).eq('id', editItem.id)
        if (error) throw error
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Stok Gudang', action: 'Edit Stok', detail: `Edit item: ${form.item_name}` })
        toast.success('Data stok berhasil diperbarui')
      } else {
        const { error } = await supabase.from('warehouses').insert({ ...finalForm, created_by: profile.id })
        if (error) throw error
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Stok Gudang', action: 'Tambah Stok', detail: `Tambah item: ${form.item_name}` })
        toast.success('Item stok berhasil ditambahkan')
      }
      setIsModalOpen(false)
      fetchItems()
    } catch (err) {
      toast.error('Gagal menyimpan: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Hapus item "${item.item_name}"?`)) return
    const { error } = await supabase.from('warehouses').delete().eq('id', item.id)
    if (!error) {
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Stok Gudang', action: 'Hapus Stok', detail: `Hapus: ${item.item_name}` })
      toast.success('Item dihapus')
      fetchItems()
    }
  }

  const getTypeBadge = (type) => {
    const map = { ont: 'badge-accent', dropcore_1c: 'badge-purple', dropcore_4c: 'badge-orange', other: 'badge-muted' }
    const label = ITEM_TYPES.find(t => t.value === type)?.label || type
    return <span className={`badge ${map[type] || 'badge-muted'}`}>{label}</span>
  }

  const filtered = items.filter(i =>
    i.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (typeFilter === 'all' || i.item_type === typeFilter)
  )

  const totalStok = filtered.reduce((s, i) => s + (Number(i.display_current) || 0), 0)

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(i => ({
      'Nama Item': i.item_name,
      'Tipe': ITEM_TYPES.find(t => t.value === i.item_type)?.label || i.item_type,
      'Stok Awal': i.display_initial,
      'Stok Keluar': i.display_out,
      'Stok Saat Ini': i.display_current,
      'Satuan': i.unit,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stok Gudang')
    XLSX.writeFile(wb, `stok_gudang_${new Date().toISOString().slice(0,10)}.xlsx`)
    toast.success('Export berhasil')
  }

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nama Item', 'Tipe', 'Stok Awal', 'Satuan'],
      ['ONT ZTE F670L', 'ont', '0', 'unit'],
      ['Dropcore 1C Haspel A', 'dropcore_1c', '0', 'haspel'],
      ['Dropcore 4C Haspel B', 'dropcore_4c', '0', 'haspel'],
      ['Kabel UTP CAT6', 'other', '10', 'roll'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, 'template_stok_gudang.xlsx')
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
        if (!data.length) { toast.error('File kosong atau format tidak sesuai'); return }
        const VALID_TYPES = ['ont', 'dropcore_1c', 'dropcore_4c', 'other']
        const toInsert = data.map(row => {
          // Try multiple column name variants and sanitize
          const rawType = (
            row['Tipe'] ||
            row['Tipe (ont/dropcore_1c/dropcore_4c/other)'] ||
            row['tipe'] ||
            'other'
          ).toString().trim().toLowerCase()
          // Validate and fallback to 'other' if invalid
          const type = VALID_TYPES.includes(rawType) ? rawType : 'other'

          const rawUnit = (
            row['Satuan'] ||
            row['Satuan (unit/buah/pcs/meter/roll/set/dus/kg/haspel)'] ||
            row['Satuan (unit/buah/pcs/meter/roll/set/dus/kg)'] ||
            ''
          ).toString().trim().toLowerCase()
          let unit = rawUnit
          if (!unit) {
            if (type === 'ont') unit = 'unit'
            else if (type.startsWith('dropcore')) unit = 'haspel'
            else unit = 'pcs'
          }
          return {
            item_name: (row['Nama Item'] || row['nama item'] || '').toString().trim(),
            item_type: type,
            initial_stock: type !== 'other' ? 0 : (Number(row['Stok Awal'] || row['stok awal']) || 0),
            unit,
            created_by: profile.id,
          }
        }).filter(r => r.item_name)
        if (!toInsert.length) { toast.error('Tidak ada data valid di file'); return }
        const { error } = await supabase.from('warehouses').insert(toInsert)
        if (error) throw error
        toast.success(`${toInsert.length} item berhasil diimport`)
        fetchItems()
      } catch (err) {
        toast.error('Gagal import: ' + err.message)
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const handleTypeChange = (type) => {
    setForm(f => {
      let unit = f.unit
      if (type === 'ont') unit = 'unit'
      else if (type.startsWith('dropcore')) unit = 'haspel'
      return { ...f, item_type: type, unit, initial_stock: type !== 'other' ? 0 : f.initial_stock }
    })
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Stok Gudang</h2>
          <p>Manajemen inventaris barang dan peralatan</p>
        </div>
        <div className="page-header-right">
          {can(role, 'inventory.stok.manage') && (
            <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Tambah Item</button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid mb-4">
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon" style={{ background: 'var(--accent-dim)' }}>
              <Package size={20} style={{ color: 'var(--accent)' }} />
            </div>
          </div>
          <div className="stat-card-value">{items.length}</div>
          <div className="stat-card-label">Total Jenis Item</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon" style={{ background: 'var(--success-dim)' }}>
              <TrendingUp size={20} style={{ color: 'var(--success)' }} />
            </div>
          </div>
          <div className="stat-card-value">{items.filter(i => i.item_type === 'ont').length}</div>
          <div className="stat-card-label">Jenis ONT/Modem</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon" style={{ background: 'var(--purple-dim)' }}>
              <TrendingDown size={20} style={{ color: 'var(--purple)' }} />
            </div>
          </div>
          <div className="stat-card-value">{items.filter(i => i.item_type?.startsWith('dropcore')).length}</div>
          <div className="stat-card-label">Jenis Dropcore</div>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="search-box" style={{ maxWidth: '260px' }}>
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Cari nama item..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">Semua Tipe</option>
            {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {can(role, 'inventory.stok.import') && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}>
                  <FileDown size={14} /> Template
                </button>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginBottom: 0 }}>
                  <Upload size={14} /> Import
                  <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportExcel} />
                </label>
              </>
            )}
            {can(role, 'inventory.stok.export') && (
              <button className="btn btn-secondary btn-sm" onClick={handleExportExcel}>
                <Download size={14} /> Export
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
                    <th>Nama Item</th>
                    <th>Tipe</th>
                    <th>Stok Awal</th>
                    <th>Stok Keluar</th>
                    <th>Stok Saat Ini</th>
                    <th>Satuan</th>
                    {can(role, 'inventory.stok.manage') && <th style={{ textAlign: 'right' }}>Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id}>
                      <td className="font-semibold">{item.item_name}</td>
                      <td>{getTypeBadge(item.item_type)}</td>
                      <td>{item.item_type?.startsWith('dropcore') ? `${item.display_initial} Haspel` : item.display_initial}</td>
                      <td>{item.item_type?.startsWith('dropcore') ? `${item.display_out} Haspel` : item.display_out}</td>
                      <td>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: item.display_current <= 0 ? 'var(--danger)' : 'var(--accent)' }}>
                          {item.item_type?.startsWith('dropcore') 
                            ? `${item.display_current} Haspel (${Math.round(item.remaining_meters || 0)} m)` 
                            : item.display_current
                          }
                        </span>
                      </td>
                      <td className="text-secondary">{item.unit}</td>
                      {can(role, 'inventory.stok.manage') && (
                        <td style={{ textAlign: 'right' }}>
                          <div className="flex" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                            <button className="btn-icon" onClick={() => openEdit(item)}><Edit2 size={15} /></button>
                            {can(role, 'inventory.stok.manage') && (
                              <button className="btn-icon text-danger" onClick={() => handleDelete(item)}><Trash2 size={15} /></button>
                            )}
                          </div>
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
                        <div className="mobile-card-title">{item.item_name}</div>
                        <div className="mobile-card-subtitle">{getTypeBadge(item.item_type)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: item.display_current <= 0 ? 'var(--danger)' : 'var(--accent)' }}>
                          {item.item_type?.startsWith('dropcore') ? `${item.display_current} Hsp` : item.display_current}
                        </div>
                      </div>
                    </div>
                    {expandedId === item.id && (
                      <div className="mobile-card-body">
                        <div className="mobile-info-row"><span className="mobile-info-label">Stok Awal</span><span className="mobile-info-value">{item.item_type?.startsWith('dropcore') ? `${item.display_initial} Haspel` : item.display_initial}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Stok Keluar</span><span className="mobile-info-value">{item.item_type?.startsWith('dropcore') ? `${item.display_out} Haspel` : item.display_out}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Satuan</span><span className="mobile-info-value">{item.unit}</span></div>
                        {item.item_type?.startsWith('dropcore') && (
                          <div className="mobile-info-row"><span className="mobile-info-label">Sisa Meter</span><span className="mobile-info-value">{Math.round(item.remaining_meters || 0)} m</span></div>
                        )}
                        {can(role, 'inventory.stok.manage') && (
                          <div className="mobile-card-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}><Edit2 size={14} /> Edit</button>
                            {can(role, 'inventory.stok.manage') && (
                              <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(item)}><Trash2 size={14} /> Hapus</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state"><Package size={48} /><h3>Stok Kosong</h3><p>Belum ada item tersimpan.</p></div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{editItem ? 'Edit Item Stok' : 'Tambah Item Stok'}</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Nama Item <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="form-input" placeholder="Contoh: ONT ZTE F670L" value={form.item_name} onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Stok Awal <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" type="number" min="0" placeholder="0" value={form.item_type !== 'other' ? '0' : form.initial_stock} onChange={e => setForm(f => ({ ...f, initial_stock: e.target.value }))} disabled={form.item_type !== 'other'} />
                  {form.item_type !== 'other' && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block', lineHeight: '1.4' }}>
                      Stok {form.item_type === 'ont' ? 'ONT' : 'Dropcore'} dihitung otomatis dari sub-menu {form.item_type === 'ont' ? 'Serial Number' : 'Dropcore Haspel'}.
                    </span>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Satuan</label>
                  <select className="form-input filter-select" style={{ height: 'auto', padding: '9px 12px' }} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tipe Item</label>
                <select className="form-input filter-select" style={{ height: 'auto', padding: '9px 12px' }} value={form.item_type} onChange={e => handleTypeChange(e.target.value)}>
                  {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : (editItem ? 'Simpan Perubahan' : 'Tambah Item')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, Package, TrendingDown, TrendingUp } from 'lucide-react'

const UNITS = ['unit', 'buah', 'pcs', 'meter', 'roll', 'set', 'dus', 'kg']
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

  useEffect(() => { fetchItems() }, [])

  const fetchItems = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .order('item_name')
    if (!error) setItems(data || [])
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
    if (!form.item_name || form.initial_stock === '') {
      toast.error('Nama dan stok awal wajib diisi')
      return
    }
    setSaving(true)
    try {
      if (editItem) {
        const { error } = await supabase.from('warehouses').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editItem.id)
        if (error) throw error
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Stok Gudang', action: 'Edit Stok', detail: `Edit item: ${form.item_name}` })
        toast.success('Data stok berhasil diperbarui')
      } else {
        const { error } = await supabase.from('warehouses').insert({ ...form, created_by: profile.id })
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

  const totalStok = filtered.reduce((s, i) => s + (Number(i.initial_stock) || 0), 0)

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Stok Gudang</h2>
          <p>Manajemen inventaris barang dan peralatan</p>
        </div>
        <div className="page-header-right">
          {can(role, 'inventory.add') && (
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
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Cari nama item..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">Semua Tipe</option>
            {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="table-container">
          {loading ? (
            <div className="flex-center" style={{ height: '180px' }}><div className="spinner" /></div>
          ) : filtered.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Nama Item</th>
                  <th>Tipe</th>
                  <th>Stok Awal</th>
                  <th>Satuan</th>
                  {can(role, 'inventory.edit') && <th style={{ textAlign: 'right' }}>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td className="font-semibold">{item.item_name}</td>
                    <td>{getTypeBadge(item.item_type)}</td>
                    <td>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent)' }}>{item.initial_stock}</span>
                    </td>
                    <td className="text-secondary">{item.unit}</td>
                    {can(role, 'inventory.edit') && (
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                          <button className="btn-icon" onClick={() => openEdit(item)}><Edit2 size={15} /></button>
                          {can(role, 'inventory.delete') && (
                            <button className="btn-icon text-danger" onClick={() => handleDelete(item)}><Trash2 size={15} /></button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
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
                  <input className="form-input" type="number" min="0" placeholder="0" value={form.initial_stock} onChange={e => setForm(f => ({ ...f, initial_stock: e.target.value }))} />
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
                <select className="form-input filter-select" style={{ height: 'auto', padding: '9px 12px' }} value={form.item_type} onChange={e => setForm(f => ({ ...f, item_type: e.target.value }))}>
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

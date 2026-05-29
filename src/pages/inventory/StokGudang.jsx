import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, Package, TrendingDown, TrendingUp, FileDown, Upload, Download, History } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import HistoryModal from '../../components/HistoryModal'
import { useProgress } from '../../contexts/ProgressContext'

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
  const { showProgress, hideProgress } = useProgress()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ item_name: '', initial_stock: '', unit: 'unit', item_type: 'other' })
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  const [historyItem, setHistoryItem] = useState(null)
  const [historyData, setHistoryData] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

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

        const isOnt = item.item_type === 'ont'
        const isDc1c = item.item_type === 'dropcore_1c'
        const isDc4c = item.item_type === 'dropcore_4c'

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

  const fetchHistory = async (item) => {
    if (item.item_type !== 'other') {
      toast.error('Riwayat hanya tersedia untuk Material Gudang')
      return
    }
    setHistoryItem(item)
    setIsHistoryOpen(true)
    setHistoryLoading(true)

    const { data: logs } = await supabase.from('inventory_log').select('*, user:users(full_name)').eq('item_type', 'stok_gudang').eq('item_id', item.id).order('log_date', { ascending: true })
    const { data: expItems } = await supabase.from('expense_items').select('*, expense:daily_expenses(expense_date, site, technicians, work_type)').eq('item_type', 'other').eq('warehouse_item_id', item.id).order('created_at', { ascending: true })

    const { data: usersData } = await supabase.from('users').select('id, full_name')
    const usersMap = Object.fromEntries((usersData || []).map(u => [u.id, u.full_name]))
    const workTypeLabels = { 'ikr_psb': 'IKR / PSB', 'mt': 'Maintenance', 'pt2': 'PT2 / PT3' }

    const combined = []
    ;(logs || []).forEach(l => {
      combined.push({ date: l.log_date, action: l.action === 'masuk' ? 'Masuk' : 'Koreksi', note: l.note || '', user: l.user?.full_name, qty: l.quantity, type: 'in' })
    })
    ;(expItems || []).forEach(ei => {
      const techNames = (ei.expense?.technicians || []).map(tid => usersMap[tid]).filter(Boolean).join(', ')
      const wType = ei.expense?.work_type
      combined.push({ 
        date: ei.expense?.expense_date || '-', 
        action: 'Keluar', 
        note: ei.expense?.site || '-',
        technicianNames: techNames,
        workType: workTypeLabels[wType] || wType,
        qty: ei.quantity, 
        type: 'out' 
      })
    })
    combined.sort((a, b) => (a.date < b.date ? -1 : 1))

    setHistoryData(combined)
    setHistoryLoading(false)
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
        const { data: newWh, error } = await supabase.from('warehouses').insert({ ...finalForm, created_by: profile.id }).select().single()
        if (error) throw error
        if (form.item_type === 'other') {
          await supabase.from('inventory_log').insert({ log_date: format(new Date(), 'yyyy-MM-dd'), item_type: 'stok_gudang', item_id: newWh.id, action: 'masuk', quantity: Number(form.initial_stock), note: 'Stok awal', created_by: profile.id })
        }
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
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const handleExportExcel = async () => {
    try {
      showProgress('Menyiapkan Export', 'Menginisialisasi file Excel...', 10)
      const { applyHeaderStyle, applyDataRowStyles, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      
      const ws1 = workbook.addWorksheet('Stok Gudang')
      const headers1 = ['Nama Item', 'Tipe', 'Satuan', 'Stok Awal', 'Stok Keluar', 'Stok Saat Ini']
      setColumnWidths(ws1, [30, 20, 12, 14, 14, 16])
      applyHeaderStyle(ws1, headers1)
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        ws1.addRow([item.item_name, ITEM_TYPES.find(t => t.value === item.item_type)?.label || item.item_type, item.unit, item.display_initial, item.display_out, item.display_current])
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses Stok Gudang... (${i + 1}/${items.length})`, 10 + ((i + 1) / items.length) * 30)
          await new Promise(r => setTimeout(r, 0))
        }
      }
      applyDataRowStyles(ws1)

      const ws2 = workbook.addWorksheet('Riwayat Transaksi')
      const headers2 = ['Nama Item', 'Tanggal', 'Jenis Transaksi', 'Pekerjaan', 'Teknisi', 'Jumlah', 'Lokasi/Note']
      setColumnWidths(ws2, [30, 16, 18, 16, 24, 12, 30])
      applyHeaderStyle(ws2, headers2, '065F46')
      
      showProgress('Mengambil Data', 'Mengambil riwayat transaksi dari database...', 40)
      const { data: allExpItems } = await supabase.from('expense_items').select('*, item:warehouses(item_name), expense:daily_expenses(expense_date, site, technicians, work_type)').eq('item_type','other').order('created_at', {ascending: true})
      const { data: allLogs } = await supabase.from('inventory_log').select('*, item:warehouses(item_name)').eq('item_type','stok_gudang').order('log_date', {ascending: true})
      const { data: usersData } = await supabase.from('users').select('id, full_name')
      
      const usersMap = Object.fromEntries((usersData || []).map(u => [u.id, u.full_name]))
      const workTypeLabels = { 'ikr_psb': 'IKR / PSB', 'mt': 'Maintenance', 'pt2': 'PT2 / PT3' }

      const rows2 = []
      ;(allLogs || []).forEach(l => {
        rows2.push({ name: l.item?.item_name || '-', date: l.log_date, action: l.action === 'masuk' ? 'Masuk' : 'Koreksi', work: '-', tech: '-', qty: l.quantity || 0, note: l.note || '' })
      })
      ;(allExpItems || []).forEach(ei => {
        const techNames = (ei.expense?.technicians || []).map(tid => usersMap[tid]).filter(Boolean).join(', ')
        const wType = ei.expense?.work_type
        rows2.push({ name: ei.item?.item_name || '-', date: ei.expense?.expense_date || '-', action: 'Keluar', work: workTypeLabels[wType] || wType || '-', tech: techNames || '-', qty: ei.quantity || 0, note: `Lokasi: ${ei.expense?.site || '-'}` })
      })
      rows2.sort((a,b) => a.date < b.date ? -1 : 1)
      for (let i = 0; i < rows2.length; i++) {
        const r = rows2[i]
        ws2.addRow([r.name, r.date, r.action, r.work, r.tech, r.qty, r.note])
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses Riwayat Transaksi... (${i + 1}/${rows2.length})`, 50 + ((i + 1) / rows2.length) * 40)
          await new Promise(res => setTimeout(res, 0))
        }
      }
      applyDataRowStyles(ws2)

      showProgress('Menyelesaikan Export', 'Mengunduh file Excel...', 95)
      await downloadWorkbook(workbook, `Stok Gudang ${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      toast.success('Export berhasil!')
    } catch (err) {
      console.error(err)
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
      const headers = ['Nama Item', 'Tipe', 'Stok Awal', 'Satuan']
      setColumnWidths(ws, [30, 20, 14, 14])
      applyHeaderStyle(ws, headers)
      ws.addRow(['ONT ZTE F670L', 'ont', 0, 'unit'])
      ws.addRow(['Dropcore 1C Haspel A', 'dropcore_1c', 0, 'haspel'])
      ws.addRow(['Dropcore 4C Haspel B', 'dropcore_4c', 0, 'haspel'])
      ws.addRow(['Kabel UTP CAT6', 'other', 10, 'roll'])
      await downloadWorkbook(workbook, 'Template Import Stok Gudang.xlsx')
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
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws)
        if (!data.length) { toast.error('File kosong atau format tidak sesuai'); hideProgress(); return }
        const VALID_TYPES = ['ont', 'dropcore_1c', 'dropcore_4c', 'other']
        showProgress('Memvalidasi Data', 'Mencocokkan kolom...', 20)
        const toInsert = data.map(row => {
          const rawType = (
            row['Tipe'] ||
            row['Tipe (ont/dropcore_1c/dropcore_4c/other)'] ||
            row['tipe'] ||
            'other'
          ).toString().trim().toLowerCase()
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
        if (!toInsert.length) { toast.error('Tidak ada data valid di file'); hideProgress(); return }
        
        let inserted = 0
        const batchSize = 30
        for (let i = 0; i < toInsert.length; i += batchSize) {
          const batch = toInsert.slice(i, i + batchSize)
          const { error } = await supabase.from('warehouses').insert(batch)
          if (error) throw error
          inserted += batch.length
          showProgress('Menyimpan ke Database', `Menyimpan ${inserted} dari ${toInsert.length} item...`, 20 + (inserted / toInsert.length) * 80)
        }
        toast.success(`${inserted} item berhasil diimport`)
        fetchItems()
      } catch (err) {
        toast.error('Gagal import: ' + err.message)
      } finally {
        hideProgress()
      }
    }
    reader.readAsArrayBuffer(file)
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
                  {paginated.map(item => (
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
                            {item.item_type === 'other' && (
                              <button className="btn-icon" title="Riwayat" onClick={() => fetchHistory(item)}><History size={15} /></button>
                            )}
                            <button className="btn-icon" onClick={() => openEdit(item)}><Edit2 size={15} /></button>
                            <button className="btn-icon text-danger" onClick={() => handleDelete(item)}><Trash2 size={15} /></button>
                          </div>
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
                            {item.item_type === 'other' && (
                              <button className="btn btn-secondary btn-sm" onClick={() => fetchHistory(item)}><History size={14} /> Riwayat</button>
                            )}
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}><Edit2 size={14} /> Edit</button>
                            <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(item)}><Trash2 size={14} /> Hapus</button>
                          </div>
                        )}
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
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        item={historyItem}
        data={historyData}
        loading={historyLoading}
        title={`Riwayat Material: ${historyItem?.item_name}`}
        unit={historyItem?.unit || ''}
      />
    </div>
  )
}

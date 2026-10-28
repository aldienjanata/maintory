import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, Package, FileDown, Upload, Download, History, GitMerge, AlertCircle, ArrowRight, Check } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import HistoryModal from '../../components/HistoryModal'
import { useProgress } from '../../contexts/ProgressContext'
import Pagination from '../../components/common/Pagination'

const UNITS = ['unit', 'buah', 'pcs', 'meter', 'roll', 'set', 'dus', 'kg', 'haspel']
const ITEM_TYPES = [
  { value: 'ont', label: 'ONT / Modem' },
  { value: 'dropcore_1c', label: 'Dropcore 1C' },
  { value: 'dropcore_2c', label: 'Dropcore 2C' },
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
  const [form, setForm] = useState({ item_name: '', unit: 'unit', item_type: 'other' })
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  const [historyItem, setHistoryItem] = useState(null)
  const [historyData, setHistoryData] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  const [mergeConfirm, setMergeConfirm] = useState(null)

  useEffect(() => { fetchItems() }, [])

  const fetchItems = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('warehouses').select('*').order('item_name').limit(1000)
    if (!error) {
      setItems(data || [])
    }
    setLoading(false)
  }

  const fetchHistory = async (item) => {
    setHistoryItem(item)
    setIsHistoryOpen(true)
    setHistoryLoading(true)

    const { data: logs } = await supabase.from('inventory_log').select('*, user:users(full_name)').eq('item_type', 'stok_gudang').eq('item_id', item.id).order('log_date', { ascending: true })
    const { data: expItems } = await supabase.from('expense_items').select('*, expense:daily_expenses(expense_date, site, technicians, work_type, note)').eq('item_type', 'other').eq('warehouse_item_id', item.id).order('created_at', { ascending: true })
    const { data: dispItems } = await supabase.from('dispatch_items').select('*, dispatch:dispatches(dispatch_date, site, location, technicians, technician_id, technician_ids, work_type, status, notes)').eq('item_type', 'other').eq('warehouse_item_id', item.id)

    const { data: usersData } = await supabase.from('users').select('id, full_name')
    const usersMap = Object.fromEntries((usersData || []).map(u => [u.id, u.full_name]))
    const workTypeLabels = { 'ikr_psb': 'IKR / PSB', 'mt': 'Maintenance', 'pt2': 'PT2 / PT3', 'maintenance': 'Maintenance', 'odc_odp': 'Instalasi ODC/ODP' }

    const combined = []
    ;(logs || []).forEach(l => {
      combined.push({ date: l.log_date, action: l.action === 'masuk' ? 'Masuk' : 'Koreksi', note: l.note || '', user: l.user?.full_name, qty: l.quantity, type: 'in' })
    })
    ;(expItems || [])
      .filter(ei => !ei.expense?.note?.includes('Bon Barang'))
      .forEach(ei => {
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
      
    ;(dispItems || [])
      .filter(di => Number(di.quantity_dispatched) > 0)
      .forEach(di => {
        const techIds = di.dispatch?.technicians || di.dispatch?.technician_ids || (di.dispatch?.technician_id ? [di.dispatch.technician_id] : [])
        const techNames = techIds.map(tid => usersMap[tid]).filter(Boolean).join(', ')
        const wType = di.dispatch?.work_type
        const isSelesai = di.dispatch?.status === 'selesai'
        const qtyUsed = Number(di.quantity_used) || 0
        const qtyDispatched = Number(di.quantity_dispatched) || 0
        combined.push({
          date: di.dispatch?.dispatch_date || '-',
          action: isSelesai ? 'Keluar (Bon Barang)' : 'Dibawa Teknisi (Bon Barang)',
          note: di.dispatch?.site || di.dispatch?.location || di.dispatch?.notes || '-',
          technicianNames: techNames || '-',
          workType: workTypeLabels[wType] || wType || '-',
          qty: isSelesai ? qtyUsed : qtyDispatched,
          type: isSelesai ? 'out' : 'pending'
        })
      })
      
    combined.sort((a, b) => (a.date < b.date ? -1 : 1))

    setHistoryData(combined)
    setHistoryLoading(false)
  }

  const openAdd = () => {
    setEditItem(null)
    setForm({ item_name: '', unit: 'unit', item_type: 'other' })
    setIsModalOpen(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({ item_name: item.item_name, unit: item.unit, item_type: item.item_type })
    setIsModalOpen(true)
  }

  const handleSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault()
    const trimmedName = form.item_name ? form.item_name.trim() : ''
    if (!trimmedName) {
      toast.error('Nama item wajib diisi')
      return
    }
    const finalForm = { item_name: trimmedName, unit: form.unit, item_type: form.item_type }
    setSaving(true)
    try {
      if (editItem) {
        // Cek apakah ada item lain yang namanya sama (case-insensitive)
        const duplicate = items.find(
          i => i.id !== editItem.id && i.item_name?.trim().toLowerCase() === trimmedName.toLowerCase()
        )

        if (duplicate) {
          setMergeConfirm({
            sourceItem: editItem,
            targetItem: duplicate,
          })
          setSaving(false)
          return
        }

        const { error } = await supabase.from('warehouses').update({ ...finalForm, updated_at: new Date().toISOString() }).eq('id', editItem.id)
        if (error) throw error
        await logActivity({ userId: profile?.id, username: profile?.username, role, module: 'Daftar Material', action: 'Edit Item', detail: `Edit item: ${trimmedName}` })
        toast.success('Data item berhasil diperbarui')
      } else {
        const duplicate = items.find(
          i => i.item_name?.trim().toLowerCase() === trimmedName.toLowerCase()
        )
        if (duplicate) {
          toast.error(`Item "${duplicate.item_name}" sudah terdaftar di Daftar Material!`)
          setSaving(false)
          return
        }

        const { data: newWh, error } = await supabase.from('warehouses').insert({ ...finalForm, created_by: profile?.id || null }).select().single()
        if (error) throw error
        await logActivity({ userId: profile?.id, username: profile?.username, role, module: 'Daftar Material', action: 'Buat Item Baru', detail: `Buat item baru: ${trimmedName}` })
        toast.success('Item berhasil ditambahkan')
      }
      setIsModalOpen(false)
      fetchItems()
    } catch (err) {
      toast.error('Gagal menyimpan: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleExecuteMerge = async () => {
    if (!mergeConfirm) return
    const { sourceItem, targetItem } = mergeConfirm
    setSaving(true)
    try {
      // 1. Pindahkan expense_items
      await supabase.from('expense_items').update({ warehouse_item_id: targetItem.id }).eq('warehouse_item_id', sourceItem.id)

      // 2. Pindahkan dispatch_items
      await supabase.from('dispatch_items').update({ warehouse_item_id: targetItem.id }).eq('warehouse_item_id', sourceItem.id)

      // 3. Pindahkan inventory_log
      await supabase.from('inventory_log').update({ item_id: targetItem.id }).eq('item_id', sourceItem.id).eq('item_type', 'stok_gudang')

      // 4. Hapus sourceItem yang sudah digabung
      const { error: delErr } = await supabase.from('warehouses').delete().eq('id', sourceItem.id)
      if (delErr) throw delErr

      await logActivity({
        userId: profile.id,
        username: profile.username,
        role,
        module: 'Daftar Material',
        action: 'Gabung Item',
        detail: `Gabungkan ${sourceItem.item_name} ke ${targetItem.item_name}`
      })

      toast.success(`Berhasil menggabungkan "${sourceItem.item_name}" ke "${targetItem.item_name}"!`)
      setMergeConfirm(null)
      setIsModalOpen(false)
      fetchItems()
    } catch (err) {
      toast.error('Gagal menggabungkan: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Hapus item "${item.item_name}"?`)) return
    const { error } = await supabase.from('warehouses').delete().eq('id', item.id)
    if (!error) {
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Daftar Material', action: 'Hapus Item', detail: `Hapus: ${item.item_name}` })
      toast.success('Item dihapus')
      fetchItems()
    }
  }

  const getTypeBadge = (type) => {
    const map = { ont: 'badge-accent', dropcore_1c: 'badge-purple', dropcore_2c: 'badge-success', dropcore_4c: 'badge-orange', other: 'badge-muted' }
    const label = ITEM_TYPES.find(t => t.value === type)?.label || type
    return <span className={`badge ${map[type] || 'badge-muted'}`}>{label}</span>
  }

  const filtered = items.filter(i =>
    i.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (typeFilter === 'all' || i.item_type === typeFilter)
  )

  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const handleExportExcel = async () => {
    try {
      showProgress('Menyiapkan Export', 'Menginisialisasi file Excel...', 10)
      const { applyHeaderStyle, applyDataRowStyles, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      
      const ws1 = workbook.addWorksheet('Daftar Material')
      const headers1 = ['Nama Item', 'Tipe', 'Satuan']
      setColumnWidths(ws1, [30, 20, 12])
      applyHeaderStyle(ws1, headers1)
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        ws1.addRow([item.item_name, ITEM_TYPES.find(t => t.value === item.item_type)?.label || item.item_type, item.unit])
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses Daftar Material... (${i + 1}/${items.length})`, 10 + ((i + 1) / items.length) * 30)
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
      const workTypeLabels = { 'ikr_psb': 'IKR / PSB', 'mt': 'Maintenance', 'pt2': 'PT2 / PT3', 'maintenance': 'Maintenance', 'odc_odp': 'Instalasi ODC/ODP' }

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
      await downloadWorkbook(workbook, `Daftar Material ${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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
      const headers = ['Nama Item', 'Tipe', 'Satuan']
      setColumnWidths(ws, [30, 20, 14])
      applyHeaderStyle(ws, headers)
      ws.addRow(['ONT ZTE F670L', 'ont', 'unit'])
      ws.addRow(['Dropcore 1C Haspel A', 'dropcore_1c', 'haspel'])
      ws.addRow(['Dropcore 2C Haspel X', 'dropcore_2c', 'haspel'])
      ws.addRow(['Dropcore 4C Haspel B', 'dropcore_4c', 'haspel'])
      ws.addRow(['Kabel UTP CAT6', 'other', 'roll'])
      await downloadWorkbook(workbook, 'Template Import Daftar Material.xlsx')
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
        const VALID_TYPES = ['ont', 'dropcore_1c', 'dropcore_2c', 'dropcore_4c', 'other']
        showProgress('Memvalidasi Data', 'Mencocokkan kolom...', 20)
        const toInsert = data.map(row => {
          const rawType = (
            row['Tipe (ont/dropcore_1c/dropcore_2c/dropcore_4c/other)'] || 
            row['Tipe'] ||
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
      return { ...f, item_type: type, unit }
    })
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Daftar Material</h2>
          <p>Daftar master item material untuk pencatatan pengeluaran</p>
        </div>
        <div className="page-header-right">
          {can(role, 'inventory.stok.manage') && (
            <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Tambah Item</button>
          )}
        </div>
      </div>

      {/* Total Item Label */}
      <div style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
        <Package size={15} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
        Total: <strong>{items.length} item</strong> terdaftar
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
          <div className="filter-actions" style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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

        <div className="table-container" style={{ display: 'flex', flexDirection: 'column', minHeight: (!loading && filtered.length === 0) ? 'calc(100vh - 280px)' : 'auto' }}>
          {loading ? (
            <div className="flex-center" style={{ height: '180px' }}><div className="spinner" /></div>
          ) : filtered.length > 0 ? (
            <>
              <table className="desktop-only">
                <thead>
                  <tr>
                    <th>Nama Item</th>
                    <th>Tipe</th>
                    <th>Satuan</th>
                    {can(role, 'inventory.stok.manage') && <th style={{ textAlign: 'right' }}>Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(item => (
                    <tr key={item.id}>
                      <td className="font-semibold">{item.item_name}</td>
                      <td>{getTypeBadge(item.item_type)}</td>
                      <td className="text-secondary">{item.unit}</td>
                      {can(role, 'inventory.stok.manage') && (
                        <td style={{ textAlign: 'right' }}>
                          <div className="flex" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                            <button className="btn-icon" title="Riwayat" onClick={() => fetchHistory(item)}><History size={15} /></button>
                            {role === 'superadmin' && (
                              <button className="btn-icon" title="Edit" onClick={() => openEdit(item)}><Edit2 size={15} /></button>
                            )}
                            {role === 'superadmin' && (
                              <button className="btn-icon text-danger" title="Hapus" onClick={() => handleDelete(item)}><Trash2 size={15} /></button>
                            )}
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
                      <div style={{ textAlign: 'right', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {item.unit}
                      </div>
                    </div>
                    {expandedId === item.id && (
                      <div className="mobile-card-body">
                        {can(role, 'inventory.stok.manage') && (
                          <div className="mobile-card-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => fetchHistory(item)}><History size={14} /> Riwayat</button>
                            {role === 'superadmin' && (
                              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}><Edit2 size={14} /> Edit</button>
                            )}
                            {role === 'superadmin' && (
                              <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(item)}><Trash2 size={14} /> Hapus</button>
                            )}
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
            <div className="empty-state"><Package size={48} /><h3>Belum Ada Item</h3><p>Belum ada item tersimpan.</p></div>
          )}
        </div>
      </div>

      {/* Tambah/Edit Modal */}
      {isModalOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{editItem ? 'Edit Item' : 'Tambah Item'}</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Nama Item <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    className="form-input"
                    type="text"
                    value={form.item_name}
                    onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))}
                    placeholder="Contoh: PATCHCORD SC-SC BIRU 2M"
                    autoFocus
                    required
                  />
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Satuan</label>
                    <select className="form-input filter-select" style={{ height: 'auto', padding: '9px 12px' }} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipe Item</label>
                    <select className="form-input filter-select" style={{ height: 'auto', padding: '9px 12px' }} value={form.item_type} onChange={e => handleTypeChange(e.target.value)} disabled={!!editItem}>
                      {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {editItem && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>Tipe item tidak bisa diubah.</span>}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : (editItem ? 'Simpan Perubahan' : 'Tambah Item')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Konfirmasi Penggabungan (Merge) Item */}
      {mergeConfirm && createPortal(
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => !saving && setMergeConfirm(null)}>
          <div className="modal" style={{ maxWidth: '560px', width: '92%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitMerge size={20} style={{ color: 'var(--accent)' }} />
                Konfirmasi Gabungkan Item
              </h3>
              <button className="btn-icon" onClick={() => !saving && setMergeConfirm(null)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', padding: '12px 14px' }}>
                <AlertCircle size={20} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text-primary)' }}>
                  Item dengan nama <strong>"{mergeConfirm.targetItem.item_name}"</strong> sudah ada di database. Apakah Anda ingin menggabungkan item ini menjadi satu?
                </div>
              </div>

              {/* Komparasi Item Asal vs Item Tujuan */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '10px', alignItems: 'center' }}>
                {/* Asal */}
                <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Item Asal (Dihapus)</div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', wordBreak: 'break-word', marginBottom: '8px' }}>
                    {mergeConfirm.sourceItem.item_name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Satuan: <strong>{mergeConfirm.sourceItem.unit}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--accent)' }}>
                  <ArrowRight size={22} />
                </div>

                {/* Tujuan */}
                <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontWeight: 600 }}>Item Tujuan (Hasil)</div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', wordBreak: 'break-word', marginBottom: '8px' }}>
                    {mergeConfirm.targetItem.item_name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Satuan: <strong>{mergeConfirm.targetItem.unit}</strong>
                  </div>
                </div>
              </div>

              {/* Rincian Hasil Penggabungan */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={14} style={{ color: 'var(--success)' }} />
                  Hasil Penggabungan:
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  <li>
                    Seluruh riwayat pengeluaran teknisi dan bon barang dari item asal akan otomatis disatukan ke item tujuan.
                  </li>
                  <li>
                    Item <strong>"{mergeConfirm.sourceItem.item_name}"</strong> akan otomatis dihapus sehingga tidak ada duplikasi data.
                  </li>
                </ul>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setMergeConfirm(null)}
                disabled={saving}
              >
                Batal
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleExecuteMerge}
                disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {saving ? (
                  <>
                    <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                    Menggabungkan...
                  </>
                ) : (
                  <>
                    <GitMerge size={16} />
                    Ya, Gabungkan Item
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
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

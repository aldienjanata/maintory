import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, Hash, UploadCloud, CheckCircle, Clock, FileDown, Upload, Download, History } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import HistoryModal from '../../components/HistoryModal'
import { useProgress } from '../../contexts/ProgressContext'
import Pagination from '../../components/common/Pagination'

export default function SerialNumber() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const { showProgress, hideProgress } = useProgress()

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
  const [expandedId, setExpandedId] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ brand_id: '', brand_name: '', type_id: '', type_name: '', serial_number: '', date_in: format(new Date(), 'yyyy-MM-dd'), note: '', status: 'tersedia' })
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  
  const [historyItem, setHistoryItem] = useState(null)
  const [historyData, setHistoryData] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { setPage(1) }, [searchTerm, statusFilter, brandFilter])

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

  const fetchHistory = async (item) => {
    setHistoryItem(item)
    setIsHistoryOpen(true)
    setHistoryLoading(true)
    
    const { data: logs } = await supabase.from('inventory_log').select('*, user:users(full_name)').eq('item_type', 'sn').eq('item_id', item.id).order('log_date', { ascending: true })
    const { data: expItems } = await supabase.from('expense_items').select('*, expense:daily_expenses(expense_date, site, technicians, work_type)').eq('item_type', 'ont').eq('serial_number_id', item.id).order('created_at', { ascending: true })
    
    const { data: usersData } = await supabase.from('users').select('id, full_name')
    const usersMap = Object.fromEntries((usersData || []).map(u => [u.id, u.full_name]))

    const workTypeLabels = { 'ikr_psb': 'IKR / PSB', 'mt': 'Maintenance', 'pt2': 'PT2 / PT3', 'maintenance': 'Maintenance', 'odc_odp': 'Instalasi ODC/ODP' }

    const combined = [
      ...(logs || []).map(l => ({ 
        date: l.log_date, 
        action: l.action === 'masuk' ? 'Masuk' : 'Koreksi', 
        note: l.note || '', 
        user: l.user?.full_name, 
        qty: 1, 
        type: 'in' 
      })),
      ...(expItems || []).map(ei => ({ 
        date: ei.expense?.expense_date || '-', 
        action: 'Keluar', 
        note: `Lokasi: ${ei.expense?.site || '-'} | ${workTypeLabels[ei.expense?.work_type] || ei.expense?.work_type || '-'} | Teknisi: ${(ei.expense?.technicians || []).map(tid => usersMap[tid]).filter(Boolean).join(', ')}`, 
        qty: 1, 
        type: 'out' 
      }))
    ]
    combined.sort((a, b) => (a.date < b.date ? -1 : 1))
    
    setHistoryData(combined)
    setHistoryLoading(false)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({
      brand_id: item.brand_id || '',
      brand_name: item.brand?.brand_name || '',
      type_id: item.type_id || '',
      type_name: item.type?.type_name || '',
      serial_number: item.serial_number,
      date_in: item.date_in ? item.date_in.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
      note: item.note || '',
      status: item.status || 'tersedia'
    })
    if (item.brand_id) fetchTypes(item.brand_id)
    setIsBulkMode(false)
    setIsModalOpen(true)
  }

  const handleBrandInput = async (brandName) => {
    setForm(f => ({ ...f, brand_name: brandName, brand_id: '', type_id: '', type_name: '' }))
    setTypes([])
    const matched = brands.find(b => b.brand_name.toLowerCase() === brandName.toLowerCase())
    if (matched) {
      setForm(f => ({ ...f, brand_id: matched.id }))
      fetchTypes(matched.id)
    }
  }

  const handleTypeInput = (typeName) => {
    setForm(f => ({ ...f, type_name: typeName, type_id: '' }))
    const matched = types.find(t => t.type_name.toLowerCase() === typeName.toLowerCase())
    if (matched) setForm(f => ({ ...f, type_id: matched.id }))
  }

  const handleSaveSingle = async () => {
    if (!form.serial_number) { toast.error('Serial Number wajib diisi'); return }
    setSaving(true)
    try {
      let brandId = form.brand_id || null
      let typeId = form.type_id || null

      if (form.brand_name && !brandId) {
        const { data: newBrand, error } = await supabase.from('ont_brands').insert([{ brand_name: form.brand_name.trim() }]).select().single()
        if (error && error.code !== '23505') throw error
        if (newBrand) brandId = newBrand.id
        else {
          const { data: ex } = await supabase.from('ont_brands').select('id').ilike('brand_name', form.brand_name.trim()).single()
          if (ex) brandId = ex.id
        }
      }

      if (form.type_name && !typeId && brandId) {
        const { data: newType, error } = await supabase.from('ont_types').insert([{ type_name: form.type_name.trim(), brand_id: brandId }]).select().single()
        if (error && error.code !== '23505') throw error
        if (newType) typeId = newType.id
        else {
          const { data: ex } = await supabase.from('ont_types').select('id').ilike('type_name', form.type_name.trim()).eq('brand_id', brandId).single()
          if (ex) typeId = ex.id
        }
      }

      if (editItem) {
        const { error } = await supabase.from('serial_numbers').update({
          brand_id: brandId,
          type_id: typeId,
          serial_number: form.serial_number,
          date_in: form.date_in,
          note: form.note,
          status: form.status,
          updated_at: new Date().toISOString()
        }).eq('id', editItem.id)
        if (error) throw error
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Serial Number', action: 'Edit SN', detail: `SN: ${form.serial_number}` })
        toast.success('Serial Number berhasil diperbarui')
      } else {
        const { data: newSn, error } = await supabase.from('serial_numbers').insert({
          brand_id: brandId,
          type_id: typeId,
          serial_number: form.serial_number,
          date_in: form.date_in,
          note: form.note,
          status: 'tersedia',
          created_by: profile.id
        }).select().single()
        if (error) throw error
        await supabase.from('inventory_log').insert({ log_date: form.date_in, item_type: 'sn', item_id: newSn.id, action: 'masuk', quantity: 1, note: form.note || null, created_by: profile.id })
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Serial Number', action: 'Tambah SN', detail: `SN: ${form.serial_number}` })
        toast.success('Serial Number berhasil ditambahkan')
      }
      setIsModalOpen(false)
      fetchAll()
    } catch (err) {
      toast.error(err.code === '23505' ? 'Serial Number sudah ada!' : 'Gagal: ' + err.message)
    } finally { setSaving(false) }
  }

  const handleSaveBulk = async () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) { toast.error('Masukkan minimal 1 serial number'); return }
    if (!form.brand_name && !form.brand_id) { toast.error('Pilih atau ketik merk terlebih dahulu'); return }
    setSaving(true)
    try {
      let brandId = form.brand_id || null
      let typeId = form.type_id || null
      if (form.brand_name && !brandId) {
        const { data: newBrand, error } = await supabase.from('ont_brands').insert([{ brand_name: form.brand_name.trim() }]).select().single()
        if (error && error.code !== '23505') throw error
        if (newBrand) brandId = newBrand.id
        else {
          const { data: ex } = await supabase.from('ont_brands').select('id').ilike('brand_name', form.brand_name.trim()).single()
          if (ex) brandId = ex.id
        }
      }
      if (form.type_name && !typeId && brandId) {
        const { data: newType, error } = await supabase.from('ont_types').insert([{ type_name: form.type_name.trim(), brand_id: brandId }]).select().single()
        if (error && error.code !== '23505') throw error
        if (newType) typeId = newType.id
        else {
          const { data: ex } = await supabase.from('ont_types').select('id').ilike('type_name', form.type_name.trim()).eq('brand_id', brandId).single()
          if (ex) typeId = ex.id
        }
      }
      const inserts = lines.map(sn => ({ brand_id: brandId, type_id: typeId, serial_number: sn, date_in: form.date_in, status: 'tersedia', created_by: profile.id }))
      const { data: insertedSns, error } = await supabase.from('serial_numbers').insert(inserts).select()
      if (error) throw error
      await supabase.from('inventory_log').insert(insertedSns.map(sn => ({ log_date: form.date_in, item_type: 'sn', item_id: sn.id, action: 'masuk', quantity: 1, note: 'Input massal via text', created_by: profile.id })))
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

  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const statsData = {
    total: items.length,
    tersedia: items.filter(i => i.status === 'tersedia').length,
    terpakai: items.filter(i => i.status === 'terpakai').length,
  }

  const handleExportExcel = async () => {
    try {
      showProgress('Menyiapkan Export', 'Menginisialisasi file Excel...', 10)
      const { applyHeaderStyle, applyDataRowStyles, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      
      const ws1 = workbook.addWorksheet('Stok Serial Number')
      applyHeaderStyle(ws1, ['Serial Number', 'Merk', 'Tipe', 'Tanggal Masuk', 'Status', 'Catatan'])
      setColumnWidths(ws1, [24, 18, 18, 16, 14, 30])
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        ws1.addRow([item.serial_number, item.brand?.brand_name || '-', item.type?.type_name || '-', item.date_in, item.status === 'terpakai' ? 'Terpakai' : 'Tersedia', item.note || ''])
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses Serial Number... (${i + 1}/${items.length})`, 10 + ((i + 1) / items.length) * 30)
          await new Promise(r => setTimeout(r, 0))
        }
      }
      applyDataRowStyles(ws1)

      const ws2 = workbook.addWorksheet('Riwayat Penggunaan')
      const headers2 = ['Serial Number', 'Merk', 'Tipe', 'Tanggal', 'Jenis', 'Pekerjaan', 'Teknisi', 'Lokasi/Note']
      setColumnWidths(ws2, [24, 18, 18, 16, 12, 16, 24, 30])
      applyHeaderStyle(ws2, headers2, '065F46')
      
      showProgress('Mengambil Data', 'Mengambil riwayat dari database...', 40)
      const { data: allExpItems } = await supabase
        .from('expense_items')
        .select('*, expense:daily_expenses(expense_date, site, technicians, work_type)')
        .eq('item_type', 'ont')
        .order('created_at', { ascending: true })
      const { data: allLogs } = await supabase
        .from('inventory_log')
        .select('*, sn:serial_numbers(serial_number, brand:ont_brands(brand_name), type:ont_types(type_name))')
        .eq('item_type', 'sn')
        .order('log_date', { ascending: true })
      const { data: usersData } = await supabase.from('users').select('id, full_name')
      
      const snLookup = Object.fromEntries(items.map(i => [i.id, i]))
      const usersMap = Object.fromEntries((usersData || []).map(u => [u.id, u.full_name]))
      const workTypeLabels = { 'ikr_psb': 'IKR / PSB', 'mt': 'Maintenance', 'pt2': 'PT2 / PT3', 'maintenance': 'Maintenance', 'odc_odp': 'Instalasi ODC/ODP', 'maintenance': 'Maintenance', 'odc_odp': 'Instalasi ODC/ODP' }

      const rows2 = []
      ;(allLogs || []).forEach(l => {
        const snInfo = snLookup[l.item_id]
        rows2.push({ 
          sn: snInfo?.serial_number || l.sn?.serial_number || '-', 
          brand: snInfo?.brand?.brand_name || l.sn?.brand?.brand_name || '-', 
          type: snInfo?.type?.type_name || l.sn?.type?.type_name || '-', 
          date: l.log_date, 
          action: l.action === 'masuk' ? 'Masuk' : 'Koreksi', 
          work: '-', tech: '-', 
          note: l.note || '' 
        })
      })
      ;(allExpItems || []).forEach(ei => {
        const snInfo = snLookup[ei.serial_number_id]
        const techNames = (ei.expense?.technicians || []).map(tid => usersMap[tid]).filter(Boolean).join(', ')
        const wType = ei.expense?.work_type
        rows2.push({ 
          sn: snInfo?.serial_number || '-', 
          brand: snInfo?.brand?.brand_name || '-', 
          type: snInfo?.type?.type_name || '-', 
          date: ei.expense?.expense_date || '-', 
          action: 'Keluar', 
          work: workTypeLabels[wType] || wType || '-', 
          tech: techNames || '-', 
          note: `Lokasi: ${ei.expense?.site || '-'}` 
        })
      })
      rows2.sort((a,b) => a.date < b.date ? -1 : 1)
      for (let i = 0; i < rows2.length; i++) {
        const r = rows2[i]
        ws2.addRow([r.sn, r.brand, r.type, r.date, r.action, r.work, r.tech, r.note])
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses Riwayat... (${i + 1}/${rows2.length})`, 50 + ((i + 1) / rows2.length) * 40)
          await new Promise(res => setTimeout(res, 0))
        }
      }
      applyDataRowStyles(ws2)

      showProgress('Menyelesaikan Export', 'Mengunduh file Excel...', 95)
      await downloadWorkbook(workbook, `Serial Number ${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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
      applyHeaderStyle(ws, ['Serial Number', 'Merk', 'Tipe', 'Tanggal Masuk (yyyy-mm-dd)', 'Note'])
      setColumnWidths(ws, [24, 18, 18, 26, 30])
      ws.addRow(['ZTE123456', 'ZTE', 'F670L', '2026-01-01', 'Baru'])
      ws.addRow(['HUAWEI789', 'Huawei', 'HG8245H5', '2026-01-01', ''])
      await downloadWorkbook(workbook, 'Template Import Serial Number.xlsx')
    } catch(err) {
      toast.error('Gagal download template')
    }
  }

  const handleImportExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setSaving(true)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        showProgress('Membaca File', 'Menganalisis isi Excel...', 10)
        const { read, utils } = await import('xlsx')
        const wb = read(evt.target.result, { type: 'binary' })
        const data = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
        if (!data.length) throw new Error('File kosong')
        
        showProgress('Memproses Brand & Tipe', 'Sinkronisasi data merk ONT...', 20)
        const uniqueBrands = [...new Set(data.map(r => String(r['Merk'] || '').trim()).filter(Boolean))]
        const brandMap = Object.fromEntries(brands.map(b => [b.brand_name.toLowerCase(), b.id]))
        for (const bName of uniqueBrands) {
          if (!brandMap[bName.toLowerCase()]) {
            const { data: newBrand } = await supabase.from('ont_brands').insert([{ brand_name: bName }]).select().single()
            if (newBrand) brandMap[bName.toLowerCase()] = newBrand.id
          }
        }

        const { data: allTypes } = await supabase.from('ont_types').select('id, brand_id, type_name')
        const typeMap = Object.fromEntries((allTypes || []).map(t => [`${t.brand_id}_${t.type_name.toLowerCase()}`, t.id]))
        
        showProgress('Memvalidasi Data', 'Mencocokkan serial number...', 35)
        const toInsert = data.map(row => {
          const sn = String(row['Serial Number'] || '').trim()
          if (!sn) return null
          const bId = brandMap[String(row['Merk'] || '').trim().toLowerCase()]
          const tName = String(row['Tipe'] || '').trim()
          let tId = null
          if (bId && tName) {
            const key = `${bId}_${tName.toLowerCase()}`
            tId = typeMap[key]
          }
          return { serial_number: sn, date_in: row['Tanggal Masuk (yyyy-mm-dd)'] || format(new Date(), 'yyyy-MM-dd'), status: 'tersedia', note: String(row['Note'] || '').trim(), brand_id: bId || null, type_id: tId, created_by: profile.id }
        }).filter(Boolean)
        
        let inserted = 0
        const batchSize = 50
        for (let i = 0; i < toInsert.length; i += batchSize) {
          const batch = toInsert.slice(i, i + batchSize)
          await supabase.from('serial_numbers').insert(batch)
          inserted += batch.length
          showProgress('Menyimpan ke Database', `Menyimpan ${inserted} dari ${toInsert.length} SN...`, 35 + (inserted / toInsert.length) * 65)
        }
        toast.success('Import berhasil')
        fetchAll()
      } catch (err) {
        toast.error('Gagal import: ' + err.message)
      } finally { setSaving(false); hideProgress() }
    }
    reader.readAsBinaryString(file)
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Serial Number ONT</h2>
          <p>Kelola stok ONT berdasarkan serial number</p>
        </div>
        <div className="page-header-right">
          {can(role, 'inventory.sn.add') && (
            <button className="btn btn-primary" onClick={() => { setIsModalOpen(true); setIsBulkMode(false); setEditItem(null); setForm({ brand_id: '', brand_name: '', type_id: '', type_name: '', serial_number: '', date_in: format(new Date(), 'yyyy-MM-dd'), note: '', status: 'tersedia' }); setTypes([]) }}>
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
            {can(role, 'inventory.sn.import') && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}><FileDown size={14} /> Template</button>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginBottom: 0 }}>
                  <Upload size={14} /> Import
                  <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportExcel} />
                </label>
              </>
            )}
            {can(role, 'inventory.sn.export') && (
              <button className="btn btn-secondary btn-sm" onClick={handleExportExcel}><Download size={14} /> Export</button>
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
                    <th>Serial Number</th>
                    <th>Merk</th>
                    <th>Tipe</th>
                    <th>Tanggal Masuk</th>
                    <th>Status</th>
                    <th>Note</th>
                    {(can(role, 'inventory.sn.edit') || can(role, 'inventory.sn.delete')) && <th style={{ textAlign: 'right' }}>Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(item => (
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
                      {(can(role, 'inventory.sn.edit') || can(role, 'inventory.sn.delete')) && (
                        <td style={{ textAlign: 'right' }}>
                          <div className="flex" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                            <button className="btn-icon" title="Riwayat" onClick={() => fetchHistory(item)}><History size={15} /></button>
                            {can(role, 'inventory.sn.edit') && (
                              <button className="btn-icon" onClick={() => openEdit(item)}><Edit2 size={15} /></button>
                            )}
                            {can(role, 'inventory.sn.delete') && (
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
                {paginated.map(item => (
                  <div key={item.id} className="mobile-card">
                    <div className="mobile-card-header" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                      <div>
                        <div className="mobile-card-title" style={{ fontFamily: 'monospace' }}>{item.serial_number}</div>
                        <div className="mobile-card-subtitle">{item.brand?.brand_name || '-'} {item.type?.type_name || '-'}</div>
                      </div>
                      <div>
                        {item.status === 'tersedia'
                          ? <span className="badge badge-success"><CheckCircle size={10} /> Tersedia</span>
                          : <span className="badge badge-warning"><Clock size={10} /> Terpakai</span>
                        }
                      </div>
                    </div>
                    {expandedId === item.id && (
                      <div className="mobile-card-body">
                        <div className="mobile-info-row"><span className="mobile-info-label">Tanggal Masuk</span><span className="mobile-info-value">{item.date_in ? format(new Date(item.date_in), 'dd MMM yyyy', { locale: id }) : '-'}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Note</span><span className="mobile-info-value">{item.note || '-'}</span></div>
                        {(can(role, 'inventory.sn.edit') || can(role, 'inventory.sn.delete')) && (
                          <div className="mobile-card-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => fetchHistory(item)}><History size={14} /> Riwayat</button>
                            {can(role, 'inventory.sn.edit') && (
                              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}><Edit2 size={14} /> Edit</button>
                            )}
                            {can(role, 'inventory.sn.delete') && (
                              <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(item)}><Trash2 size={14} /> Hapus</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Pagination 
                page={page} 
                setPage={setPage} 
                perPage={perPage} 
                setPerPage={setPerPage} 
                totalItems={filtered.length} 
              />
            </>
          ) : (
            <div className="empty-state"><Hash size={48} /><h3>Tidak Ada SN</h3><p>Belum ada serial number tersimpan.</p></div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{editItem ? 'Edit Serial Number' : 'Tambah Serial Number'}</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {!editItem && (
                <div className="tabs" style={{ marginBottom: 0 }}>
                  <button className={`tab-item ${!isBulkMode ? 'active' : ''}`} onClick={() => setIsBulkMode(false)}>Input Satu</button>
                  <button className={`tab-item ${isBulkMode ? 'active' : ''}`} onClick={() => setIsBulkMode(true)}><UploadCloud size={14} /> Input Massal</button>
                </div>
              )}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Merk ONT</label>
                  <input className="form-input" list="brand-list" placeholder="Pilih atau ketik merk..." value={form.brand_name} onChange={e => handleBrandInput(e.target.value)} autoComplete="off" />
                  <datalist id="brand-list">{brands.map(b => <option key={b.id} value={b.brand_name} />)}</datalist>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipe</label>
                  <input className="form-input" list="type-list" placeholder="Pilih atau ketik tipe..." value={form.type_name} onChange={e => handleTypeInput(e.target.value)} autoComplete="off" />
                  <datalist id="type-list">{types.map(t => <option key={t.id} value={t.type_name} />)}</datalist>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal Masuk</label>
                <input type="date" className="form-input" value={form.date_in} onChange={e => setForm(f => ({ ...f, date_in: e.target.value }))} disabled={role !== 'superadmin'} />
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
                  {editItem && (
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select className="form-input" style={{ height: 'auto' }} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                        <option value="tersedia">Tersedia</option>
                        <option value="terpakai">Terpakai</option>
                      </select>
                    </div>
                  )}
                </>
              ) : (
                <div className="form-group">
                  <label className="form-label">Daftar Serial Number (satu per baris)</label>
                  <textarea className="form-input" rows={8} placeholder={"ZXHN12345\nZXHN67890"} value={bulkText} onChange={e => setBulkText(e.target.value)} style={{ fontFamily: 'monospace', resize: 'vertical' }} />
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
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        item={historyItem}
        data={historyData}
        loading={historyLoading}
        title={`Riwayat Serial Number: ${historyItem?.serial_number}`}
        unit="unit"
      />
    </div>
  )
}


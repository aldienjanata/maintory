import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, Cable, AlertTriangle, Download, History } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { useProgress } from '../../contexts/ProgressContext'
import Pagination from '../../components/common/Pagination'
import HistoryModal from '../../components/HistoryModal'

export default function Dropcore() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const { showProgress, hideProgress } = useProgress()

  const [haspels, setHaspels] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ haspel_code: '', type: '1c', initial_meters: 1000, used_meters: 0, date_in: format(new Date(), 'yyyy-MM-dd'), note: '' })
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  // History modal states
  const [historyItem, setHistoryItem] = useState(null)
  const [historyData, setHistoryData] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { fetchHaspels() }, [])
  useEffect(() => { setPage(1) }, [searchTerm, typeFilter, statusFilter])

  const fetchHaspels = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('dropcore_haspels').select('*').order('date_in', { ascending: false })
    if (!error) setHaspels(data || [])
    setLoading(false)
  }

  const generateNextCode = (typeToGenerate, currentHaspels = haspels) => {
    const typePrefix = typeToGenerate === '1c' ? 'H1C-' : 'H4C-'
    const existingNums = currentHaspels
      .filter(h => h.haspel_code && h.haspel_code.toUpperCase().startsWith(typePrefix))
      .map(h => {
        const numStr = h.haspel_code.substring(typePrefix.length)
        return parseInt(numStr, 10)
      })
      .filter(n => !isNaN(n))
    
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1
    return `${typePrefix}${String(nextNum).padStart(3, '0')}`
  }

  const openAdd = () => {
    setEditItem(null)
    setForm({ haspel_code: generateNextCode('1c'), type: '1c', initial_meters: 1000, used_meters: 0, date_in: format(new Date(), 'yyyy-MM-dd'), note: '' })
    setIsModalOpen(true)
  }

  const openEdit = (h) => {
    setEditItem(h)
    setForm({ haspel_code: h.haspel_code, type: h.type, initial_meters: h.initial_meters, used_meters: h.used_meters, date_in: h.date_in, note: h.note || '' })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.haspel_code) { toast.error('Kode Haspel wajib diisi'); return }
    if (Number(form.used_meters) > Number(form.initial_meters)) { toast.error('Meter terpakai tidak boleh melebihi meter awal'); return }
    setSaving(true)
    const remaining = Number(form.initial_meters) - Number(form.used_meters)
    const status = remaining <= 0 ? 'habis' : 'tersedia'
    try {
      if (editItem) {
        const { error } = await supabase.from('dropcore_haspels').update({ ...form, status, updated_at: new Date().toISOString() }).eq('id', editItem.id)
        if (error) throw error
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dropcore', action: 'Edit Haspel', detail: `Haspel: ${form.haspel_code}` })
        toast.success('Haspel berhasil diperbarui')
      } else {
        const existing = haspels.find(h => h.haspel_code.toLowerCase() === form.haspel_code.toLowerCase())
        let finalHaspelId = null

        if (existing) {
          if (existing.status === 'tersedia') {
            toast.error('Kode haspel masih tersedia dan memiliki sisa. Gunakan kode lain atau habiskan dulu yang ini.')
            setSaving(false)
            return
          }
          // Reuse existing 'habis' haspel
          const { error } = await supabase.from('dropcore_haspels').update({ ...form, status, updated_at: new Date().toISOString(), created_by: profile.id }).eq('id', existing.id)
          if (error) throw error
          finalHaspelId = existing.id
          await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dropcore', action: 'Tambah Haspel (Re-use)', detail: `Haspel: ${form.haspel_code}` })
          toast.success('Kode haspel dipakai ulang untuk stok baru!')
        } else {
          // Insert new
          const { data: insertedData, error } = await supabase.from('dropcore_haspels').insert({ ...form, status, created_by: profile.id }).select().single()
          if (error) throw error
          finalHaspelId = insertedData.id
          await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dropcore', action: 'Tambah Haspel', detail: `Haspel: ${form.haspel_code}` })
          toast.success('Haspel berhasil ditambahkan')
        }

        // Add to inventory_log
        await supabase.from('inventory_log').insert({
          log_date: form.date_in,
          item_type: 'dropcore',
          item_id: finalHaspelId,
          action: 'masuk',
          meters: Number(form.initial_meters),
          note: form.note || null,
          created_by: profile.id
        })
      }
      setIsModalOpen(false)
      fetchHaspels()
    } catch (err) {
      toast.error('Gagal menyimpan: ' + err.message)
    } finally { setSaving(false) }
  }

  const handleDelete = (h) => {
    setConfirmDelete(h)
  }

  const doDelete = async () => {
    const h = confirmDelete
    setConfirmDelete(null)
    if (!h) return
    try {
      // Cek apakah haspel masih dipakai di Bon Barang
      const { data: refs, error: refErr } = await supabase
        .from('dispatch_items')
        .select('id, dispatch:dispatches(dispatch_date, site, status)')
        .eq('haspel_id', h.id)
      if (refErr) throw refErr

      if (refs && refs.length > 0) {
        const bonList = refs
          .filter(r => r.dispatch)
          .map(r => {
            const tgl = r.dispatch.dispatch_date
            const site = r.dispatch.site || '-'
            const status = r.dispatch.status === 'sedang_dibawa' ? 'Sedang Dibawa' : 'Selesai'
            return `• ${tgl} (${site}) – ${status}`
          })
          .join('\n')
        const msg = `Haspel ${h.haspel_code} masih tercatat di Bon Barang:\n${bonList || refs.length + ' bon'}`
        toast.error(msg, { duration: 8000, style: { whiteSpace: 'pre-line' } })
        return
      }

      const { error } = await supabase.from('dropcore_haspels').delete().eq('id', h.id)
      if (error) throw error
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dropcore', action: 'Hapus Haspel', detail: h.haspel_code })
      toast.success(`Haspel ${h.haspel_code} berhasil dihapus`)
      fetchHaspels()
    } catch (err) {
      toast.error('Gagal menghapus: ' + err.message)
    }
  }

  const fetchHistory = async (haspel) => {
    setHistoryItem(haspel)
    setIsHistoryOpen(true)
    setHistoryLoading(true)

    const { data: logs } = await supabase
      .from('inventory_log')
      .select('*, user:users(full_name)')
      .eq('item_type', 'dropcore')
      .eq('item_id', haspel.id)
      .order('log_date', { ascending: true })

    const { data: expItems } = await supabase
      .from('expense_items')
      .select('*, expense:daily_expenses(expense_date, site, technicians, work_type)')
      .eq('item_type', 'dropcore')
      .eq('haspel_id', haspel.id)
      .order('created_at', { ascending: true })

    // Fetch all users to map technician IDs
    const { data: usersData } = await supabase.from('users').select('id, full_name')
    const usersMap = {}
    ;(usersData || []).forEach(u => usersMap[u.id] = u.full_name)

    const workTypeLabels = {
      'ikr_psb': 'IKR / PSB',
      'mt': 'Maintenance',
      'pt2': 'PT2 / PT3',
      'maintenance': 'Maintenance',
      'odc_odp': 'Instalasi ODC/ODP'
    }

    const inRows = (logs || []).map(l => ({
      date: l.log_date,
      action: l.action === 'masuk' ? 'Masuk' : 'Koreksi',
      qty: l.meters,
      note: l.note,
      user: l.user?.full_name,
      type: 'in'
    }))

    const outRows = (expItems || []).map(ei => {
      const techNames = (ei.expense?.technicians || []).map(tid => usersMap[tid]).filter(Boolean).join(', ')
      const wType = ei.expense?.work_type
      return {
        date: ei.expense?.expense_date,
        action: 'Keluar',
        qty: ei.meters_used,
        note: ei.expense?.site,
        technicianNames: techNames,
        workType: workTypeLabels[wType] || wType,
        type: 'out'
      }
    })

    const combined = [...inRows, ...outRows].sort((a, b) => (a.date < b.date ? -1 : 1))
    setHistoryData(combined)
    setHistoryLoading(false)
  }

  const filtered = haspels.filter(h => {
    const matchSearch = h.haspel_code?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchType = typeFilter === 'all' || h.type === typeFilter
    const matchStatus = statusFilter === 'all' || h.status === statusFilter
    return matchSearch && matchType && matchStatus
  })

  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  const totalMeter = haspels.reduce((s, h) => s + Number(h.initial_meters || 0), 0)
  const usedMeter = haspels.reduce((s, h) => s + Number(h.used_meters || 0), 0)
  const remainingMeter = totalMeter - usedMeter

  const pct = (h) => {
    const used = Number(h.used_meters)
    const total = Number(h.initial_meters)
    if (!total) return 0
    return Math.round((used / total) * 100)
  }

  const handleExportExcel = async () => {
    try {
      showProgress('Menyiapkan Export', 'Menginisialisasi file Excel...', 10)
      const { applyHeaderStyle, applyDataRowStyles, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Maintory'
      workbook.created = new Date()

      // Sheet 1: Stok Haspel
      const ws1 = workbook.addWorksheet('Stok Haspel')
      const headers1 = ['Kode Haspel', 'Tipe', 'Tanggal Masuk', 'Meter Awal', 'Meter Terpakai', 'Sisa Meter', 'Status', 'Catatan']
      setColumnWidths(ws1, [16, 14, 16, 14, 16, 14, 12, 28])
      applyHeaderStyle(ws1, headers1)
      for (let i = 0; i < haspels.length; i++) {
        const h = haspels[i]
        ws1.addRow([
          h.haspel_code,
          h.type === '1c' ? 'Dropcore 1C' : 'Dropcore 4C',
          h.date_in,
          Number(h.initial_meters),
          Number(h.used_meters),
          Number(h.initial_meters) - Number(h.used_meters),
          h.status === 'habis' ? 'Habis' : 'Tersedia',
          h.note || ''
        ])
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses Stok Haspel... (${i + 1}/${haspels.length})`, 10 + ((i + 1) / haspels.length) * 40)
          await new Promise(r => setTimeout(r, 0))
        }
      }
      applyDataRowStyles(ws1)

      // Sheet 2: Riwayat Transaksi
      const ws2 = workbook.addWorksheet('Riwayat Transaksi')
      const headers2 = ['Kode Haspel', 'Tipe', 'Tanggal', 'Jenis', 'Pekerjaan', 'Teknisi', 'Stok Awal', 'Masuk', 'Keluar', 'Sisa Stok', 'Lokasi/Note']
      setColumnWidths(ws2, [16, 14, 16, 12, 16, 24, 12, 12, 12, 12, 28])
      applyHeaderStyle(ws2, headers2, '065F46')

      // Fetch all transactions
      const { data: allExpItems } = await supabase.from('expense_items').select('*, haspel:dropcore_haspels(haspel_code, type), expense:daily_expenses(expense_date, site, technicians, work_type)').eq('item_type', 'dropcore').order('created_at', { ascending: true })
      const { data: allLogs } = await supabase.from('inventory_log').select('*, user:users(full_name)').eq('item_type', 'dropcore').order('created_at', { ascending: true })
      const { data: usersData } = await supabase.from('users').select('id, full_name')
      
      const usersMap = Object.fromEntries((usersData || []).map(u => [u.id, u.full_name]))
      const workTypeLabels = { 'ikr_psb': 'IKR / PSB', 'mt': 'Maintenance', 'pt2': 'PT2 / PT3', 'maintenance': 'Maintenance', 'odc_odp': 'Instalasi ODC/ODP' }
      const haspelMap = Object.fromEntries(haspels.map(h => [h.id, h]))

      const transactionsByHaspelId = {}

      ;(allLogs || []).forEach(l => {
        const hId = l.item_id
        if (!hId) return
        if (!transactionsByHaspelId[hId]) transactionsByHaspelId[hId] = []
        
        const haspelCode = haspelMap[hId]?.haspel_code || '-'
        const haspelType = haspelMap[hId]?.type === '1c' ? 'Dropcore 1C' : 'Dropcore 4C'

        transactionsByHaspelId[hId].push({
          date: l.log_date,
          created_at: l.created_at,
          code: haspelCode,
          type: haspelType,
          jenis: l.action === 'masuk' ? 'Masuk' : 'Koreksi',
          work: '-',
          tech: l.user?.full_name || '-',
          stok_awal: 0,
          keluar: 0,
          masuk: Number(l.meters || l.quantity || 0),
          stok_akhir: 0,
          note: l.note || ''
        })
      })

      ;(allExpItems || []).forEach(ei => {
        const hId = ei.haspel_id
        if (!hId) return
        if (!transactionsByHaspelId[hId]) transactionsByHaspelId[hId] = []

        const haspelCode = ei.haspel?.haspel_code || haspelMap[hId]?.haspel_code || '-'
        const haspelType = (ei.haspel?.type || haspelMap[hId]?.type) === '1c' ? 'Dropcore 1C' : 'Dropcore 4C'
        const techNames = (ei.expense?.technicians || []).map(tid => usersMap[tid]).filter(Boolean).join(', ')
        const wType = ei.expense?.work_type

        transactionsByHaspelId[hId].push({
          date: ei.expense?.expense_date || '-',
          created_at: ei.created_at,
          code: haspelCode,
          type: haspelType,
          jenis: 'Keluar',
          work: workTypeLabels[wType] || wType || '-',
          tech: techNames || '-',
          stok_awal: 0,
          keluar: Number(ei.meters_used || 0),
          masuk: 0,
          stok_akhir: 0,
          note: `Lokasi: ${ei.expense?.site || '-'}`
        })
      })

      const rows2 = []
      
      // Calculate running balance per haspel
      Object.keys(transactionsByHaspelId).forEach(hId => {
        const txs = transactionsByHaspelId[hId]
        txs.sort((a, b) => {
          if (a.date !== b.date) return a.date < b.date ? -1 : 1
          return new Date(a.created_at) - new Date(b.created_at)
        })

        let currentStock = 0
        txs.forEach(tx => {
          tx.stok_awal = currentStock
          if (tx.jenis === 'Masuk' || tx.jenis === 'Koreksi') {
            currentStock += tx.masuk
          } else if (tx.jenis === 'Keluar') {
            currentStock -= tx.keluar
          }
          tx.stok_akhir = currentStock
          rows2.push(tx)
        })
      })

      // Sort all combined rows by date for the final excel sheet
      rows2.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1
        return new Date(a.created_at) - new Date(b.created_at)
      })
      
      for (let i = 0; i < rows2.length; i++) {
        const r = rows2[i]
        ws2.addRow([r.code, r.type, r.date, r.jenis, r.work, r.tech, r.stok_awal, r.masuk || '-', r.keluar || '-', r.stok_akhir, r.note])
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses Riwayat Transaksi... (${i + 1}/${rows2.length})`, 50 + ((i + 1) / rows2.length) * 40)
          await new Promise(res => setTimeout(res, 0))
        }
      }
      applyDataRowStyles(ws2)

      showProgress('Menyelesaikan Export', 'Mengunduh file Excel...', 95)
      await downloadWorkbook(workbook, `Dropcore ${new Date().toISOString().slice(0, 10)}.xlsx`)
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
          <h2>Dropcore Haspel</h2>
          <p>Kelola inventaris kabel dropcore berdasarkan haspel</p>
        </div>
        <div className="page-header-right">
          {can(role, 'inventory.dropcore.export') && (
            <button className="btn btn-secondary" onClick={handleExportExcel}><Download size={16} /> Export</button>
          )}
          {can(role, 'inventory.dropcore.add') && (
            <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Tambah Haspel</button>
          )}
        </div>
      </div>

      <div className="stats-grid mb-4">
        {[
          { key: 'total', label: 'Total Haspel Utuh', value: haspels.filter(h => (Number(h.initial_meters || 0) - Number(h.used_meters || 0)) === 1000).length, color: 'var(--accent)' },
          { key: 'meters', label: 'Meter Tersisa', value: `${remainingMeter.toLocaleString()} m`, color: 'var(--success)' },
          { key: 'used', label: 'Meter Terpakai', value: `${usedMeter.toLocaleString()} m`, color: 'var(--warning)' },
          { key: 'habis', label: 'Haspel Habis', value: haspels.filter(h => h.status === 'habis').length, color: 'var(--danger)' },
          { 
            key: '1c', 
            label: 'Haspel 1C Utuh', 
            value: (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{haspels.filter(h => h.type === '1c' && (Number(h.initial_meters || 0) - Number(h.used_meters || 0)) === 1000).length}</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {haspels.filter(h => h.type === '1c').reduce((s, h) => s + Number(h.initial_meters || 0) - Number(h.used_meters || 0), 0).toLocaleString()} m tersisa
                </span>
              </div>
            ), 
            color: 'var(--purple)' 
          },
          { 
            key: '4c', 
            label: 'Haspel 4C Utuh', 
            value: (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{haspels.filter(h => h.type === '4c' && (Number(h.initial_meters || 0) - Number(h.used_meters || 0)) === 1000).length}</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {haspels.filter(h => h.type === '4c').reduce((s, h) => s + Number(h.initial_meters || 0) - Number(h.used_meters || 0), 0).toLocaleString()} m tersisa
                </span>
              </div>
            ), 
            color: 'var(--orange)' 
          },
        ].map(s => (
          <div key={s.key} className="stat-card">
            <div className="stat-card-header">
              <div className="stat-card-icon" style={{ background: `${s.color}20` }}>
                <Cable size={20} style={{ color: s.color }} />
              </div>
            </div>
            <div className="stat-card-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="search-box" style={{ maxWidth: '180px' }}>
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Cari kode..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">Semua Tipe</option>
            <option value="1c">1C</option>
            <option value="4c">4C</option>
          </select>
          <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Semua Status</option>
            <option value="tersedia">Tersedia</option>
            <option value="habis">Habis</option>
          </select>
        </div>

        <div className="table-container">
          {loading ? (
            <div className="flex-center" style={{ height: '180px' }}><div className="spinner" /></div>
          ) : filtered.length > 0 ? (
            <>
              <table className="desktop-only">
                <thead>
                  <tr>
                    <th>Kode Haspel</th>
                    <th>Tipe</th>
                    <th>Tanggal Masuk</th>
                    <th>Meter Awal</th>
                    <th>Terpakai</th>
                    <th>Sisa</th>
                    <th>Progress</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(h => {
                    const rem = Number(h.initial_meters) - Number(h.used_meters)
                    const p = pct(h)
                    const color = p >= 90 ? 'var(--danger)' : p >= 60 ? 'var(--warning)' : 'var(--success)'
                    return (
                      <tr key={h.id}>
                        <td><span className="font-semibold text-accent">{h.haspel_code}</span></td>
                        <td><span className={`badge ${h.type === '1c' ? 'badge-purple' : 'badge-orange'}`}>{h.type?.toUpperCase()}</span></td>
                        <td className="text-secondary">{format(new Date(h.date_in), 'dd MMM yyyy', { locale: id })}</td>
                        <td>{Number(h.initial_meters).toLocaleString()} m</td>
                        <td style={{ color: 'var(--warning)' }}>{Number(h.used_meters).toLocaleString()} m</td>
                        <td style={{ color: rem <= 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{rem.toLocaleString()} m</td>
                        <td style={{ minWidth: '100px' }}>
                          <div style={{ background: 'var(--bg-hover)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                            <div style={{ background: color, height: '100%', width: `${Math.min(p, 100)}%`, transition: 'width 0.3s' }} />
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{p}%</div>
                        </td>
                        <td>
                          {h.status === 'habis'
                            ? <span className="badge badge-danger"><AlertTriangle size={10} /> Habis</span>
                            : <span className="badge badge-success">Tersedia</span>
                          }
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="flex" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                            <button className="btn-icon" title="Riwayat" onClick={() => fetchHistory(h)}><History size={15} /></button>
                            {can(role, 'inventory.dropcore.edit') && (
                              <button className="btn-icon" onClick={() => openEdit(h)}><Edit2 size={15} /></button>
                            )}
                            {can(role, 'inventory.dropcore.delete') && (
                              <button className="btn-icon text-danger" onClick={() => handleDelete(h)}><Trash2 size={15} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <div className="mobile-only mobile-card-list">
                {paginated.map(h => {
                  const rem = Number(h.initial_meters) - Number(h.used_meters)
                  const p = pct(h)
                  const color = p >= 90 ? 'var(--danger)' : p >= 60 ? 'var(--warning)' : 'var(--success)'
                  return (
                    <div key={h.id} className="mobile-card">
                      <div className="mobile-card-header" onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}>
                        <div>
                          <div className="mobile-card-title">{h.haspel_code}</div>
                          <div className="mobile-card-subtitle">
                            <span className={`badge ${h.type === '1c' ? 'badge-purple' : 'badge-orange'}`} style={{ padding: '0px 4px', fontSize: '10px' }}>{h.type?.toUpperCase()}</span>
                            <span style={{ marginLeft: '8px' }}>
                              {h.status === 'habis'
                                ? <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: 600 }}>Habis</span>
                                : <span style={{ color: 'var(--success)', fontSize: '11px', fontWeight: 600 }}>Tersedia</span>
                              }
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '14px', fontWeight: 'bold', color: rem <= 0 ? 'var(--danger)' : 'var(--success)' }}>
                            {rem.toLocaleString()} m
                          </div>
                        </div>
                      </div>
                      {expandedId === h.id && (
                        <div className="mobile-card-body">
                          <div className="mobile-info-row"><span className="mobile-info-label">Tanggal Masuk</span><span className="mobile-info-value">{format(new Date(h.date_in), 'dd MMM yyyy', { locale: id })}</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">Meter Awal</span><span className="mobile-info-value">{Number(h.initial_meters).toLocaleString()} m</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">Terpakai</span><span className="mobile-info-value" style={{ color: 'var(--warning)' }}>{Number(h.used_meters).toLocaleString()} m</span></div>
                          <div className="mobile-info-row">
                            <span className="mobile-info-label">Progress</span>
                            <span className="mobile-info-value" style={{ width: '100px' }}>
                              <div style={{ background: 'var(--border-light)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                                <div style={{ background: color, height: '100%', width: `${Math.min(p, 100)}%` }} />
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', textAlign: 'right' }}>{p}%</div>
                            </span>
                          </div>
                          <div className="mobile-card-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => fetchHistory(h)}><History size={14} /> Riwayat</button>
                            {can(role, 'inventory.dropcore.edit') && (
                              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(h)}><Edit2 size={14} /> Edit</button>
                            )}
                            {can(role, 'inventory.dropcore.delete') && (
                              <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(h)}><Trash2 size={14} /> Hapus</button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
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
            <div className="empty-state"><Cable size={48} /><h3>Tidak Ada Haspel</h3><p>Belum ada data haspel dropcore.</p></div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{editItem ? 'Edit Haspel' : 'Tambah Haspel Dropcore'}</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Kode Haspel <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" placeholder="H-001" value={form.haspel_code} onChange={e => setForm(f => ({ ...f, haspel_code: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipe</label>
                  <select className="form-input" style={{ height: 'auto' }} value={form.type} onChange={e => {
                    const newType = e.target.value
                    if (!editItem) {
                      setForm(f => ({ ...f, type: newType, haspel_code: generateNextCode(newType) }))
                    } else {
                      setForm(f => ({ ...f, type: newType }))
                    }
                  }}>
                    <option value="1c">Dropcore 1C</option>
                    <option value="4c">Dropcore 4C</option>
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Meter Awal</label>
                  <input type="number" className="form-input" value={form.initial_meters} onChange={e => setForm(f => ({ ...f, initial_meters: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Meter Terpakai</label>
                  <input type="number" className="form-input" min="0" disabled={role === 'teknisi'} value={form.used_meters} onChange={e => setForm(f => ({ ...f, used_meters: e.target.value }))} title={role === 'teknisi' ? 'Teknisi hanya bisa melihat, gunakan halaman Pengeluaran untuk input pemakaian' : ''} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal Masuk</label>
                <input type="date" className="form-input" value={form.date_in} onChange={e => setForm(f => ({ ...f, date_in: e.target.value }))} disabled={role !== 'superadmin'} />
              </div>
              <div className="form-group">
                <label className="form-label">Note</label>
                <input className="form-input" placeholder="Opsional" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              <div style={{ padding: '10px 14px', background: 'var(--bg-hover)', borderRadius: '8px', fontSize: '13px' }}>
                Sisa meter: <strong style={{ color: 'var(--accent)' }}>{Math.max(0, Number(form.initial_meters) - Number(form.used_meters))} m</strong>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : (editItem ? 'Simpan Perubahan' : 'Tambah Haspel')}
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
        title={`Riwayat Haspel: ${historyItem?.haspel_code}`}
        unit="m"
      />

      {/* ===== CUSTOM DELETE CONFIRM MODAL ===== */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '400px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={20} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                <h3 style={{ margin: 0, fontSize: '16px' }}>Hapus Haspel</h3>
              </div>
              <button className="btn-icon" onClick={() => setConfirmDelete(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Yakin ingin menghapus haspel <strong style={{ color: 'var(--text-primary)' }}>{confirmDelete.haspel_code}</strong>?
              </p>
              <p style={{ margin: '10px 0 0', fontSize: '13px', color: 'var(--danger)', background: 'rgba(239,68,68,0.08)', borderRadius: '8px', padding: '10px 12px' }}>
                ⚠️ Tindakan ini tidak bisa dibatalkan dan data riwayat haspel ini akan ikut terhapus.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Batal</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={doDelete}>Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

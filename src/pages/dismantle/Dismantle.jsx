import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, ArrowDownToLine, CheckCircle, Clock, MapPin, Phone, FileDown, Upload, Download, ClipboardList, PackageCheck, Wand2, CalendarDays } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'
import { useProgress } from '../../contexts/ProgressContext'
import Pagination from '../../components/common/Pagination'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse text from WA message format into an array of structured objects.
 */
function parseWaPickups(text) {
  if (!text.trim()) return []

  // Split by "Tanggal Pengambilan" or double newlines to handle multiple blocks
  const blocks = text.split(/(?=Tanggal Pengambilan\s*:|Tanggal\s*:)/i)

  const parsed = blocks.map(block => {
    const b = block.trim()
    if (!b) return null

    const get = (keys) => {
      for (const key of keys) {
        const rx = new RegExp(`${key}\\s*:\\s*(.+)`, 'i')
        const m = b.match(rx)
        if (m) return m[1].trim()
      }
      return ''
    }

    const pickup_date_raw = get(['Tanggal Pengambilan', 'Tanggal'])
    const full_name = get(['Nama Pelanggan', 'Nama'])
    
    // If it doesn't even have a name, skip
    if (!full_name) return null

    const parseTanggal = (raw) => {
      if (!raw) return format(new Date(), 'yyyy-MM-dd')
      const cleaned = raw.replace(/^[a-zA-Z]+,\s*/i, '').trim()
      const bulanMap = {
        januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
        juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11
      }
      const m = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
      if (m) {
        const bln = bulanMap[m[2].toLowerCase()]
        if (bln !== undefined) {
          const d = new Date(Number(m[3]), bln, Number(m[1]))
          return format(d, 'yyyy-MM-dd')
        }
      }
      const d = new Date(cleaned)
      return isNaN(d) ? format(new Date(), 'yyyy-MM-dd') : format(d, 'yyyy-MM-dd')
    }

    return {
      _id: Math.random().toString(36).substr(2, 9),
      pickup_date: parseTanggal(pickup_date_raw),
      full_name,
      address: get(['Alamat']),
      customer_id: get(['ID Pelanggan', 'ID']),
      status_pelanggan: get(['Status Pelanggan', 'Status']),
      alasan_berhenti: get(['Alasan Berhenti', 'Alasan']),
      note: get(['Keterangan', 'Note', 'Catatan']),
      teknisi_text: get(['Teknisi']),
      serial_number: get(['SN Modem', 'Serial Number', 'SN ONT', 'SN']),
      adaptor: get(['Adaptor', 'Adaptor Charger']),
    }
  }).filter(Boolean)

  return parsed
}

const BULAN_LABEL = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dismantle() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const { showProgress, hideProgress } = useProgress()

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('antrean') // 'antrean' | 'pengambilan'

  // ── Antrean Dismantle state ────────────────────────────────────────────────
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

  // ── Data Pengambilan state ─────────────────────────────────────────────────
  const [pickups, setPickups] = useState([])
  const [loadingPickups, setLoadingPickups] = useState(true)
  const [searchPickup, setSearchPickup] = useState('')
  const [pickupPage, setPickupPage] = useState(1)
  const [pickupPerPage, setPickupPerPage] = useState(10)
  const [isPickupModalOpen, setIsPickupModalOpen] = useState(false)
  const [editPickup, setEditPickup] = useState(null)
  const [savingPickup, setSavingPickup] = useState(false)
  const [waText, setWaText] = useState('')
  const [showWaInput, setShowWaInput] = useState(false)
  const [expandedPickupId, setExpandedPickupId] = useState(null)
  const [parsedPickups, setParsedPickups] = useState([])

  // Export month filter
  const currentYear = new Date().getFullYear()
  const [exportMode, setExportMode] = useState('all') // 'all' | 'month'
  const [exportMonth, setExportMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'))
  const [exportYear, setExportYear] = useState(String(currentYear))
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)

  // View filter for pickups table
  const [pickupMonthFilter, setPickupMonthFilter] = useState('all') // 'all' | 'YYYY-MM'

  const emptyPickupForm = {
    pickup_date: format(new Date(), 'yyyy-MM-dd'),
    full_name: '', address: '', customer_id: '',
    status_pelanggan: '', alasan_berhenti: '', note: '',
    teknisi_text: '', serial_number: '', adaptor: ''
  }
  const [pickupForm, setPickupForm] = useState(emptyPickupForm)

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => { fetchAll() }, [])
  useEffect(() => { setPage(1) }, [searchTerm, statusFilter, dateFilter, koordinatorFilter])
  useEffect(() => { setPickupPage(1) }, [searchPickup, pickupMonthFilter])

  useEffect(() => {
    if (isModalOpen || isCloseModalOpen || isPickupModalOpen || isExportModalOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [isModalOpen, isCloseModalOpen, isPickupModalOpen, isExportModalOpen])

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = async () => {
    setLoading(true)
    setLoadingPickups(true)
    const [res, techRes, pickupRes] = await Promise.all([
      supabase.from('dismantles').select('*').order('date_input', { ascending: false }),
      supabase.from('users').select('id, full_name').in('role', ['admin', 'teknisi']).eq('is_active', true),
      supabase.from('dismantle_pickups').select('*').order('pickup_date', { ascending: false }),
    ])
    if (!res.error) setItems(res.data || [])
    if (!techRes.error) setTechnicians(techRes.data || [])
    if (!pickupRes.error) setPickups(pickupRes.data || [])
    setLoading(false)
    setLoadingPickups(false)
  }

  // ── Antrean handlers ───────────────────────────────────────────────────────
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
    if (!closeForm.technicians.length) { toast.error('Pilih minimal 1 teknisi'); return }
    if (closeForm.aksi === 'pending' && !closeForm.note.trim()) { toast.error('Note wajib diisi untuk Pending'); return }
    setSaving(true)
    const updateData = { aksi: closeForm.aksi, technicians: closeForm.technicians, updated_at: new Date().toISOString() }
    if (closeForm.aksi === 'close') { updateData.pickup_date = closeForm.pickup_date; updateData.note = closeForm.note || '' }
    else if (closeForm.aksi === 'pending') { updateData.note = closeForm.note }
    const { error } = await supabase.from('dismantles').update(updateData).eq('id', closeItem.id)
    if (!error) {
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dismantle', action: closeForm.aksi === 'close' ? 'Close Dismantle' : 'Pending Dismantle', detail: `ID: ${closeItem.customer_id}` })
      toast.success(`Dismantle ditandai ${closeForm.aksi}`)
      setIsCloseModalOpen(false)
      fetchAll()
    } else { toast.error('Gagal update: ' + error.message) }
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

  // ── Data Pengambilan handlers ──────────────────────────────────────────────
  const openAddPickup = () => {
    setEditPickup(null)
    setPickupForm(emptyPickupForm)
    setWaText('')
    setParsedPickups([])
    setShowWaInput(true)
    setIsPickupModalOpen(true)
  }

  const openEditPickup = (item) => {
    setEditPickup(item)
    setPickupForm({
      pickup_date: item.pickup_date,
      full_name: item.full_name,
      address: item.address || '',
      customer_id: item.customer_id || '',
      status_pelanggan: item.status_pelanggan || '',
      alasan_berhenti: item.alasan_berhenti || '',
      note: item.note || '',
      teknisi_text: item.teknisi_text || '',
      serial_number: item.serial_number || '',
      adaptor: item.adaptor || '',
    })
    setWaText('')
    setParsedPickups([])
    setShowWaInput(false)
    setIsPickupModalOpen(true)
  }

  const handleWaTextChange = (e) => {
    const text = e.target.value
    setWaText(text)
    const parsed = parseWaPickups(text)
    setParsedPickups(parsed)
  }

  const handleSaveParsedPickups = async () => {
    if (parsedPickups.length === 0) return
    setSavingPickup(true)
    try {
      showProgress('Menyimpan Data', 'Memulai proses penyimpanan...', 10)
      
      const toInsert = parsedPickups.map(({ _id, ...rest }) => ({
        ...rest,
        created_by: profile.id
      }))

      let inserted = 0
      const batchSize = 10
      for (let i = 0; i < toInsert.length; i += batchSize) {
        const batch = toInsert.slice(i, i + batchSize)
        const { error } = await supabase.from('dismantle_pickups').insert(batch)
        if (error) throw error
        inserted += batch.length
        showProgress('Menyimpan ke Database', `Menyimpan ${inserted} dari ${toInsert.length} data...`, 10 + (inserted / toInsert.length) * 80)
      }

      await logActivity({
        userId: profile.id,
        username: profile.username,
        role: profile.role,
        module: 'Dismantle',
        action: 'Catat Pengambilan Massal',
        detail: `Menambahkan ${toInsert.length} data pengambilan`
      })

      toast.success(`${toInsert.length} data pengambilan berhasil dicatat`)
      setIsPickupModalOpen(false)
      setWaText('')
      setParsedPickups([])
      fetchAll()
    } catch (err) {
      toast.error('Gagal menyimpan data: ' + err.message)
    } finally {
      setSavingPickup(false)
      hideProgress()
    }
  }

  const handleSavePickup = async () => {
    if (!pickupForm.full_name || !pickupForm.pickup_date) { toast.error('Nama & Tanggal Pengambilan wajib diisi'); return }
    setSavingPickup(true)
    try {
      if (editPickup) {
        const { error } = await supabase.from('dismantle_pickups').update({ ...pickupForm, updated_at: new Date().toISOString() }).eq('id', editPickup.id)
        if (error) throw error
        toast.success('Data pengambilan diperbarui')
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dismantle', action: 'Edit Pengambilan', detail: pickupForm.full_name })
      } else {
        const { error } = await supabase.from('dismantle_pickups').insert({ ...pickupForm, created_by: profile.id })
        if (error) throw error
        toast.success('Data pengambilan berhasil dicatat!')
        await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dismantle', action: 'Catat Pengambilan', detail: `${pickupForm.full_name} - ${pickupForm.customer_id}` })
      }
      setIsPickupModalOpen(false)
      fetchAll()
    } catch (err) {
      toast.error('Gagal simpan: ' + err.message)
    } finally { setSavingPickup(false) }
  }

  const handleDeletePickup = async (item) => {
    if (!window.confirm(`Hapus data pengambilan ${item.full_name}?`)) return
    await supabase.from('dismantle_pickups').delete().eq('id', item.id)
    await logActivity({ userId: profile.id, username: profile.username, role, module: 'Dismantle', action: 'Hapus Pengambilan', detail: item.full_name })
    toast.success('Data dihapus')
    fetchAll()
  }

  // ── Export Handlers ────────────────────────────────────────────────────────
  const handleExportAntrean = async () => {
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
        ws.addRow([item.date_input, item.customer_id, item.full_name, item.phone_number || '', item.address || '', item.lokasi || '', item.koordinator || '', item.serial_number || '', item.last_payment || '', getTechNames(item.technicians), item.aksi, item.pickup_date || '', item.note || ''])
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses baris ${i + 1} dari ${filtered.length}...`, 10 + ((i + 1) / filtered.length) * 80)
          await new Promise(r => setTimeout(r, 0))
        }
      }
      applyDataRowStyles(ws)
      await downloadWorkbook(workbook, `Dismantle ${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      toast.success('Export berhasil!')
    } catch (err) { toast.error('Gagal export: ' + err.message) } finally { hideProgress() }
  }

  const handleExportPickups = async () => {
    try {
      showProgress('Menyiapkan Export', 'Menginisialisasi file Excel...', 10)
      const { applyHeaderStyle, applyDataRowStyles, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()

      // Determine which data to export
      let dataToExport = pickups
      let fileLabel = 'Semua Data'
      if (exportMode === 'month') {
        dataToExport = pickups.filter(p => p.pickup_date && p.pickup_date.startsWith(`${exportYear}-${String(exportMonth).padStart(2, '0')}`))
        const bln = BULAN_LABEL[parseInt(exportMonth, 10) - 1]
        fileLabel = `${bln} ${exportYear}`
      }

      if (!dataToExport.length) {
        toast.error('Tidak ada data untuk periode yang dipilih')
        hideProgress()
        return
      }

      const ws = workbook.addWorksheet('Data Pengambilan')
      ws.properties.defaultRowHeight = 18

      // Title row
      ws.mergeCells('A1:J1')
      const titleCell = ws.getCell('A1')
      titleCell.value = `DATA DISMANTLE — ${fileLabel.toUpperCase()}`
      titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(1).height = 32

      // Generated date row
      ws.mergeCells('A2:J2')
      const genCell = ws.getCell('A2')
      genCell.value = `Digenerate pada: ${format(new Date(), "EEEE, d MMMM yyyy 'pukul' HH:mm", { locale: id })}`
      genCell.font = { italic: true, size: 10, color: { argb: 'FF64748B' } }
      genCell.alignment = { horizontal: 'center' }
      ws.getRow(2).height = 20

      ws.addRow([]) // spacer

      const headers = ['Tanggal Ambil', 'Nama Pelanggan', 'ID Pelanggan', 'Alamat', 'Status Pelanggan', 'Alasan Berhenti', 'Teknisi', 'SN Modem', 'Adaptor', 'Keterangan']
      setColumnWidths(ws, [16, 26, 26, 34, 22, 24, 22, 22, 12, 28])
      
      // Insert headers at row 4
      ws.addRow(headers)
      applyHeaderStyle(ws, headers, '0F172A', 4)

      for (let i = 0; i < dataToExport.length; i++) {
        const p = dataToExport[i]
        const row = ws.addRow([
          p.pickup_date ? format(parseISO(p.pickup_date), 'd MMMM yyyy', { locale: id }) : '',
          p.full_name,
          p.customer_id || '',
          p.address || '',
          p.status_pelanggan || '',
          p.alasan_berhenti || '',
          p.teknisi_text || '',
          p.serial_number || '',
          p.adaptor || '',
          p.note || '',
        ])
        // Alternate row colors
        if (i % 2 === 0) {
          row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
          })
        }
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses baris ${i + 1} dari ${dataToExport.length}...`, 20 + ((i + 1) / dataToExport.length) * 70)
          await new Promise(r => setTimeout(r, 0))
        }
      }

      // Summary row
      const summaryRow = ws.addRow(['', `Total: ${dataToExport.length} data`, '', '', '', '', '', '', '', ''])
      summaryRow.font = { bold: true, italic: true, color: { argb: 'FF0F172A' } }
      summaryRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }

      applyDataRowStyles(ws, 5)

      // Style title & gen rows - override border
      ws.getCell('A1').border = {}
      ws.getCell('A2').border = {}

      showProgress('Menyelesaikan Export', 'Mengunduh file Excel...', 95)
      await downloadWorkbook(workbook, `Data Dismantle — ${fileLabel}.xlsx`)
      toast.success('Export berhasil!')
      setIsExportModalOpen(false)
    } catch (err) {
      toast.error('Gagal export: ' + err.message)
    } finally { hideProgress() }
  }

  // ── Template & Import (Antrean) ────────────────────────────────────────────
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
    } catch (err) { toast.error('Gagal download template') }
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
        toast.success(`${inserted} data berhasil diimport`)
        fetchAll()
      } catch (err) { toast.error('Gagal import: ' + err.message) } finally { hideProgress() }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  // ── Filters ────────────────────────────────────────────────────────────────
  const koordinatorList = [...new Set(items.map(i => i.koordinator).filter(Boolean))].sort()

  const filtered = items.filter(i => {
    const matchSearch = i.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || i.customer_id?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = statusFilter === 'all' || i.aksi === statusFilter
    const matchDate = !dateFilter || i.date_input === dateFilter
    const matchKoordinator = koordinatorFilter === 'all' || (i.koordinator || '') === koordinatorFilter
    return matchSearch && matchStatus && matchDate && matchKoordinator
  })
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  // Pickup month options derived from data
  const pickupMonthOptions = [...new Set(
    pickups.map(p => p.pickup_date ? p.pickup_date.slice(0, 7) : null).filter(Boolean)
  )].sort((a, b) => b.localeCompare(a))

  const filteredPickups = pickups.filter(p => {
    const matchSearch = !searchPickup ||
      p.full_name?.toLowerCase().includes(searchPickup.toLowerCase()) ||
      p.customer_id?.toLowerCase().includes(searchPickup.toLowerCase()) ||
      p.teknisi_text?.toLowerCase().includes(searchPickup.toLowerCase())
    const matchMonth = pickupMonthFilter === 'all' || (p.pickup_date && p.pickup_date.startsWith(pickupMonthFilter))
    return matchSearch && matchMonth
  })
  const paginatedPickups = filteredPickups.slice((pickupPage - 1) * pickupPerPage, pickupPage * pickupPerPage)

  // ── Status badge helper ────────────────────────────────────────────────────
  const StatusBadge = ({ aksi }) => {
    if (aksi === 'close') return <span className="badge badge-success"><CheckCircle size={10} /> Close</span>
    if (aksi === 'pending') return <span className="badge badge-info" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><Clock size={10} /> Pending</span>
    if (aksi === 'disable') return <span className="badge badge-muted"><X size={10} /> Disable</span>
    if (aksi === 'berhenti_sementara') return <span className="badge badge-warning"><Clock size={10} /> Berhenti Sementara</span>
    if (aksi === 'berhenti_berlangganan') return <span className="badge badge-danger"><Trash2 size={10} /> Berhenti Berlangganan</span>
    return <span className="badge badge-accent"><CheckCircle size={10} /> Aktif</span>
  }

  // ── Years for export ───────────────────────────────────────────────────────
  const yearOptions = []
  for (let y = currentYear; y >= currentYear - 4; y--) yearOptions.push(String(y))

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Data Dismantle</h2>
          <p>Kelola pencabutan perangkat pelanggan</p>
        </div>
        <div className="page-header-right">
          {activeTab === 'antrean' && can(role, 'dismantle.input') && (
            <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Tambah Dismantle</button>
          )}
          {activeTab === 'pengambilan' && (
            <button className="btn btn-primary" onClick={openAddPickup}><Plus size={16} /> Catat Pengambilan</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid mb-4">
        {[
          { label: 'Total Antrean', val: items.length, color: 'var(--accent)' },
          { label: 'Aktif', val: items.filter(i => i.aksi === 'aktif').length, color: 'var(--warning)' },
          { label: 'Selesai (Close)', val: items.filter(i => i.aksi === 'close').length, color: 'var(--success)' },
          { label: 'Data Pengambilan', val: pickups.length, color: 'var(--info, #06b6d4)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-header"><div className="stat-card-icon" style={{ background: `${s.color}20` }}><ArrowDownToLine size={20} style={{ color: s.color }} /></div></div>
            <div className="stat-card-value" style={{ color: s.color }}>{s.val}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', borderBottom: '2px solid var(--border)', paddingBottom: '0' }}>
        {[
          { key: 'antrean', label: 'Antrean Dismantle', icon: <ClipboardList size={15} /> },
          { key: 'pengambilan', label: 'Data Pengambilan', icon: <PackageCheck size={15} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 20px', border: 'none', cursor: 'pointer',
              background: 'transparent', fontWeight: 600, fontSize: '14px',
              color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-2px', transition: 'all 0.2s',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: ANTREAN ── */}
      {activeTab === 'antrean' && (
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
                <button className="btn-clear-date" onClick={() => setDateFilter('')} title="Tampilkan semua tanggal"
                  style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', padding: '4px' }}>
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
              {koordinatorList.map(k => <option key={k} value={k}>{k}</option>)}
            </select>

            <div className="filter-actions" style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}><FileDown size={14} /> Template</button>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginBottom: 0 }}>
                <Upload size={14} /> Import
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportExcel} />
              </label>
              <button className="btn btn-secondary btn-sm" onClick={handleExportAntrean}><Download size={14} /> Export</button>
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
                        <td><StatusBadge aksi={item.aksi} /></td>
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
                        <StatusBadge aksi={item.aksi} />
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
                          <div className="mobile-info-row"><span className="mobile-info-label">Teknisi</span><span className="mobile-info-value">{getTechNames(item.technicians)}</span></div>
                          <div className="mobile-card-actions">
                            {item.aksi !== 'close' && (
                              <button className="btn btn-secondary btn-sm text-success" onClick={(e) => { e.stopPropagation(); openCloseModal(item) }}><CheckCircle size={14} /> Update Status</button>
                            )}
                            {can(role, 'dismantle.edit') && (
                              <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(item) }}><Edit2 size={14} /> Edit</button>
                            )}
                            {can(role, 'dismantle.delete') && (
                              <button className="btn btn-secondary btn-sm text-danger" onClick={(e) => { e.stopPropagation(); handleDelete(item) }}><Trash2 size={14} /> Hapus</button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <Pagination page={page} setPage={setPage} perPage={perPage} setPerPage={setPerPage} totalItems={filtered.length} />
              </>
            ) : (
              <div className="empty-state"><ArrowDownToLine size={48} /><h3>Tidak Ada Data</h3><p>Belum ada data dismantle.</p></div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: DATA PENGAMBILAN ── */}
      {activeTab === 'pengambilan' && (
        <div className="card">
          <div className="filter-bar">
            <div className="search-box">
              <Search size={16} className="search-icon" />
              <input type="text" placeholder="Cari nama / ID / teknisi..." value={searchPickup} onChange={e => setSearchPickup(e.target.value)} />
            </div>

            <select className="filter-select" value={pickupMonthFilter} onChange={e => setPickupMonthFilter(e.target.value)}>
              <option value="all">Semua Bulan</option>
              {pickupMonthOptions.map(m => {
                const [y, mo] = m.split('-')
                return <option key={m} value={m}>{BULAN_LABEL[parseInt(mo, 10) - 1]} {y}</option>
              })}
            </select>

            <div style={{ marginLeft: 'auto' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setIsExportModalOpen(true)}><Download size={14} /> Export Excel</button>
            </div>
          </div>

          <div className="table-container">
            {loadingPickups ? (
              <div className="flex-center" style={{ height: '180px' }}><div className="spinner" /></div>
            ) : filteredPickups.length > 0 ? (
              <>
                <table className="desktop-only">
                  <thead>
                    <tr>
                      <th>Tanggal Ambil</th>
                      <th>Pelanggan</th>
                      <th>Status</th>
                      <th>Teknisi</th>
                      <th>SN Modem</th>
                      <th>Adaptor</th>
                      <th>Keterangan</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPickups.map(item => (
                      <tr key={item.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CalendarDays size={14} style={{ color: 'var(--accent)' }} />
                            {item.pickup_date ? format(parseISO(item.pickup_date), 'dd MMM yyyy', { locale: id }) : '-'}
                          </div>
                        </td>
                        <td>
                          <div className="font-semibold">{item.full_name}</div>
                          {item.customer_id && <div className="text-secondary" style={{ fontSize: '11px' }}>{item.customer_id}</div>}
                          {item.address && <div className="text-secondary" style={{ fontSize: '11px', marginTop: '2px' }}>{item.address}</div>}
                        </td>
                        <td>
                          {item.status_pelanggan && <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--danger)' }}>{item.status_pelanggan}</div>}
                          {item.alasan_berhenti && <div className="text-secondary" style={{ fontSize: '11px' }}>{item.alasan_berhenti}</div>}
                        </td>
                        <td style={{ fontSize: '12px' }}>{item.teknisi_text || '-'}</td>
                        <td><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{item.serial_number || '-'}</span></td>
                        <td style={{ fontSize: '12px' }}>{item.adaptor || '-'}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.note || '-'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="flex" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                            {can(role, 'dismantle.edit') && (
                              <button className="btn-icon" title="Edit" onClick={() => openEditPickup(item)}><Edit2 size={15} /></button>
                            )}
                            {can(role, 'dismantle.delete') && (
                              <button className="btn-icon text-danger" title="Hapus" onClick={() => handleDeletePickup(item)}><Trash2 size={15} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile cards for pickups */}
                <div className="mobile-only mobile-card-list">
                  {paginatedPickups.map(item => (
                    <div key={item.id} className="mobile-card">
                      <div className="mobile-card-header" onClick={() => setExpandedPickupId(expandedPickupId === item.id ? null : item.id)}>
                        <div>
                          <div className="mobile-card-title">{item.full_name}</div>
                          <div className="mobile-card-subtitle">{item.pickup_date ? format(parseISO(item.pickup_date), 'dd MMM yyyy', { locale: id }) : '-'}</div>
                        </div>
                        <span className="badge badge-success" style={{ fontSize: '10px' }}><PackageCheck size={10} /> Diambil</span>
                      </div>
                      {expandedPickupId === item.id && (
                        <div className="mobile-card-body">
                          <div className="mobile-info-row"><span className="mobile-info-label">ID Pelanggan</span><span className="mobile-info-value">{item.customer_id || '-'}</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">Alamat</span><span className="mobile-info-value">{item.address || '-'}</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">Status</span><span className="mobile-info-value">{item.status_pelanggan || '-'}</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">Alasan</span><span className="mobile-info-value">{item.alasan_berhenti || '-'}</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">Teknisi</span><span className="mobile-info-value">{item.teknisi_text || '-'}</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">SN Modem</span><span className="mobile-info-value" style={{ fontFamily: 'monospace' }}>{item.serial_number || '-'}</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">Adaptor</span><span className="mobile-info-value">{item.adaptor || '-'}</span></div>
                          <div className="mobile-info-row"><span className="mobile-info-label">Keterangan</span><span className="mobile-info-value">{item.note || '-'}</span></div>
                          <div className="mobile-card-actions">
                            {can(role, 'dismantle.edit') && (
                              <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); openEditPickup(item) }}><Edit2 size={14} /> Edit</button>
                            )}
                            {can(role, 'dismantle.delete') && (
                              <button className="btn btn-secondary btn-sm text-danger" onClick={(e) => { e.stopPropagation(); handleDeletePickup(item) }}><Trash2 size={14} /> Hapus</button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <Pagination page={pickupPage} setPage={setPickupPage} perPage={pickupPerPage} setPerPage={setPickupPerPage} totalItems={filteredPickups.length} />
              </>
            ) : (
              <div className="empty-state">
                <PackageCheck size={48} />
                <h3>Belum Ada Data Pengambilan</h3>
                <p>Klik "+ Catat Pengambilan" untuk menambah data.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: Tambah/Edit Antrean Dismantle
      ════════════════════════════════════════════════════════════════════════ */}
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
                  <input type="date" className="form-input" value={form.date_input} onChange={e => setForm(f => ({ ...f, date_input: e.target.value }))} disabled={role !== 'superadmin'} />
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

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: Update Status Close/Pending Antrean
      ════════════════════════════════════════════════════════════════════════ */}
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
                {closeForm.aksi === 'close'
                  ? <><b>{closeItem?.full_name}</b> ditandai <b>Close</b> — ONT sudah diambil.</>
                  : <><b>{closeItem?.full_name}</b> ditandai <b>Pending</b> — ONT belum terambil.</>}
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
                  <input type="date" className="form-input" value={closeForm.pickup_date} onChange={e => setCloseForm(f => ({ ...f, pickup_date: e.target.value }))} disabled={role !== 'superadmin'} />
                </div>
              )}
              {closeForm.aksi === 'pending' && (
                <div className="form-group">
                  <label className="form-label">Note / Alasan <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <textarea className="form-input" placeholder="Alasan belum terambil (misal: rumah kosong)" rows="3" value={closeForm.note} onChange={e => setCloseForm(f => ({ ...f, note: e.target.value }))} />
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

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: Catat / Edit Data Pengambilan
      ════════════════════════════════════════════════════════════════════════ */}
      {isPickupModalOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal modal-xl" style={{ display: 'flex', flexDirection: 'column', maxHeight: '92vh', width: '90%', maxWidth: '1100px' }}>
            <div className="modal-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
              <h3>{editPickup ? 'Edit Data Pengambilan' : 'Catat Data Pengambilan'}</h3>
              <button className="btn-icon" onClick={() => setIsPickupModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px' }}>

              {/* WA Paste Area */}
              {!editPickup && (
                <div className="form-group mb-4">
                  <label className="form-label">Paste pesan WhatsApp di sini</label>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', padding: '12px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '8px', lineHeight: '1.6' }}>
                    <strong style={{ color: 'var(--accent)', display: 'block', marginBottom: '4px' }}>Contoh Format:</strong>
                    Tanggal Pengambilan : Selasa,4 Agustus 2024<br/>
                    Nama Pelanggan : Yuyun Huri Indra<br/>
                    Alamat : RT 03 RW 01 Desa Sawangan<br/>
                    ID Pelanggan : 816801440@bms.wifian.net.id<br/>
                    Status Pelanggan : Berhenti Berlangganan<br/>
                    Alasan Berhenti : Pindah Ke MyRep<br/>
                    Keterangan : Sudah Diambil Hari ini<br/>
                    Teknisi : Dika,Aldo<br/><br/>
                    Material<br/>
                    SN Modem : ZTEGC895C2E1<br/>
                    Adaptor : 1 Pcs
                  </div>
                  <textarea
                    className="form-input"
                    rows={8}
                    placeholder="Paste teks WA di sini..."
                    value={waText}
                    onChange={handleWaTextChange}
                    style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '13px', padding: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px' }}
                  />
                </div>
              )}

              {/* Edit Mode: Manual Form Fields */}
              {editPickup ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Data Pelanggan
                  </p>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Tanggal Pengambilan <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input type="date" className="form-input" value={pickupForm.pickup_date} onChange={e => setPickupForm(f => ({ ...f, pickup_date: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">ID Pelanggan</label>
                      <input className="form-input" placeholder="816801440@bms.wifian.net.id" value={pickupForm.customer_id} onChange={e => setPickupForm(f => ({ ...f, customer_id: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nama Pelanggan <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input className="form-input" placeholder="Nama lengkap pelanggan" value={pickupForm.full_name} onChange={e => setPickupForm(f => ({ ...f, full_name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Alamat</label>
                    <input className="form-input" placeholder="Alamat pelanggan" value={pickupForm.address} onChange={e => setPickupForm(f => ({ ...f, address: e.target.value }))} />
                  </div>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Status Pelanggan</label>
                      <input className="form-input" placeholder="Berhenti Berlangganan" value={pickupForm.status_pelanggan} onChange={e => setPickupForm(f => ({ ...f, status_pelanggan: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Alasan Berhenti</label>
                      <input className="form-input" placeholder="Pindah Ke MyRep" value={pickupForm.alasan_berhenti} onChange={e => setPickupForm(f => ({ ...f, alasan_berhenti: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teknisi</label>
                    <input className="form-input" placeholder="Dika, Aldo" value={pickupForm.teknisi_text} onChange={e => setPickupForm(f => ({ ...f, teknisi_text: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Keterangan</label>
                    <textarea className="form-input" rows={2} placeholder="Keterangan / catatan tambahan" value={pickupForm.note} onChange={e => setPickupForm(f => ({ ...f, note: e.target.value }))} />
                  </div>

                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Material
                  </p>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">SN Modem</label>
                      <input className="form-input" placeholder="ZTEGC895C2E1" value={pickupForm.serial_number} onChange={e => setPickupForm(f => ({ ...f, serial_number: e.target.value }))} style={{ fontFamily: 'monospace' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Adaptor</label>
                      <input className="form-input" placeholder="1 Pcs" value={pickupForm.adaptor} onChange={e => setPickupForm(f => ({ ...f, adaptor: e.target.value }))} />
                    </div>
                  </div>
                </div>
              ) : (
                // Add Mode: Preview Table
                parsedPickups.length > 0 && (
                  <div>
                    <h4 className="mb-4 font-semibold text-accent">Preview Hasil Parsing ({parsedPickups.length} Data)</h4>
                    <div className="table-container" style={{ maxHeight: '260px' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Tanggal</th>
                            <th>Nama / ID Pelanggan</th>
                            <th>Teknisi</th>
                            <th>SN Modem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedPickups.map((t) => (
                            <tr key={t._id}>
                              <td className="font-bold">{t.pickup_date ? format(parseISO(t.pickup_date), 'dd/MM/yy') : '-'}</td>
                              <td>
                                <div>{t.full_name}</div>
                                <div className="text-secondary" style={{ fontSize: '11px' }}>{t.customer_id}</div>
                              </td>
                              <td>{t.teknisi_text}</td>
                              <td>{t.serial_number}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsPickupModalOpen(false)}>Tutup</button>
              {editPickup ? (
                <button className="btn btn-primary" onClick={handleSavePickup} disabled={savingPickup}>
                  {savingPickup ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : 'Simpan Perubahan'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleSaveParsedPickups} disabled={savingPickup || parsedPickups.length === 0}>
                  {savingPickup ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : `Simpan ${parsedPickups.length} Data`}
                </button>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: Export Excel Pengambilan
      ════════════════════════════════════════════════════════════════════════ */}
      {isExportModalOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Export Data Pengambilan</h3>
              <button className="btn-icon" onClick={() => setIsExportModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Pilih Rentang Data</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', borderRadius: '8px', border: `2px solid ${exportMode === 'all' ? 'var(--accent)' : 'var(--border)'}`, background: exportMode === 'all' ? 'var(--accent-dim)' : 'transparent' }}>
                    <input type="radio" value="all" checked={exportMode === 'all'} onChange={() => setExportMode('all')} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>Semua Data</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{pickups.length} data pengambilan</div>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', borderRadius: '8px', border: `2px solid ${exportMode === 'month' ? 'var(--accent)' : 'var(--border)'}`, background: exportMode === 'month' ? 'var(--accent-dim)' : 'transparent' }}>
                    <input type="radio" value="month" checked={exportMode === 'month'} onChange={() => setExportMode('month')} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>Per Bulan</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Pilih bulan & tahun tertentu</div>
                    </div>
                  </label>
                </div>
              </div>

              {exportMode === 'month' && (
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Bulan</label>
                    <select className="form-input" style={{ height: 'auto' }} value={exportMonth} onChange={e => setExportMonth(e.target.value)}>
                      {BULAN_LABEL.map((b, i) => (
                        <option key={i} value={String(i + 1).padStart(2, '0')}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tahun</label>
                    <select className="form-input" style={{ height: 'auto' }} value={exportYear} onChange={e => setExportYear(e.target.value)}>
                      {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {exportMode === 'month' && (
                <div style={{ padding: '10px 14px', background: 'var(--bg-hover)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Preview: <b style={{ color: 'var(--text)' }}>
                    {pickups.filter(p => p.pickup_date && p.pickup_date.startsWith(`${exportYear}-${exportMonth}`)).length}
                  </b> data untuk <b style={{ color: 'var(--accent)' }}>{BULAN_LABEL[parseInt(exportMonth, 10) - 1]} {exportYear}</b>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsExportModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleExportPickups}>
                <Download size={15} /> Export Excel
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}

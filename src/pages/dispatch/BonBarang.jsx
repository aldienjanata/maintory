import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  Plus, ClipboardList, CheckCircle, X, Trash2, Edit2,
  PackageCheck, Package, CalendarDays, AlertCircle, Download
} from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import Select from 'react-select'
import { useProgress } from '../../contexts/ProgressContext'
import Pagination from '../../components/common/Pagination'

const SITES = [
  { value: 'banyumas', label: 'Banyumas' },
  { value: 'cilacap', label: 'Cilacap' },
  { value: 'cilacap_herman', label: 'Cilacap (Herman)' }
]

const WORK_TYPES = [
  { value: 'ikr_psb', label: 'IKR/PSB' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'odc_odp', label: 'Instalasi ODC/ODP' }
]

const ITEM_TYPE_LABELS = { ont: 'ONT', dropcore: 'Dropcore', other: 'Material Lain' }
const ITEM_TYPE_COLORS = { ont: 'var(--accent)', dropcore: 'var(--warning)', other: 'var(--success)' }

export default function BonBarang() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const { showProgress, hideProgress } = useProgress()

  const [activeTab, setActiveTab] = useState('sedang_dibawa')
  const [dispatches, setDispatches] = useState([])
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  // Pagination state
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [schedPage, setSchedPage] = useState(1)
  const [schedPerPage, setSchedPerPage] = useState(10)

  // Options
  const [technicians, setTechnicians] = useState([])
  const [snList, setSnList] = useState([])
  const [haspelList, setHaspelList] = useState([])
  const [otherItems, setOtherItems] = useState([])

  // Banner for teknisi
  const [myTodaySchedule, setMyTodaySchedule] = useState(null)
  const [myPendingSchedules, setMyPendingSchedules] = useState([])

  // Modal: Buat Bon
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const [editingDispatchId, setEditingDispatchId] = useState(null)
  const [form, setForm] = useState({
    dispatch_date: format(new Date(), 'yyyy-MM-dd'),
    site: 'banyumas',
    technicians: [], // <-- NOW AN ARRAY
    note: '',
    items: []
  })

  // Modal: Lapor Pemakaian
  const [isLaporModalOpen, setIsLaporModalOpen] = useState(false)
  const [selectedDispatch, setSelectedDispatch] = useState(null)
  const [laporForm, setLaporForm] = useState({})
  const [laporSaving, setLaporSaving] = useState(false)

  // Modal: Tambah Jadwal
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({
    schedule_date: format(new Date(), 'yyyy-MM-dd'),
    site: 'banyumas',
    work_type: 'ikr_psb',
    technicians: [],
    note: ''
  })
  const [schedSaving, setSchedSaving] = useState(false)

  // Modal: Export
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportMonth, setExportMonth] = useState('')

  useEffect(() => { fetchData() }, [])
  useEffect(() => { setPage(1) }, [activeTab])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [dispRes, schedRes, techRes, snRes, haspelRes, otherRes] = await Promise.all([
        // Note: we might not have a reliable foreign key to users if we use UUID array `technicians`
        // We will fetch users separately and map them locally.
        supabase
          .from('dispatches')
          .select('*, items:dispatch_items(*, sn:serial_numbers(serial_number), haspel:dropcore_haspels(*), warehouse_item:warehouses(item_name))')
          .order('created_at', { ascending: false }),
        supabase.from('technician_schedules').select('*').order('schedule_date', { ascending: false }),
        supabase.from('users').select('id, full_name').in('role', ['admin', 'teknisi']).eq('is_active', true),
        supabase.from('serial_numbers').select('id, serial_number').eq('status', 'tersedia'),
        supabase.from('dropcore_haspels').select('id, haspel_code, initial_meters, used_meters, type').in('status', ['tersedia']),
        supabase.from('warehouses').select('id, item_name, initial_stock').gt('initial_stock', 0)
      ])

      if (dispRes.data) setDispatches(dispRes.data)
      if (techRes.data) setTechnicians(techRes.data.map(t => ({ value: t.id, label: t.full_name, id: t.id, full_name: t.full_name })))
      if (snRes.data) setSnList(snRes.data)
      if (haspelRes.data) setHaspelList(haspelRes.data)
      if (otherRes.data) setOtherItems(otherRes.data)

      if (schedRes.data) {
        const allScheds = schedRes.data || []
        setSchedules(allScheds)
        const today = format(new Date(), 'yyyy-MM-dd')
        setMyPendingSchedules(allScheds.filter(s =>
          s.status !== 'completed' &&
          s.technicians?.includes(profile.id) &&
          s.schedule_date < today
        ))
        setMyTodaySchedule(allScheds.find(s =>
          s.schedule_date === today &&
          s.technicians?.includes(profile.id)
        ) || null)
      }
    } catch (err) {
      console.error(err)
      toast.error('Gagal mengambil data')
    } finally {
      setLoading(false)
    }
  }

  // --- SCHEDULE LOGIC ---
  const handleSaveSchedule = async () => {
    if (!scheduleForm.schedule_date || !scheduleForm.site) { toast.error('Tanggal dan lokasi wajib diisi'); return }
    if (scheduleForm.technicians.length === 0) { toast.error('Pilih minimal 1 teknisi'); return }
    setSchedSaving(true)
    try {
      const { error } = await supabase.from('technician_schedules').insert({
        ...scheduleForm,
        status: 'pending',
        created_by: profile.id
      })
      if (error) throw error
      toast.success('Jadwal berhasil ditambahkan')
      setIsScheduleModalOpen(false)
      fetchData()
    } catch (err) {
      toast.error('Gagal menyimpan: ' + err.message)
    } finally { setSchedSaving(false) }
  }

  const handleDeleteSchedule = async (sched) => {
    if (!window.confirm('Hapus jadwal ini?')) return
    await supabase.from('technician_schedules').delete().eq('id', sched.id)
    toast.success('Jadwal dihapus')
    fetchData()
  }

  const toggleScheduleTech = (techId) => {
    setScheduleForm(f => ({
      ...f,
      technicians: f.technicians.includes(techId)
        ? f.technicians.filter(t => t !== techId)
        : [...f.technicians, techId]
    }))
  }

  // --- BON FORM LOGIC ---
  const handleOpenAdd = (sched = null) => {
    setEditingDispatchId(null)
    setForm({
      dispatch_date: sched ? sched.schedule_date : format(new Date(), 'yyyy-MM-dd'),
      site: sched ? sched.site : 'banyumas',
      technicians: sched?.technicians || [],
      note: sched ? `Berdasarkan Jadwal ${sched.schedule_date}` : '',
      items: []
    })
    setSelectedScheduleId(sched ? sched.id : '')
    setIsModalOpen(true)
  }

  const handleOpenEdit = (dispatch) => {
    setEditingDispatchId(dispatch.id)
    
    const onts = dispatch.items.filter(i => i.item_type === 'ont')
    const dcs = dispatch.items.filter(i => i.item_type === 'dropcore')
    const others = dispatch.items.filter(i => i.item_type === 'other')

    const newItems = []
    if (onts.length > 0) {
      newItems.push({
        id: 'edit_ont',
        item_type: 'ont',
        selected_onts: onts.map(o => ({ value: o.serial_number_id, label: o.sn?.serial_number }))
      })
    }
    if (dcs.length > 0) {
      newItems.push({
        id: 'edit_dc',
        item_type: 'dropcore',
        selected_haspels: dcs.map(d => ({ value: d.haspel_id, label: d.haspel?.haspel_code }))
      })
    }
    if (others.length > 0) {
      const otherQuantities = {}
      others.forEach(o => { otherQuantities[o.warehouse_item_id] = o.quantity_dispatched })
      newItems.push({
        id: 'edit_other',
        item_type: 'other',
        selected_others: others.map(o => ({ value: o.warehouse_item_id, label: o.warehouse_item?.item_name })),
        other_quantities: otherQuantities
      })
    }

    setForm({
      dispatch_date: dispatch.dispatch_date,
      site: dispatch.site,
      technicians: dispatch.technicians && dispatch.technicians.length > 0 ? dispatch.technicians : [dispatch.technician_id],
      note: dispatch.notes || '',
      items: newItems
    })
    setSelectedScheduleId(dispatch.schedule_id || '')
    setIsModalOpen(true)
  }

  const addItemType = (type) => {
    setForm(f => ({ ...f, items: [...f.items, { id: Date.now().toString(), item_type: type }] }))
  }
  const removeItem = (itemId) => setForm(f => ({ ...f, items: f.items.filter(i => i.id !== itemId) }))
  const updateItem = (itemId, field, value) => {
    setForm(f => ({ ...f, items: f.items.map(i => i.id === itemId ? { ...i, [field]: value } : i) }))
  }

  const handleSaveBon = async () => {
    if (form.technicians.length === 0) { toast.error('Pilih minimal 1 teknisi'); return }
    if (form.items.length === 0) { toast.error('Tambahkan minimal 1 barang'); return }
    setSaving(true)
    try {
      const itemsToInsert = [], ontIds = [], dcIds = [], whUpdates = []
      for (const item of form.items) {
        if (item.item_type === 'ont') {
          (item.selected_onts || []).forEach(opt => { itemsToInsert.push({ item_type: 'ont', serial_number_id: opt.value, quantity_dispatched: 1 }); ontIds.push(opt.value) })
        } else if (item.item_type === 'dropcore') {
          (item.selected_haspels || []).forEach(opt => { itemsToInsert.push({ item_type: 'dropcore', haspel_id: opt.value, quantity_dispatched: 1 }); dcIds.push(opt.value) })
        } else if (item.item_type === 'other') {
          (item.selected_others || []).forEach(opt => {
            const qty = item.other_quantities?.[opt.value] || 1
            if (qty > 0) { itemsToInsert.push({ item_type: 'other', warehouse_item_id: opt.value, quantity_dispatched: qty }); whUpdates.push({ id: opt.value, qty }) }
          })
        }
      }
      if (itemsToInsert.length === 0) { toast.error('Belum ada item valid yang dipilih'); setSaving(false); return }

      // We still map technician_id to form.technicians[0] as fallback for older schemas if needed, 
      // but also insert the actual `technicians` array column.
      const dispatchPayload = {
        dispatch_date: form.dispatch_date,
        technician_id: form.technicians[0], 
        technicians: form.technicians,
        site: form.site,
        notes: form.note,
        status: 'sedang_dibawa',
        created_by: profile.id
      }
      if (selectedScheduleId) dispatchPayload.schedule_id = selectedScheduleId

      if (editingDispatchId) {
        const oldDispatch = dispatches.find(d => d.id === editingDispatchId)
        if (oldDispatch) {
          // 1. REVERT OLD STOCK
          const oldOnt = [], oldDc = [], oldWh = []
          for (const it of oldDispatch.items) {
            if (it.item_type === 'ont') oldOnt.push(it.serial_number_id)
            if (it.item_type === 'dropcore') oldDc.push(it.haspel_id)
            if (it.item_type === 'other') oldWh.push({ id: it.warehouse_item_id, qty: it.quantity_dispatched })
          }
          if (oldOnt.length > 0) await supabase.from('serial_numbers').update({ status: 'tersedia' }).in('id', oldOnt)
          if (oldDc.length > 0) await supabase.from('dropcore_haspels').update({ status: 'tersedia' }).in('id', oldDc)
          for (const wh of oldWh) {
            const { data: wData } = await supabase.from('warehouses').select('initial_stock, stock_on_hold').eq('id', wh.id).single()
            if (wData) {
              await supabase.from('warehouses').update({ 
                initial_stock: Number(wData.initial_stock || 0) + Number(wh.qty), 
                stock_on_hold: Math.max(0, Number(wData.stock_on_hold || 0) - Number(wh.qty)) 
              }).eq('id', wh.id)
            }
          }
          
          // 2. DELETE OLD ITEMS
          await supabase.from('dispatch_items').delete().eq('dispatch_id', editingDispatchId)
          
          // 3. UPDATE DISPATCH
          await supabase.from('dispatches').update({
            dispatch_date: form.dispatch_date,
            technician_id: form.technicians[0],
            technicians: form.technicians,
            site: form.site,
            notes: form.note,
            schedule_id: selectedScheduleId || null
          }).eq('id', editingDispatchId)

          // 4. INSERT NEW ITEMS
          const { error: iErr } = await supabase.from('dispatch_items').insert(itemsToInsert.map(i => ({ ...i, dispatch_id: editingDispatchId })))
          if (iErr) throw iErr
        }
      } else {
        const { data: dData, error: dErr } = await supabase.from('dispatches').insert(dispatchPayload).select('id').single()
        if (dErr) throw dErr

        const { error: iErr } = await supabase.from('dispatch_items').insert(itemsToInsert.map(i => ({ ...i, dispatch_id: dData.id })))
        if (iErr) throw iErr
      }

      if (ontIds.length > 0) await supabase.from('serial_numbers').update({ status: 'dibawa teknisi' }).in('id', ontIds)
      if (dcIds.length > 0) await supabase.from('dropcore_haspels').update({ status: 'dibawa teknisi' }).in('id', dcIds)
      for (const wh of whUpdates) {
        const { data: wItem } = await supabase.from('warehouses').select('initial_stock, stock_on_hold').eq('id', wh.id).single()
        if (wItem) await supabase.from('warehouses').update({ initial_stock: Number(wItem.initial_stock || 0) - Number(wh.qty), stock_on_hold: Number(wItem.stock_on_hold || 0) + Number(wh.qty) }).eq('id', wh.id)
      }
      if (selectedScheduleId) {
        await supabase.from('technician_schedules').update({ status: 'completed' }).eq('id', selectedScheduleId)
      }

      toast.success('Bon Barang berhasil dibuat!')
      setIsModalOpen(false)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error('Terjadi kesalahan: ' + err.message)
    } finally { setSaving(false) }
  }

  // --- LAPOR PEMAKAIAN ---
  const handleOpenLapor = (dispatch) => {
    setSelectedDispatch(dispatch)
    const initForm = {}
    dispatch.items.forEach(it => {
      if (it.item_type === 'ont') initForm[it.id] = { used: false }
      else if (it.item_type === 'dropcore') initForm[it.id] = { meters_used: '' }
      else if (it.item_type === 'other') initForm[it.id] = { qty_used: '' }
    })
    setLaporForm(initForm)
    setIsLaporModalOpen(true)
  }

  const handleSaveLapor = async () => {
    setLaporSaving(true)
    try {
      const expItemsToInsert = [], dispatchUpdates = []
      const ontReturns = [], ontUsed = [], dcUpdates = [], whReturns = [], whUsed = []

      for (const it of selectedDispatch.items) {
        const lapor = laporForm[it.id]
        if (it.item_type === 'ont') {
          const used = lapor?.used || false
          dispatchUpdates.push({ id: it.id, quantity_used: used ? 1 : 0, quantity_returned: used ? 0 : 1 })
          if (used) { ontUsed.push(it.serial_number_id); expItemsToInsert.push({ item_type: 'ont', serial_number_id: it.serial_number_id, quantity: 1 }) }
          else ontReturns.push(it.serial_number_id)
        } else if (it.item_type === 'dropcore') {
          const meters = Number(lapor?.meters_used || 0)
          dispatchUpdates.push({ id: it.id, meters_used: meters })
          if (meters > 0) expItemsToInsert.push({ item_type: 'dropcore', haspel_id: it.haspel_id, meters_used: meters, quantity: 1 })
          dcUpdates.push({ id: it.haspel_id, add_meters: meters })
        } else if (it.item_type === 'other') {
          const qUsed = Number(lapor?.qty_used || 0)
          const qRet = Number(it.quantity_dispatched) - qUsed
          dispatchUpdates.push({ id: it.id, quantity_used: qUsed, quantity_returned: qRet })
          if (qUsed > 0) { expItemsToInsert.push({ item_type: 'other', warehouse_item_id: it.warehouse_item_id, quantity: qUsed }); whUsed.push({ id: it.warehouse_item_id, qty: qUsed }) }
          if (qRet > 0) whReturns.push({ id: it.warehouse_item_id, qty: qRet })
        }
      }

      if (expItemsToInsert.length > 0) {
        const { data: expData, error: expErr } = await supabase.from('daily_expenses').insert({
          expense_date: format(new Date(), 'yyyy-MM-dd'),
          site: selectedDispatch.site,
          // Support both legacy technician_id array or new technicians array
          technicians: selectedDispatch.technicians && selectedDispatch.technicians.length > 0 ? selectedDispatch.technicians : [selectedDispatch.technician_id],
          work_type: 'ikr_psb',
          note: 'Otomatis dari Laporan Bon Barang',
          created_by: profile.id
        }).select('id').single()
        if (expErr) throw expErr
        await supabase.from('expense_items').insert(expItemsToInsert.map(i => ({ ...i, expense_id: expData.id })))
      }

      for (const up of dispatchUpdates) await supabase.from('dispatch_items').update(up).eq('id', up.id)
      await supabase.from('dispatches').update({ status: 'selesai', updated_at: new Date().toISOString() }).eq('id', selectedDispatch.id)

      if (ontReturns.length > 0) await supabase.from('serial_numbers').update({ status: 'tersedia' }).in('id', ontReturns)
      if (ontUsed.length > 0) await supabase.from('serial_numbers').update({ status: 'terpakai' }).in('id', ontUsed)
      for (const dc of dcUpdates) {
        const { data: hData } = await supabase.from('dropcore_haspels').select('initial_meters, used_meters').eq('id', dc.id).single()
        if (hData) { const newUsed = Number(hData.used_meters || 0) + Number(dc.add_meters); await supabase.from('dropcore_haspels').update({ used_meters: newUsed, status: newUsed >= Number(hData.initial_meters) ? 'habis' : 'tersedia' }).eq('id', dc.id) }
      }
      for (const wh of [...whReturns]) {
        const { data: wData } = await supabase.from('warehouses').select('initial_stock, stock_on_hold').eq('id', wh.id).single()
        if (wData) await supabase.from('warehouses').update({ initial_stock: Number(wData.initial_stock || 0) + Number(wh.qty), stock_on_hold: Math.max(0, Number(wData.stock_on_hold || 0) - Number(wh.qty)) }).eq('id', wh.id)
      }
      for (const wh of whUsed) {
        const { data: wData } = await supabase.from('warehouses').select('stock_on_hold').eq('id', wh.id).single()
        if (wData) await supabase.from('warehouses').update({ stock_on_hold: Math.max(0, Number(wData.stock_on_hold || 0) - Number(wh.qty)) }).eq('id', wh.id)
      }

      toast.success('Laporan berhasil disimpan & stok diperbarui!')
      setIsLaporModalOpen(false)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error('Terjadi kesalahan')
    } finally { setLaporSaving(false) }
  }

  const handleDelete = async (dispatch) => {
    if (!window.confirm('Yakin ingin membatalkan bon ini? Semua stok akan dikembalikan ke gudang.')) return
    const ontR = [], dcR = [], whR = []
    for (const it of dispatch.items) {
      if (it.item_type === 'ont') ontR.push(it.serial_number_id)
      if (it.item_type === 'dropcore') dcR.push(it.haspel_id)
      if (it.item_type === 'other') whR.push({ id: it.warehouse_item_id, qty: it.quantity_dispatched })
    }
    if (ontR.length > 0) await supabase.from('serial_numbers').update({ status: 'tersedia' }).in('id', ontR)
    if (dcR.length > 0) await supabase.from('dropcore_haspels').update({ status: 'tersedia' }).in('id', dcR)
    for (const wh of whR) {
      const { data: wData } = await supabase.from('warehouses').select('initial_stock, stock_on_hold').eq('id', wh.id).single()
      if (wData) await supabase.from('warehouses').update({ initial_stock: Number(wData.initial_stock || 0) + Number(wh.qty), stock_on_hold: Math.max(0, Number(wData.stock_on_hold || 0) - Number(wh.qty)) }).eq('id', wh.id)
    }
    if (dispatch.schedule_id) await supabase.from('technician_schedules').update({ status: 'pending' }).eq('id', dispatch.schedule_id)
    await supabase.from('dispatches').delete().eq('id', dispatch.id)
    toast.success('Bon berhasil dibatalkan')
    fetchData()
  }

  // --- EXPORT ---
  const handleExport = async (monthFilter = '') => {
    setIsExportModalOpen(false)
    try {
      showProgress('Menyiapkan Export', 'Menginisialisasi file Excel...', 10)
      const { applyHeaderStyle, applyDataRowStyles, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Maintory'
      workbook.created = new Date()

      showProgress('Menyiapkan Export', 'Mempersiapkan data...', 20)
      
      const baseData = [...activeDispatches, ...historyDispatches]
      const filteredData = baseData.filter(d => {
        if (!monthFilter) return true
        return d.dispatch_date?.startsWith(monthFilter)
      }).sort((a, b) => new Date(a.dispatch_date) - new Date(b.dispatch_date))

      if (filteredData.length === 0) {
        hideProgress()
        toast.error('Tidak ada data untuk diexport')
        return
      }

      // ===== SHEET 1: Rekap Bon Barang =====
      const ws1 = workbook.addWorksheet('Rekap Bon Barang')
      const headers1 = ['Tanggal', 'Lokasi', 'Teknisi', 'Jumlah Item', 'Status', 'Catatan']
      setColumnWidths(ws1, [14, 20, 32, 14, 16, 30])
      applyHeaderStyle(ws1, headers1, '0369A1') // blue

      for (let i = 0; i < filteredData.length; i++) {
        const d = filteredData[i]
        const techName = getTechNames(d.technicians && d.technicians.length > 0 ? d.technicians : [d.technician_id])
        const site = SITES.find(s => s.value === d.site)?.label || d.site
        const statusLabel = d.status === 'sedang_dibawa' ? 'Sedang Dibawa' : 'Selesai'
        
        ws1.addRow([
          d.dispatch_date,
          site,
          techName,
          d.items?.length || 0,
          statusLabel,
          d.notes || ''
        ])

        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses Rekap Bon Barang... (${i + 1}/${filteredData.length})`, 20 + ((i + 1) / filteredData.length) * 10)
          await new Promise(r => setTimeout(r, 0))
        }
      }
      applyDataRowStyles(ws1)

      // ===== SHEET 2: Detail Barang Dibawa =====
      showProgress('Mengekspor Data', 'Memproses Detail Barang...', 30)
      const ws2 = workbook.addWorksheet('Detail Barang Dibawa')
      const headers2 = ['Tanggal', 'Lokasi', 'Teknisi', 'Jenis Barang', 'Kode / Serial Number', 'Qty Dibawa', 'Qty Terpakai/Sisa', 'Status Bon']
      setColumnWidths(ws2, [14, 20, 32, 16, 26, 14, 20, 16])
      applyHeaderStyle(ws2, headers2, '065F46') // green

      let ws2RowIdx = 2
      for (let i = 0; i < filteredData.length; i++) {
        const d = filteredData[i]
        const techName = getTechNames(d.technicians && d.technicians.length > 0 ? d.technicians : [d.technician_id])
        const site = SITES.find(s => s.value === d.site)?.label || d.site
        const isSelesai = d.status === 'selesai'
        const statusLabel = isSelesai ? 'Selesai' : 'Sedang Dibawa'

        if (!d.items || d.items.length === 0) {
          ws2.addRow([d.dispatch_date, site, techName, '-', '-', '-', '-', statusLabel])
          ws2RowIdx++
        } else {
          d.items.forEach(it => {
            let jenisBarang = ''
            let kode = ''
            let qtyDibawa = `${it.quantity_dispatched || 1}`
            let qtyTerpakai = isSelesai ? '-' : 'Belum Lapor'

            if (it.item_type === 'ont') {
              jenisBarang = 'ONT'
              kode = it.sn?.serial_number || '-'
              qtyDibawa += ' Unit'
              if (isSelesai) qtyTerpakai = it.quantity_used > 0 ? 'Terpakai' : 'Dikembalikan'
            } else if (it.item_type === 'dropcore') {
              jenisBarang = 'Dropcore'
              kode = it.haspel?.haspel_code || '-'
              qtyDibawa += ' Haspel'
              if (isSelesai) qtyTerpakai = `${it.meters_used || 0} Meter Terpakai`
            } else if (it.item_type === 'other') {
              jenisBarang = 'Material Lain'
              kode = it.warehouse_item?.item_name || '-'
              qtyDibawa += ' Unit'
              if (isSelesai) qtyTerpakai = `${it.quantity_used || 0} Dipakai (Sisa: ${it.quantity_returned || 0})`
            }

            ws2.addRow([d.dispatch_date, site, techName, jenisBarang, kode, qtyDibawa, qtyTerpakai, statusLabel])
          })
          ws2RowIdx += d.items.length
        }
        
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses Detail Barang... (${i + 1}/${filteredData.length})`, 30 + ((i + 1) / filteredData.length) * 15)
          await new Promise(r => setTimeout(r, 0))
        }
      }
      applyDataRowStyles(ws2)

      // ===== SHEET 3: Catatan Serial Number =====
      showProgress('Mengekspor Data', 'Memproses Serial Number...', 45)
      const ws3 = workbook.addWorksheet('Catatan Serial Number')
      const headers3 = ['Tanggal', 'Lokasi', 'Teknisi', 'Serial Number', 'Status Terpakai']
      setColumnWidths(ws3, [14, 20, 32, 26, 20])
      applyHeaderStyle(ws3, headers3, '047857') // teal

      for (let i = 0; i < filteredData.length; i++) {
        const d = filteredData[i]
        const techName = getTechNames(d.technicians && d.technicians.length > 0 ? d.technicians : [d.technician_id])
        const site = SITES.find(s => s.value === d.site)?.label || d.site
        const isSelesai = d.status === 'selesai'

        if (d.items && d.items.length > 0) {
          d.items.filter(it => it.item_type === 'ont').forEach(it => {
            const sn = it.sn?.serial_number || '-'
            let status = 'Sedang Dibawa'
            if (isSelesai) {
              status = it.quantity_used > 0 ? 'Terpakai' : 'Dikembalikan'
            }
            ws3.addRow([d.dispatch_date, site, techName, sn, status])
          })
        }
      }
      applyDataRowStyles(ws3)

      // ===== SHEET 4: Catatan Dropcore =====
      showProgress('Mengekspor Data', 'Memproses Dropcore...', 60)
      const ws4 = workbook.addWorksheet('Catatan Dropcore')
      const headers4 = ['Tanggal', 'Lokasi', 'Teknisi', 'Kode Haspel', 'Keterangan', 'Qty Dibawa', 'Meter Terpakai']
      setColumnWidths(ws4, [14, 20, 32, 26, 24, 16, 16])
      applyHeaderStyle(ws4, headers4, 'B45309') // bronze

      for (let i = 0; i < filteredData.length; i++) {
        const d = filteredData[i]
        const techName = getTechNames(d.technicians && d.technicians.length > 0 ? d.technicians : [d.technician_id])
        const site = SITES.find(s => s.value === d.site)?.label || d.site
        const isSelesai = d.status === 'selesai'

        if (d.items && d.items.length > 0) {
          d.items.filter(it => it.item_type === 'dropcore').forEach(it => {
            const haspel = it.haspel?.haspel_code || '-'
            const usedThisDispatch = isSelesai ? (it.meters_used || 0) : 0
            const currentUsed = it.haspel?.used_meters || 0
            // Jika currentUsed sama dengan usedThisDispatch, berarti haspel ini belum dipakai orang lain sblmnya
            const isUtuh = (currentUsed === 0 || currentUsed === usedThisDispatch)
            const ket = isUtuh ? 'Haspel Utuh (1000m)' : 'Sisa Haspel / Potongan'
            const meterTerpakai = isSelesai ? `${usedThisDispatch} m` : '-'
            
            ws4.addRow([d.dispatch_date, site, techName, haspel, ket, `${it.quantity_dispatched || 1} Haspel`, meterTerpakai])
          })
        }
      }
      applyDataRowStyles(ws4)

      // ===== SHEET 5: Rekap Per Item =====
      showProgress('Mengekspor Data', 'Membuat Rekap Per Item...', 75)
      const ws5 = workbook.addWorksheet('Rekap Per Item')
      const headers5 = ['Tanggal', 'Item', 'Total Dibawa', 'Total Terpakai (Khusus Bon Selesai)']
      setColumnWidths(ws5, [14, 35, 18, 32])
      applyHeaderStyle(ws5, headers5, '7C3AED') // purple

      const rekapMap = {}

      for (const d of filteredData) {
        if (!d.items) continue
        const dateStr = d.dispatch_date || ''
        const isSelesai = d.status === 'selesai'

        for (const it of d.items) {
          let itemName = ''
          let qtyDispatched = 0
          let qtyUsed = 0

          if (it.item_type === 'ont') {
            itemName = `ONT: ${it.sn?.serial_number || '-'}`
            qtyDispatched = it.quantity_dispatched || 1
            qtyUsed = isSelesai ? (it.quantity_used || 0) : 0
          } else if (it.item_type === 'dropcore') {
            itemName = `Dropcore` // Group by generic name so total Dropcore is summed
            const usedThisDispatch = isSelesai ? (it.meters_used || 0) : 0
            const currentUsed = it.haspel?.used_meters || 0
            const isUtuh = (currentUsed === 0 || currentUsed === usedThisDispatch)
            
            qtyDispatched = isUtuh ? 1 : 0 // Hanya hitung haspel jika utuh
            qtyUsed = usedThisDispatch // Tetap hitung meternya
          } else if (it.item_type === 'other') {
            itemName = it.warehouse_item?.item_name || '-'
            qtyDispatched = it.quantity_dispatched || 1
            qtyUsed = isSelesai ? (it.quantity_used || 0) : 0
          }

          const key = `${dateStr}||${itemName}||${it.item_type}`
          if (!rekapMap[key]) rekapMap[key] = { date: dateStr, name: itemName, type: it.item_type, dispatched: 0, used: 0 }
          
          rekapMap[key].dispatched += qtyDispatched
          rekapMap[key].used += qtyUsed
        }
      }

      const rekapArray = Object.values(rekapMap).sort((a, b) => a.date.localeCompare(b.date))
      
      for (const r of rekapArray) {
        let dispStr = r.dispatched
        let usedStr = r.used
        if (r.type === 'ont' || r.type === 'other') {
          dispStr += ' Unit'
          usedStr += ' Unit'
        } else if (r.type === 'dropcore') {
          dispStr += ' Haspel'
          usedStr += ' Meter'
        }
        ws5.addRow([r.date, r.name, dispStr, usedStr])
      }
      applyDataRowStyles(ws5)

      showProgress('Menyelesaikan Export', 'Mengunduh file Excel...', 95)
      const filename = monthFilter ? `Bon Barang ${monthFilter}.xlsx` : `Bon Barang Semua ${new Date().toISOString().slice(0, 7)}.xlsx`
      await downloadWorkbook(workbook, filename)
      toast.success('Export berhasil!')
      
    } catch (err) {
      console.error(err)
      toast.error('Gagal export: ' + err.message)
    } finally {
      hideProgress()
    }
  }

  // --- DERIVED DATA ---
  const ontOptions = snList.map(sn => ({ value: sn.id, label: sn.serial_number }))
  const haspelOptions = haspelList.map(h => {
    const sisa = Number(h.initial_meters || 0) - Number(h.used_meters || 0)
    return { value: h.id, label: `${h.haspel_code} (${h.type?.toUpperCase() || ''}) — sisa ${sisa}m`, sisa }
  }).filter(h => h.sisa > 0)
  const otherOptions = otherItems.map(w => ({ value: w.id, label: `${w.item_name} (stok: ${w.initial_stock})` }))

  let activeDispatches = dispatches.filter(d => d.status === 'sedang_dibawa')
  let historyDispatches = dispatches.filter(d => d.status === 'selesai')
  const dispatchedScheduleIds = dispatches.map(d => d.schedule_id).filter(Boolean)
  let pendingSchedules = schedules.filter(s => s.status !== 'completed' && !dispatchedScheduleIds.includes(s.id))

  if (role === 'teknisi') {
    activeDispatches = activeDispatches.filter(d => d.technician_id === profile.id || (d.technicians || []).includes(profile.id))
    historyDispatches = historyDispatches.filter(d => d.technician_id === profile.id || (d.technicians || []).includes(profile.id))
    pendingSchedules = pendingSchedules.filter(s => (s.technicians || []).includes(profile.id))
  }

  const combinedActive = [
    ...activeDispatches.map(d => ({ ...d, _type: 'dispatch' })),
    ...pendingSchedules.map(s => ({ ...s, _type: 'schedule' }))
  ].sort((a, b) => new Date(b.dispatch_date || b.schedule_date) - new Date(a.dispatch_date || a.schedule_date))

  const paginatedCombined = combinedActive.slice((page - 1) * perPage, page * perPage)
  const paginatedHistory = historyDispatches.slice((page - 1) * perPage, page * perPage)
  const paginatedSchedules = schedules.slice((schedPage - 1) * schedPerPage, schedPage * schedPerPage)

  const getTechNames = (techIds = []) => {
    if (!techIds || techIds.length === 0) return '-'
    return techIds.map(tid => technicians.find(t => t.id === tid)?.full_name || tid).filter(Boolean).join(', ')
  }

  const openScheduleModal = () => {
    setScheduleForm({ schedule_date: format(new Date(), 'yyyy-MM-dd'), site: 'banyumas', work_type: 'ikr_psb', technicians: [], note: '' })
    setIsScheduleModalOpen(true)
  }

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h2>Bon Barang</h2>
          <p>Catat barang yang dibawa teknisi ke lapangan &amp; rekam pemakaian aktual</p>
        </div>
        <div className="page-header-right" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={() => setIsExportModalOpen(true)}>
            <Download size={16} /> Export
          </button>
          {(role === 'admin' || role === 'superadmin') && (
            <button className="btn btn-secondary" onClick={openScheduleModal}>
              <CalendarDays size={16} /> Tambah Jadwal
            </button>
          )}
          <button className="btn btn-primary" onClick={() => handleOpenAdd()}>
            <Plus size={16} /> Buat Bon Baru
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Sedang Dibawa', value: activeDispatches.length, icon: <Package size={18} />, color: 'var(--warning)', bg: 'rgba(245,158,11,0.12)' },
          { label: 'Bon Selesai', value: historyDispatches.length, icon: <PackageCheck size={18} />, color: 'var(--success)', bg: 'rgba(16,185,129,0.12)' },
          { label: 'Jadwal Aktif', value: pendingSchedules.length, icon: <CalendarDays size={18} />, color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-card-header">
              <div className="stat-card-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
              <div className="stat-card-value">{s.value}</div>
            </div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Banners */}
      {myTodaySchedule && myTodaySchedule.status !== 'completed' && (
        <div style={{ padding: '14px 16px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '10px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <AlertCircle size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '14px' }}>Jadwal Tugas Hari Ini</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {SITES.find(s => s.value === myTodaySchedule.site)?.label} — {WORK_TYPES.find(w => w.value === myTodaySchedule.work_type)?.label}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => handleOpenAdd(myTodaySchedule)}>
            <Plus size={13} /> Buat Bon
          </button>
        </div>
      )}
      {myPendingSchedules.length > 0 && (
        <div style={{ padding: '14px 16px', background: 'rgba(239,68,68,0.06)', border: '1px solid var(--danger)', borderRadius: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <AlertCircle size={20} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--danger)', fontSize: '14px' }}>Tunggakan Bon Barang</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {myPendingSchedules.length} jadwal tugas belum dibuatkan bon
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {myPendingSchedules.slice(0, 3).map(sched => (
              <button key={sched.id} className="btn btn-sm" style={{ background: 'var(--danger)', color: 'white', border: 'none' }} onClick={() => handleOpenAdd(sched)}>
                Buat Bon {format(new Date(sched.schedule_date), 'dd MMM')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Card */}
      <div className="card">
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {[
            { key: 'sedang_dibawa', label: `Sedang Dibawa (${combinedActive.length})`, icon: <Package size={13} /> },
            { key: 'riwayat', label: `Riwayat (${historyDispatches.length})`, icon: <PackageCheck size={13} /> },
            ...(role === 'admin' || role === 'superadmin' ? [{ key: 'jadwal', label: `Jadwal (${schedules.length})`, icon: <CalendarDays size={13} /> }] : [])
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '12px 16px', background: 'none', border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.key ? 700 : 400, cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap', transition: 'all 0.15s'
            }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div className="card-body">
          {loading ? (
            <div className="flex-center" style={{ height: '180px' }}><div className="spinner" /></div>
          ) : activeTab === 'jadwal' ? (
            /* ===== JADWAL TAB ===== */
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                <button className="btn btn-primary btn-sm" onClick={openScheduleModal}>
                  <Plus size={14} /> Tambah Jadwal
                </button>
              </div>
              {schedules.length > 0 ? (
                <>
                  <div className="desktop-only table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>Lokasi</th>
                          <th>Pekerjaan</th>
                          <th>Tim Teknisi</th>
                          <th>Status</th>
                          <th className="text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedSchedules.map(s => (
                          <tr key={s.id}>
                            <td>{format(new Date(s.schedule_date), 'dd MMM yyyy', { locale: id })}</td>
                            <td>{SITES.find(x => x.value === s.site)?.label}</td>
                            <td>{WORK_TYPES.find(x => x.value === s.work_type)?.label}</td>
                            <td>{getTechNames(s.technicians) || '-'}</td>
                            <td>
                              <span className={`badge ${s.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                                {s.status === 'completed' ? 'Selesai' : 'Belum Dibuat'}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                {s.status !== 'completed' && (
                                  <button className="btn btn-secondary btn-sm" onClick={() => handleOpenAdd(s)} title="Buat Bon"><Plus size={14} /></button>
                                )}
                                {role === 'superadmin' && (
                                  <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDeleteSchedule(s)} title="Hapus"><Trash2 size={14} /></button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mobile-only">
                    <div className="mobile-card-list" style={{ gap: '10px' }}>
                      {paginatedSchedules.map(s => {
                        const isExp = expandedId === `sched-${s.id}`
                        return (
                          <div key={s.id} className="mobile-card" style={{ borderLeft: `4px solid ${s.status === 'completed' ? 'var(--success)' : 'var(--warning)'}` }}>
                            <div className="mobile-card-header" onClick={() => setExpandedId(isExp ? null : `sched-${s.id}`)} style={{ cursor: 'pointer' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="mobile-card-title">{format(new Date(s.schedule_date), 'dd MMM yyyy', { locale: id })}</div>
                                <div className="mobile-card-subtitle" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {SITES.find(x => x.value === s.site)?.label} — {WORK_TYPES.find(x => x.value === s.work_type)?.label}
                                </div>
                              </div>
                              <span className={`badge ${s.status === 'completed' ? 'badge-success' : 'badge-warning'}`} style={{ flexShrink: 0 }}>{s.status === 'completed' ? 'Selesai' : 'Belum Dibuat'}</span>
                            </div>
                            {isExp && (
                              <div className="mobile-card-body">
                                <div className="mobile-info-row"><span className="mobile-info-label">Teknisi</span><span className="mobile-info-value">{getTechNames(s.technicians) || '-'}</span></div>
                                <div className="mobile-info-row"><span className="mobile-info-label">Pekerjaan</span><span className="mobile-info-value">{WORK_TYPES.find(x => x.value === s.work_type)?.label}</span></div>
                                {s.note && <div className="mobile-info-row"><span className="mobile-info-label">Catatan</span><span className="mobile-info-value">{s.note}</span></div>}
                                <div className="mobile-card-actions" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                                  {s.status !== 'completed' && (
                                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => handleOpenAdd(s)}>
                                      <Plus size={13} /> Buat Bon dari Jadwal
                                    </button>
                                  )}
                                  {role === 'superadmin' && (
                                    <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteSchedule(s)}>
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <Pagination page={schedPage} setPage={setSchedPage} perPage={schedPerPage} setPerPage={setSchedPerPage} totalItems={schedules.length} />
                </>
              ) : (
                <div className="empty-state"><CalendarDays size={44} /><h3>Belum Ada Jadwal</h3><p>Klik "Tambah Jadwal" untuk menjadwalkan tugas teknisi.</p></div>
              )}
            </>
          ) : activeTab === 'riwayat' ? (
            /* ===== RIWAYAT TAB ===== */
            <>
              {historyDispatches.length > 0 ? (
                <>
                  <div className="desktop-only table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>Teknisi</th>
                          <th>Lokasi</th>
                          <th>Item</th>
                          <th>Status</th>
                          <th className="text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedHistory.map(d => (
                          <BonTableRow key={d.id} d={d} role={role} getTechNames={getTechNames} SITES={SITES} ITEM_TYPE_COLORS={ITEM_TYPE_COLORS} handleOpenLapor={handleOpenLapor} handleOpenEdit={handleOpenEdit} handleDelete={handleDelete} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mobile-only">
                    <div className="mobile-card-list" style={{ gap: '10px' }}>
                      {paginatedHistory.map(d => <BonCard key={d.id} d={d} role={role} getTechNames={getTechNames} expandedId={expandedId} setExpandedId={setExpandedId} handleOpenLapor={handleOpenLapor} handleOpenEdit={handleOpenEdit} handleDelete={handleDelete} SITES={SITES} ITEM_TYPE_COLORS={ITEM_TYPE_COLORS} />)}
                    </div>
                  </div>
                  <Pagination page={page} setPage={setPage} perPage={perPage} setPerPage={setPerPage} totalItems={historyDispatches.length} />
                </>
              ) : (
                <div className="empty-state"><PackageCheck size={44} /><h3>Belum Ada Riwayat</h3><p>Bon yang sudah selesai dilaporkan akan muncul di sini.</p></div>
              )}
            </>
          ) : (
            /* ===== SEDANG DIBAWA TAB ===== */
            <>
              {combinedActive.length > 0 ? (
                <>
                  <div className="desktop-only table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>Teknisi</th>
                          <th>Lokasi / Pekerjaan</th>
                          <th>Item</th>
                          <th>Status</th>
                          <th className="text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedCombined.map(item => {
                          if (item._type === 'schedule') {
                            return (
                              <tr key={`ps-${item.id}`}>
                                <td>{format(new Date(item.schedule_date), 'dd MMM yyyy', { locale: id })}</td>
                                <td><span style={{ color: 'var(--text-secondary)' }}>{getTechNames(item.technicians) || 'Belum dipilih'}</span></td>
                                <td>
                                  <div>{SITES.find(s => s.value === item.site)?.label || item.site}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{WORK_TYPES.find(w => w.value === item.work_type)?.label}</div>
                                </td>
                                <td><span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Belum dibuat bon</span></td>
                                <td><span className="badge badge-warning">Belum Dibuat</span></td>
                                <td>
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                    <button className="btn btn-primary btn-sm" onClick={() => handleOpenAdd(item)}><Plus size={14} /> Buat Bon</button>
                                  </div>
                                </td>
                              </tr>
                            )
                          }
                          return <BonTableRow key={item.id} d={item} role={role} getTechNames={getTechNames} SITES={SITES} ITEM_TYPE_COLORS={ITEM_TYPE_COLORS} handleOpenLapor={handleOpenLapor} handleOpenEdit={handleOpenEdit} handleDelete={handleDelete} />
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mobile-only">
                    <div className="mobile-card-list" style={{ gap: '10px' }}>
                      {paginatedCombined.map(item => {
                        if (item._type === 'schedule') {
                          const isExp = expandedId === `ps-${item.id}`
                          return (
                            <div key={`ps-${item.id}`} className="mobile-card" style={{ borderLeft: '4px solid var(--warning)' }}>
                              <div className="mobile-card-header" onClick={() => setExpandedId(isExp ? null : `ps-${item.id}`)} style={{ cursor: 'pointer' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="mobile-card-title">{format(new Date(item.schedule_date), 'dd MMM yyyy', { locale: id })}</div>
                                  <div className="mobile-card-subtitle">{getTechNames(item.technicians) || 'Belum dipilih'}</div>
                                </div>
                                <span className="badge badge-warning" style={{ flexShrink: 0 }}>Belum Dibuat</span>
                              </div>
                              {isExp && (
                                <div className="mobile-card-body">
                                  <div className="mobile-info-row"><span className="mobile-info-label">Lokasi</span><span className="mobile-info-value">{SITES.find(s => s.value === item.site)?.label || item.site}</span></div>
                                  <div className="mobile-info-row"><span className="mobile-info-label">Pekerjaan</span><span className="mobile-info-value">{WORK_TYPES.find(w => w.value === item.work_type)?.label}</span></div>
                                  {item.note && <div className="mobile-info-row"><span className="mobile-info-label">Catatan</span><span className="mobile-info-value">{item.note}</span></div>}
                                  <div className="mobile-card-actions" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => handleOpenAdd(item)}><Plus size={13} /> Buat Bon dari Jadwal Ini</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        }
                        return <BonCard key={item.id} d={item} role={role} getTechNames={getTechNames} expandedId={expandedId} setExpandedId={setExpandedId} handleOpenLapor={handleOpenLapor} handleOpenEdit={handleOpenEdit} handleDelete={handleDelete} SITES={SITES} ITEM_TYPE_COLORS={ITEM_TYPE_COLORS} />
                      })}
                    </div>
                  </div>
                  <Pagination page={page} setPage={setPage} perPage={perPage} setPerPage={setPerPage} totalItems={combinedActive.length} />
                </>
              ) : (
                <div className="empty-state"><ClipboardList size={44} /><h3>Tidak Ada Yang Perlu Dikerjakan</h3><p>Semua jadwal sudah selesai atau belum ada bon yang aktif.</p></div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===== MODAL TAMBAH JADWAL ===== */}
      {isScheduleModalOpen && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <div><h3 style={{ margin: 0 }}>Tambah Jadwal Tim Teknisi</h3><p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Jadwal akan muncul sebagai notifikasi bagi teknisi</p></div>
              <button className="btn-icon" onClick={() => setIsScheduleModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Tanggal Tugas <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="date" className="form-input" value={scheduleForm.schedule_date} onChange={e => setScheduleForm(f => ({ ...f, schedule_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Lokasi / Site <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-input" style={{ height: 'auto' }} value={scheduleForm.site} onChange={e => setScheduleForm(f => ({ ...f, site: e.target.value }))}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Jenis Pekerjaan</label>
                <select className="form-input" style={{ height: 'auto' }} value={scheduleForm.work_type} onChange={e => setScheduleForm(f => ({ ...f, work_type: e.target.value }))}>
                  {WORK_TYPES.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Anggota Tim Teknisi <span style={{ color: 'var(--danger)' }}>*</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {technicians.map(t => (
                    <button key={t.id} type="button" onClick={() => toggleScheduleTech(t.id)} className={`badge ${scheduleForm.technicians.includes(t.id) ? 'badge-accent' : 'badge-muted'}`} style={{ border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: '13px' }}>
                      {scheduleForm.technicians.includes(t.id) ? '✓ ' : ''}{t.full_name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Catatan</label>
                <textarea className="form-input" rows={2} placeholder="Keterangan jadwal (opsional)..." value={scheduleForm.note} onChange={e => setScheduleForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsScheduleModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSaveSchedule} disabled={schedSaving}>{schedSaving ? '...' : 'Simpan Jadwal'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL BUAT BON ===== */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal modal-lg" style={{ display: 'flex', flexDirection: 'column', maxHeight: '93vh' }}>
            <div className="modal-header">
              <div><h3 style={{ margin: 0 }}>{editingDispatchId ? 'Edit Bon Barang' : 'Buat Bon Barang'}{selectedScheduleId && !editingDispatchId ? ' (dari Jadwal)' : ''}</h3><p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Catat barang yang akan dibawa ke lapangan</p></div>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tanggal</label>
                  <input type="date" className="form-input" value={form.dispatch_date} onChange={e => setForm({ ...form, dispatch_date: e.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">Teknisi (Bisa lebih dari 1) <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <Select 
                    isMulti
                    options={technicians} 
                    value={technicians.filter(t => form.technicians.includes(t.id))} 
                    onChange={vals => setForm({ ...form, technicians: vals ? vals.map(v => v.id) : [] })} 
                    placeholder="Pilih teknisi..." 
                    menuPortalTarget={document.body} menuPosition="fixed" 
                    styles={{ control: (b) => ({ ...b, minHeight: '40px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }), menuPortal: (b) => ({ ...b, zIndex: 9999 }), menu: (b) => ({ ...b, background: 'var(--bg-card)', border: '1px solid var(--border)' }), option: (b, s) => ({ ...b, background: s.isFocused ? 'var(--bg-hover)' : 'var(--bg-card)', color: 'var(--text-primary)' }), multiValue: (b) => ({ ...b, background: 'var(--accent-dim)' }), multiValueLabel: (b) => ({ ...b, color: 'var(--accent)' }) }} 
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Lokasi</label>
                  <select className="form-input" value={form.site} onChange={e => setForm({ ...form, site: e.target.value })}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label className="form-label">Catatan</label>
                  <input type="text" className="form-input" placeholder="Opsional..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
                </div>
              </div>

              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>Daftar Barang Dibawa</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => addItemType('ont')}><Plus size={13} /> ONT</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => addItemType('dropcore')}><Plus size={13} /> Dropcore</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => addItemType('other')}><Plus size={13} /> Material</button>
                  </div>
                </div>
                {form.items.length === 0 ? (
                  <div style={{ padding: '28px', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '13px' }}>Klik tombol di atas untuk menambahkan barang</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {form.items.map((item, idx) => (
                      <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: ITEM_TYPE_COLORS[item.item_type] }} /><span style={{ fontWeight: 600, fontSize: '13px' }}>{ITEM_TYPE_LABELS[item.item_type]} #{idx + 1}</span></div>
                          <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px', display: 'flex' }}><Trash2 size={15} /></button>
                        </div>
                        <div style={{ padding: '12px 14px' }}>
                          {item.item_type === 'ont' && <Select isMulti options={ontOptions} placeholder="Pilih Serial Number ONT..." value={item.selected_onts || []} onChange={val => updateItem(item.id, 'selected_onts', val)} menuPortalTarget={document.body} menuPosition="fixed" styles={{ control: (b) => ({ ...b, background: 'var(--bg-card)', border: '1px solid var(--border)' }), menuPortal: (b) => ({ ...b, zIndex: 9999 }), menu: (b) => ({ ...b, background: 'var(--bg-card)', border: '1px solid var(--border)' }), option: (b, s) => ({ ...b, background: s.isFocused ? 'var(--bg-hover)' : 'var(--bg-card)', color: 'var(--text-primary)' }), multiValue: (b) => ({ ...b, background: 'var(--accent-dim)' }), multiValueLabel: (b) => ({ ...b, color: 'var(--accent)' }) }} />}
                          {item.item_type === 'dropcore' && <Select isMulti options={haspelOptions} placeholder="Pilih Haspel Dropcore..." value={item.selected_haspels || []} onChange={val => updateItem(item.id, 'selected_haspels', val)} menuPortalTarget={document.body} menuPosition="fixed" styles={{ control: (b) => ({ ...b, background: 'var(--bg-card)', border: '1px solid var(--border)' }), menuPortal: (b) => ({ ...b, zIndex: 9999 }), menu: (b) => ({ ...b, background: 'var(--bg-card)', border: '1px solid var(--border)' }), option: (b, s) => ({ ...b, background: s.isFocused ? 'var(--bg-hover)' : 'var(--bg-card)', color: 'var(--text-primary)' }), multiValue: (b) => ({ ...b, background: 'var(--accent-dim)' }), multiValueLabel: (b) => ({ ...b, color: 'var(--accent)' }) }} />}
                          {item.item_type === 'other' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <Select isMulti options={otherOptions} placeholder="Pilih Material..." value={item.selected_others || []} onChange={val => updateItem(item.id, 'selected_others', val)} menuPortalTarget={document.body} menuPosition="fixed" styles={{ control: (b) => ({ ...b, background: 'var(--bg-card)', border: '1px solid var(--border)' }), menuPortal: (b) => ({ ...b, zIndex: 9999 }), menu: (b) => ({ ...b, background: 'var(--bg-card)', border: '1px solid var(--border)' }), option: (b, s) => ({ ...b, background: s.isFocused ? 'var(--bg-hover)' : 'var(--bg-card)', color: 'var(--text-primary)' }), multiValue: (b) => ({ ...b, background: 'var(--accent-dim)' }), multiValueLabel: (b) => ({ ...b, color: 'var(--accent)' }) }} />
                              {(item.selected_others || []).map(opt => (
                                <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', background: 'var(--bg-primary)', borderRadius: '6px' }}>
                                  <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-secondary)' }}>{opt.label}</span>
                                  <input type="number" className="form-input" style={{ width: '75px', height: '32px', textAlign: 'center' }} min="1" placeholder="Qty" value={item.other_quantities?.[opt.value] || ''} onChange={e => updateItem(item.id, 'other_quantities', { ...item.other_quantities, [opt.value]: Number(e.target.value) })} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button><button className="btn btn-primary" disabled={saving} onClick={handleSaveBon}>{saving ? 'Menyimpan...' : 'Simpan Bon & Kunci Stok'}</button></div>
          </div>
        </div>
      )}

      {/* ===== MODAL LAPOR PEMAKAIAN ===== */}
      {isLaporModalOpen && selectedDispatch && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '540px', maxWidth: '96%', maxHeight: '93vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div><h3 style={{ margin: 0 }}>Lapor Pemakaian</h3><p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>{getTechNames(selectedDispatch.technicians && selectedDispatch.technicians.length > 0 ? selectedDispatch.technicians : [selectedDispatch.technician_id])} · {format(new Date(selectedDispatch.dispatch_date), 'dd MMM yyyy', { locale: id })}</p></div>
              <button className="btn-close" onClick={() => setIsLaporModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '13px', color: 'var(--text-secondary)' }}>💡 Centang / isi barang yang <strong>benar-benar terpakai</strong>. Sisa otomatis dikembalikan ke gudang.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {selectedDispatch.items.map((it) => (
                  <div key={it.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: ITEM_TYPE_COLORS[it.item_type] }} /><span style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.3px', color: ITEM_TYPE_COLORS[it.item_type] }}>{ITEM_TYPE_LABELS[it.item_type]}</span>
                    </div>
                    <div style={{ padding: '12px 14px' }}>
                      {it.item_type === 'ont' && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                          <div><div style={{ fontWeight: 600 }}>{it.sn?.serial_number || '-'}</div><div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Centang jika terpasang</div></div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: laporForm[it.id]?.used ? 'rgba(16,185,129,0.1)' : 'var(--bg-primary)' }}>
                            <input type="checkbox" checked={laporForm[it.id]?.used || false} onChange={e => setLaporForm({ ...laporForm, [it.id]: { used: e.target.checked } })} style={{ width: '16px', height: '16px', accentColor: 'var(--success)' }} />
                            <span style={{ fontSize: '13px', fontWeight: 600, color: laporForm[it.id]?.used ? 'var(--success)' : 'var(--text-secondary)' }}>{laporForm[it.id]?.used ? 'Terpakai ✓' : 'Kembali'}</span>
                          </label>
                        </div>
                      )}
                      {it.item_type === 'dropcore' && (
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: '8px' }}>{it.haspel?.haspel_code || '-'}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}><span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Meter terpakai:</span><input type="number" className="form-input" style={{ width: '100px', height: '36px', textAlign: 'center' }} min="0" placeholder="0" value={laporForm[it.id]?.meters_used || ''} onChange={e => setLaporForm({ ...laporForm, [it.id]: { meters_used: e.target.value } })} /><span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>meter</span></div>
                        </div>
                      )}
                      {it.item_type === 'other' && (
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: '8px' }}>{it.warehouse_item?.item_name || 'Barang'}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Qty terpakai:</span><input type="number" className="form-input" style={{ width: '75px', height: '36px', textAlign: 'center' }} min="0" max={it.quantity_dispatched} placeholder="0" value={laporForm[it.id]?.qty_used || ''} onChange={e => setLaporForm({ ...laporForm, [it.id]: { qty_used: e.target.value } })} /><span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>dari {it.quantity_dispatched}</span>
                            {Number(laporForm[it.id]?.qty_used || 0) < Number(it.quantity_dispatched) && (
                              <span style={{ fontSize: '12px', color: 'var(--success)', marginLeft: 'auto' }}>{Number(it.quantity_dispatched) - Number(laporForm[it.id]?.qty_used || 0)} kembali</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setIsLaporModalOpen(false)}>Batal</button><button className="btn btn-primary" disabled={laporSaving} onClick={handleSaveLapor}>{laporSaving ? '...' : '✓ Selesaikan'}</button></div>
          </div>
        </div>
      )}

      {/* ===== MODAL EXPORT ===== */}
      {isExportModalOpen && (
        <div className="modal-overlay" onClick={() => setIsExportModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Export Bon Barang</h3><button className="btn-icon" onClick={() => setIsExportModalOpen(false)}><X size={18} /></button></div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>Export riwayat bon barang yang sudah selesai ke file Excel.</p>
              <div className="form-group">
                <label className="form-label">Pilih Bulan (opsional)</label>
                <select className="form-input" value={exportMonth} onChange={e => setExportMonth(e.target.value)}>
                  <option value="">Semua Data</option>
                  {Array.from({ length: 12 }).map((_, i) => { const d = new Date(); d.setMonth(d.getMonth() - i); const val = format(d, 'yyyy-MM'); return <option key={val} value={val}>{format(d, 'MMMM yyyy', { locale: id })}</option> })}
                </select>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>{exportMonth ? `Export bulan: ${exportMonth}` : 'Kosongkan untuk export semua data'}</div>
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setIsExportModalOpen(false)}>Batal</button><button className="btn btn-primary" onClick={() => handleExport(exportMonth)}><Download size={15} /> Export</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

// Reusable Components
function BonTableRow({ d, role, getTechNames, SITES, ITEM_TYPE_COLORS, handleOpenLapor, handleOpenEdit, handleDelete }) {
  const techName = getTechNames(d.technicians && d.technicians.length > 0 ? d.technicians : [d.technician_id])
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{format(new Date(d.dispatch_date), 'dd MMM yyyy', { locale: id })}</div>
      </td>
      <td>
        <div style={{ color: 'var(--accent)', fontWeight: 500 }}>{techName}</div>
      </td>
      <td>
        <div>{SITES.find(s => s.value === d.site)?.label || d.site}</div>
        {d.notes && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{d.notes}</div>}
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {(d.items || []).slice(0, 3).map((it, i) => {
            let name = ''
            if (it.item_type === 'ont') name = it.sn?.serial_number || '-'
            else if (it.item_type === 'dropcore') name = it.haspel?.haspel_code || '-'
            else if (it.item_type === 'other') name = it.warehouse_item?.item_name || 'Barang'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: ITEM_TYPE_COLORS[it.item_type], flexShrink: 0 }} />
                <span>{name}</span>
              </div>
            )
          })}
          {(d.items?.length || 0) > 3 && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+ {(d.items?.length || 0) - 3} item lainnya</div>}
        </div>
      </td>
      <td>
        <span className={`badge ${d.status === 'sedang_dibawa' ? 'badge-warning' : 'badge-success'}`}>
          {d.status === 'sedang_dibawa' ? 'Dibawa' : 'Selesai'}
        </span>
      </td>
      <td>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
          {d.status === 'sedang_dibawa' && <button className="btn btn-primary btn-sm" onClick={() => handleOpenLapor(d)}><CheckCircle size={14} /> Lapor</button>}
          {d.status === 'sedang_dibawa' && role === 'superadmin' && <button className="btn btn-secondary btn-sm" style={{ color: 'var(--warning)' }} onClick={() => handleOpenEdit(d)} title="Edit"><Edit2 size={14} /></button>}
          {(role === 'superadmin' || role === 'admin') && <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(d)} title="Batalkan"><Trash2 size={14} /></button>}
        </div>
      </td>
    </tr>
  )
}

function BonCard({ d, role, getTechNames, expandedId, setExpandedId, handleOpenLapor, handleOpenEdit, handleDelete, SITES, ITEM_TYPE_COLORS }) {
  const isExpanded = expandedId === d.id
  const techName = getTechNames(d.technicians && d.technicians.length > 0 ? d.technicians : [d.technician_id])
  return (
    <div className="mobile-card" style={{ borderLeft: `4px solid ${d.status === 'sedang_dibawa' ? 'var(--warning)' : 'var(--success)'}` }}>
      <div className="mobile-card-header" onClick={() => setExpandedId(isExpanded ? null : d.id)} style={{ cursor: 'pointer' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mobile-card-title">{format(new Date(d.dispatch_date), 'dd MMM yyyy', { locale: id })}</div>
          <div className="mobile-card-subtitle" style={{ fontWeight: 600, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{techName}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
          <span className={`badge ${d.status === 'sedang_dibawa' ? 'badge-warning' : 'badge-success'}`}>{d.status === 'sedang_dibawa' ? 'Dibawa' : 'Selesai'}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.items?.length || 0} item</span>
        </div>
      </div>
      {isExpanded && (
        <div className="mobile-card-body">
          <div className="mobile-info-row"><span className="mobile-info-label">Lokasi</span><span className="mobile-info-value">{SITES.find(s => s.value === d.site)?.label || d.site}</span></div>
          {d.notes && <div className="mobile-info-row"><span className="mobile-info-label">Catatan</span><span className="mobile-info-value">{d.notes}</span></div>}
          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Daftar Barang</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {d.items?.map((it, i) => {
                let name = '', detail = '', badge = null
                if (it.item_type === 'ont') { name = it.sn?.serial_number || '-'; if (d.status === 'selesai') badge = it.quantity_used > 0 ? <span className="badge badge-danger" style={{ fontSize: '10px', padding: '1px 5px' }}>Terpakai</span> : <span className="badge badge-success" style={{ fontSize: '10px', padding: '1px 5px' }}>Kembali</span> }
                else if (it.item_type === 'dropcore') { name = it.haspel?.haspel_code || '-'; if (d.status === 'selesai') detail = `${it.meters_used}m terpakai` }
                else if (it.item_type === 'other') { name = it.warehouse_item?.item_name || 'Barang'; detail = d.status === 'selesai' ? `${it.quantity_used} terpakai` : `× ${it.quantity_dispatched}` }
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', background: 'var(--bg-primary)', borderRadius: '6px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: ITEM_TYPE_COLORS[it.item_type], flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    {detail && <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flexShrink: 0 }}>{detail}</span>}{badge}
                  </div>
                )
              })}
            </div>
          </div>
          {d.status === 'sedang_dibawa' && (
            <div className="mobile-card-actions" style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
              <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => handleOpenLapor(d)}><CheckCircle size={13} /> Lapor Pemakaian</button>
              {role === 'superadmin' && <button className="btn btn-secondary btn-sm" style={{ color: 'var(--warning)' }} onClick={() => handleOpenEdit(d)} title="Edit"><Edit2 size={13} /></button>}
              {(role === 'superadmin' || role === 'admin') && <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(d)} title="Batalkan"><Trash2 size={13} /></button>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

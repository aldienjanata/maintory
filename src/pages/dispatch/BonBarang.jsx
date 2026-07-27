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
  { value: 'ikr_psb', label: 'IKR / PSB' },
  { value: 'mt', label: 'Maintenance' },
  { value: 'pt2', label: 'PT2 / PT3' },
  { value: 'odc_odp', label: 'Instalasi ODC/ODP' }
]

// Helper function to check if item requires maps URL
const isItemRequiresLocation = (itemName) => {
  if (!itemName) return false
  const name = itemName.toLowerCase().trim()
  if (name.includes('tiang')) return true
  const reqList = ['odp 1:16 komplit', 'splitter 1:16', 'splitter 1:8', 'passive splitter 1:8', 'passive splitter 1:2', 'passive splitter 1:16']
  return reqList.some(r => name === r)
}

const ITEM_TYPE_LABELS = { ont: 'ONT', dropcore: 'Dropcore', adss: 'Kabel ADSS', tiang: 'Tiang', other: 'Material Lain' }
const ITEM_TYPE_COLORS = { ont: 'var(--accent)', dropcore: 'var(--warning)', adss: 'var(--purple)', tiang: '#e67e22', other: 'var(--success)' }

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
  const [allUsers, setAllUsers] = useState([])
  const [snList, setSnList] = useState([])
  const [haspelList, setHaspelList] = useState([])
  const [adssList, setAdssList] = useState([])
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
    technicians: [],
    work_type: 'ikr_psb',
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
  const [exportTeam, setExportTeam] = useState('')
  const [detailDispatch, setDetailDispatch] = useState(null)

  // Modal: Tambah Susulan
  const [isSusulanModalOpen, setIsSusulanModalOpen] = useState(false)
  const [susulanForm, setSusulanForm] = useState({ items: [] })
  const [susulanSaving, setSusulanSaving] = useState(false)

  // Modal: Confirm
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null })

  useEffect(() => { fetchData() }, [])
  useEffect(() => { setPage(1) }, [activeTab])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [dispRes, schedRes, techRes, snRes, haspelRes, adssRes, otherRes] = await Promise.all([
        supabase
          .from('dispatches')
          .select('*, items:dispatch_items(*, sn:serial_numbers(serial_number), haspel:dropcore_haspels(*), adss:adss_haspels(*), warehouse_item:warehouses(item_name))')
          .order('created_at', { ascending: false }),
        supabase.from('technician_schedules').select('*').order('schedule_date', { ascending: false }),
        supabase.from('users').select('id, full_name, role').in('role', ['admin', 'teknisi', 'backbone']).eq('is_active', true),
        supabase.from('serial_numbers').select('id, serial_number').eq('status', 'tersedia'),
        supabase.from('dropcore_haspels').select('id, haspel_code, initial_meters, used_meters, type').in('status', ['tersedia']),
        supabase.from('adss_haspels').select('id, haspel_code, initial_meters, used_meters, type, tube_type, brand').in('status', ['tersedia']),
        supabase.from('warehouses').select('id, item_name, initial_stock').gt('initial_stock', 0)
      ])

      if (techRes.data) {
        const users = techRes.data
        setAllUsers(users)
        if (dispRes.data) {
          if (profile.role === 'backbone') {
            const backboneIds = users.filter(u => u.role === 'backbone').map(u => u.id)
            setDispatches(dispRes.data.filter(d => backboneIds.includes(d.created_by)))
          } else {
            setDispatches(dispRes.data)
          }
        }
        
        let filteredTechs = users
        if (profile.role === 'backbone') {
          filteredTechs = users.filter(u => u.role === 'backbone')
        }
        setTechnicians(filteredTechs.map(t => ({ value: t.id, label: t.full_name, id: t.id, full_name: t.full_name })))
      } else if (dispRes.data) {
         setDispatches(dispRes.data)
      }
      if (snRes.data) setSnList(snRes.data)
      if (haspelRes.data) setHaspelList(haspelRes.data)
      if (adssRes.data) setAdssList(adssRes.data)
      if (otherRes.data) setOtherItems(otherRes.data)

      if (schedRes.data) {
        let allScheds = schedRes.data || []
        
        if (profile.role === 'backbone' && techRes.data) {
           const backboneIds = techRes.data.filter(u => u.role === 'backbone').map(u => u.id)
           allScheds = allScheds.filter(s => s.technicians?.some(t => backboneIds.includes(t)))
        }

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

  const handleDeleteSchedule = (sched) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Jadwal',
      message: 'Yakin ingin menghapus jadwal ini?',
      onConfirm: async () => {
        setConfirmModal({ isOpen: false, onConfirm: null })
        await supabase.from('technician_schedules').delete().eq('id', sched.id)
        toast.success('Jadwal dihapus')
        fetchData()
      }
    })
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
      work_type: sched ? sched.work_type : 'ikr_psb',
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
    const adsss = dispatch.items.filter(i => i.item_type === 'adss')
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
    if (adsss.length > 0) {
      newItems.push({
        id: 'edit_adss',
        item_type: 'adss',
        selected_adss: adsss.map(a => ({ value: a.adss_id, label: a.adss?.haspel_code }))
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
      work_type: dispatch.work_type || 'ikr_psb',
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
        } else if (item.item_type === 'adss') {
          (item.selected_adss || []).forEach(opt => { itemsToInsert.push({ item_type: 'adss', adss_id: opt.value, quantity_dispatched: 1, adss_lokasi_url: item.adss_lokasi_url || null, adss_titik_awal: item.adss_titik_awal || null, adss_titik_akhir: item.adss_titik_akhir || null }) })
        } else if (item.item_type === 'tiang') {
          const qty = Number(item.tiang_jumlah) || 1
          itemsToInsert.push({ item_type: 'tiang', quantity_dispatched: qty, tiang_tujuan: item.tiang_tujuan || null, tiang_lokasi_url: item.tiang_lokasi_url || null })
        } else if (item.item_type === 'other') {
          (item.selected_others || []).forEach(opt => {
            const qty = item.other_quantities?.[opt.value] || 1
            if (qty > 0) { itemsToInsert.push({ item_type: 'other', warehouse_item_id: opt.value, quantity_dispatched: qty }); whUpdates.push({ id: opt.value, qty }) }
          })
        }
      }
      if (itemsToInsert.length === 0) { toast.error('Belum ada item valid yang dipilih'); setSaving(false); return }

      const dispatchPayload = {
        dispatch_date: form.dispatch_date,
        technician_id: form.technicians[0], 
        technicians: form.technicians,
        site: form.site,
        work_type: form.work_type,
        notes: form.note,
        status: 'sedang_dibawa',
        created_by: profile.id
      }
      if (selectedScheduleId) dispatchPayload.schedule_id = selectedScheduleId

      if (editingDispatchId) {
        const oldDispatch = dispatches.find(d => d.id === editingDispatchId)
        if (oldDispatch) {
          const oldOnt = [], oldDc = [], oldAdss = [], oldWh = []
          for (const it of oldDispatch.items) {
            if (it.item_type === 'ont') oldOnt.push(it.serial_number_id)
            if (it.item_type === 'dropcore') oldDc.push(it.haspel_id)
            if (it.item_type === 'adss') oldAdss.push(it.adss_id)
            if (it.item_type === 'other') oldWh.push({ id: it.warehouse_item_id, qty: it.quantity_dispatched })
          }
          if (oldOnt.length > 0) await supabase.from('serial_numbers').update({ status: 'tersedia' }).in('id', oldOnt)
          if (oldDc.length > 0) await supabase.from('dropcore_haspels').update({ status: 'tersedia' }).in('id', oldDc)
          if (oldAdss.length > 0) await supabase.from('adss_haspels').update({ status: 'tersedia' }).in('id', oldAdss)
          for (const wh of oldWh) {
            const { data: wData } = await supabase.from('warehouses').select('initial_stock, stock_on_hold').eq('id', wh.id).single()
            if (wData) {
              await supabase.from('warehouses').update({ 
                initial_stock: Number(wData.initial_stock || 0) + Number(wh.qty), 
                stock_on_hold: Math.max(0, Number(wData.stock_on_hold || 0) - Number(wh.qty)) 
              }).eq('id', wh.id)
            }
          }
          
          await supabase.from('dispatch_items').delete().eq('dispatch_id', editingDispatchId)
          
          await supabase.from('dispatches').update({
            dispatch_date: form.dispatch_date,
            technician_id: form.technicians[0],
            technicians: form.technicians,
            site: form.site,
            work_type: form.work_type,
            notes: form.note,
            schedule_id: selectedScheduleId || null
          }).eq('id', editingDispatchId)

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
      else if (it.item_type === 'adss') initForm[it.id] = { meters_used: '', titik_awal: it.adss_titik_awal || '', titik_akhir: it.adss_titik_akhir || '' }
      else if (it.item_type === 'other') {
        const reqLoc = isItemRequiresLocation(it.warehouse_item?.item_name)
        initForm[it.id] = { qty_used: '', ...(reqLoc ? { share_lokasi: it.tiang_lokasi_url || '' } : {}) }
      }
    })
    setLaporForm(initForm)
    setIsLaporModalOpen(true)
  }

  const handleSaveLapor = async () => {
    setLaporSaving(true)
    try {
      for (const it of selectedDispatch.items) {
        const lapor = laporForm[it.id]
        if (it.item_type === 'other') {
          const reqLoc = isItemRequiresLocation(it.warehouse_item?.item_name)
          const qUsed = Number(lapor?.qty_used || 0)
          if (reqLoc && qUsed > 0) {
            const urls = (lapor?.share_lokasi || '').split(/(?=https?:\/\/)/gi).map(u => u.trim().replace(/,$/, '')).filter(Boolean)
            if (urls.length !== qUsed) {
              toast.error(`Barang "${it.warehouse_item?.item_name}" terpakai ${qUsed}, mohon sertakan tepat ${qUsed} link URL Maps yang dipisahkan dengan spasi/koma.`)
              setLaporSaving(false)
              return
            }
          }
        }
        if (it.item_type === 'adss') {
          const meters = Number(lapor?.meters_used || 0)
          if (meters > 0) {
            if (!lapor?.titik_awal?.trim()) {
              toast.error(`Titik Awal Penarikan ADSS (${it.adss?.haspel_code || ''}) wajib diisi!`)
              setLaporSaving(false)
              return
            }
            if (!lapor?.titik_akhir?.trim()) {
              toast.error(`Titik Akhir Penarikan ADSS (${it.adss?.haspel_code || ''}) wajib diisi!`)
              setLaporSaving(false)
              return
            }
          }
        }
      }

      for (const it of selectedDispatch.items) {
        const lapor = laporForm[it.id]
        if (it.item_type === 'other') {
          const qUsed = Number(lapor?.qty_used || 0)
          const qDisp = Number(it.quantity_dispatched || 0)
          if (qUsed > qDisp) {
            toast.error(`Pemakaian ${it.warehouse_item?.item_name || 'barang'} (${qUsed}) melebihi jumlah yang dibawa (${qDisp})!`)
            setLaporSaving(false)
            return
          }
        }
        if (it.item_type === 'dropcore' || it.item_type === 'adss') {
          const isAdss = it.item_type === 'adss'
          const label = isAdss ? 'ADSS' : 'Dropcore'
          const haspel = isAdss ? it.adss : it.haspel
          const meters = Number(lapor?.meters_used || 0)
          const sisaMeter = Number(haspel?.initial_meters || 0) - Number(haspel?.used_meters || 0)
          if (meters > sisaMeter) {
            toast.error(`Meter terpakai untuk ${haspel?.haspel_code || label} (${meters}m) melebihi sisa yang tersedia (${sisaMeter}m)!`)
            setLaporSaving(false)
            return
          }
        }
      }

      const expItemsToInsert = [], dispatchUpdates = []
      const ontReturns = [], ontUsed = [], dcUpdates = [], adssUpdates = [], whReturns = [], whUsed = []

      for (const it of selectedDispatch.items) {
        const lapor = laporForm[it.id]
        if (it.item_type === 'ont') {
          const used = lapor?.used || false
          dispatchUpdates.push({ id: it.id, quantity_used: used ? 1 : 0, quantity_returned: used ? 0 : 1 })
          if (used) { ontUsed.push(it.serial_number_id); expItemsToInsert.push({ item_type: 'ont', serial_number_id: it.serial_number_id, quantity: 1 }) }
          else ontReturns.push(it.serial_number_id)
        } else if (it.item_type === 'dropcore') {
          const meters = Number(lapor?.meters_used || 0)
          const isReturned = meters === 0
          dispatchUpdates.push({ id: it.id, meters_used: meters, quantity_returned: isReturned ? 1 : 0 })
          if (meters > 0) expItemsToInsert.push({ item_type: 'dropcore', haspel_id: it.haspel_id, meters_used: meters, quantity: 1 })
          dcUpdates.push({ id: it.haspel_id, add_meters: meters })
        } else if (it.item_type === 'adss') {
          const meters = Number(lapor?.meters_used || 0)
          const isReturned = meters === 0
          const adssUpdate = { id: it.id, meters_used: meters, quantity_returned: isReturned ? 1 : 0 }
          if (lapor?.titik_awal) adssUpdate.adss_titik_awal = lapor.titik_awal
          if (lapor?.titik_akhir) adssUpdate.adss_titik_akhir = lapor.titik_akhir
          dispatchUpdates.push(adssUpdate)
          if (meters > 0) expItemsToInsert.push({ item_type: 'adss', adss_id: it.adss_id, meters_used: meters, quantity: 1 })
          adssUpdates.push({ id: it.adss_id, add_meters: meters })
        } else if (it.item_type === 'other') {
          const qUsed = Number(lapor?.qty_used || 0)
          const qRet = Number(it.quantity_dispatched) - qUsed
          dispatchUpdates.push({ id: it.id, quantity_used: qUsed, quantity_returned: qRet, ...(lapor?.share_lokasi ? { tiang_lokasi_url: lapor.share_lokasi } : {}) })
          if (qUsed > 0) { expItemsToInsert.push({ item_type: 'other', warehouse_item_id: it.warehouse_item_id, quantity: qUsed }); whUsed.push({ id: it.warehouse_item_id, qty: qUsed }) }
          if (qRet > 0) whReturns.push({ id: it.warehouse_item_id, qty: qRet })
        }
      }

      if (expItemsToInsert.length > 0) {
        const { data: expData, error: expErr } = await supabase.from('daily_expenses').insert({
          expense_date: format(new Date(), 'yyyy-MM-dd'),
          site: selectedDispatch.site,
          technicians: selectedDispatch.technicians && selectedDispatch.technicians.length > 0 ? selectedDispatch.technicians : [selectedDispatch.technician_id],
          work_type: selectedDispatch.work_type || 'ikr_psb',
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
      for (const adss of adssUpdates) {
        const { data: hData } = await supabase.from('adss_haspels').select('initial_meters, used_meters').eq('id', adss.id).single()
        if (hData) { const newUsed = Number(hData.used_meters || 0) + Number(adss.add_meters); await supabase.from('adss_haspels').update({ used_meters: newUsed, status: newUsed >= Number(hData.initial_meters) ? 'habis' : 'tersedia' }).eq('id', adss.id) }
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

  const handleSaveSusulan = async () => {
    if (susulanForm.items.length === 0) { toast.error('Tambahkan minimal 1 barang susulan'); return }
    setSusulanSaving(true)
    try {
      const itemsToInsert = [], expItemsToInsert = [], ontUsed = [], dcUpdates = [], adssUpdates = [], whUpdates = []
      for (const item of susulanForm.items) {
        if (item.item_type === 'ont') {
          (item.selected_onts || []).forEach(opt => { 
            itemsToInsert.push({ item_type: 'ont', serial_number_id: opt.value, quantity_dispatched: 1, quantity_used: 1, quantity_returned: 0 })
            ontUsed.push(opt.value)
            expItemsToInsert.push({ item_type: 'ont', serial_number_id: opt.value, quantity: 1 })
          })
        } else if (item.item_type === 'dropcore') {
          let susulanDcValid = true
          ;(item.selected_haspels || []).forEach(opt => {
            const m = Number(item.dropcore_meters?.[opt.value] || 0)
            if (!m || m <= 0) {
              toast.error(`Isi meter terpakai untuk haspel ${opt.label.split(' ')[0]}!`)
              susulanDcValid = false
              return
            }
            const sisaMeter = opt.sisa || 0
            if (m > sisaMeter) {
              toast.error(`Meter terpakai (${m}m) melebihi sisa haspel ${opt.label.split(' ')[0]} (${sisaMeter}m)!`)
              susulanDcValid = false
              return
            }
            itemsToInsert.push({ item_type: 'dropcore', haspel_id: opt.value, quantity_dispatched: 1, meters_used: m })
            dcUpdates.push({ id: opt.value, add_meters: m })
            expItemsToInsert.push({ item_type: 'dropcore', haspel_id: opt.value, meters_used: m, quantity: 1 })
          })
          if (!susulanDcValid) { setSusulanSaving(false); return }
        } else if (item.item_type === 'adss') {
          let susulanAdssValid = true
          ;(item.selected_adss || []).forEach(opt => {
            const m = Number(item.adss_meters?.[opt.value] || 0)
            if (!m || m <= 0) {
              toast.error(`Isi meter terpakai untuk ADSS ${opt.label.split(' ')[0]}!`)
              susulanAdssValid = false
              return
            }
            const sisaMeter = opt.sisa || 0
            if (m > sisaMeter) {
              toast.error(`Meter terpakai (${m}m) melebihi sisa ADSS ${opt.label.split(' ')[0]} (${sisaMeter}m)!`)
              susulanAdssValid = false
              return
            }
            itemsToInsert.push({ item_type: 'adss', adss_id: opt.value, quantity_dispatched: 1, meters_used: m })
            adssUpdates.push({ id: opt.value, add_meters: m })
            expItemsToInsert.push({ item_type: 'adss', adss_id: opt.value, meters_used: m, quantity: 1 })
          })
          if (!susulanAdssValid) { setSusulanSaving(false); return }
        } else if (item.item_type === 'other') {
          (item.selected_others || []).forEach(opt => {
            const qty = item.other_quantities?.[opt.value] || 1
            if (qty > 0) { 
              itemsToInsert.push({ item_type: 'other', warehouse_item_id: opt.value, quantity_dispatched: qty, quantity_used: qty, quantity_returned: 0 })
              whUpdates.push({ id: opt.value, qty })
              expItemsToInsert.push({ item_type: 'other', warehouse_item_id: opt.value, quantity: qty })
            }
          })
        }
      }

      if (itemsToInsert.length === 0) { toast.error('Belum ada item valid yang dipilih'); setSusulanSaving(false); return }

      const { error: iErr } = await supabase.from('dispatch_items').insert(itemsToInsert.map(i => ({ ...i, dispatch_id: detailDispatch.id })))
      if (iErr) throw iErr

      if (expItemsToInsert.length > 0) {
        const { data: expData, error: expErr } = await supabase.from('daily_expenses').insert({
          expense_date: detailDispatch.dispatch_date,
          site: detailDispatch.site,
          technicians: detailDispatch.technicians && detailDispatch.technicians.length > 0 ? detailDispatch.technicians : [detailDispatch.technician_id],
          work_type: detailDispatch.work_type || 'ikr_psb',
          note: 'Barang Tambahan Susulan',
          created_by: profile.id
        }).select('id').single()
        if (expErr) throw expErr
        await supabase.from('expense_items').insert(expItemsToInsert.map(i => ({ ...i, expense_id: expData.id })))
      }

      if (ontUsed.length > 0) await supabase.from('serial_numbers').update({ status: 'terpakai' }).in('id', ontUsed)
      for (const dc of dcUpdates) {
        const { data: hData } = await supabase.from('dropcore_haspels').select('initial_meters, used_meters').eq('id', dc.id).single()
        if (hData) { const newUsed = Number(hData.used_meters || 0) + Number(dc.add_meters); await supabase.from('dropcore_haspels').update({ used_meters: newUsed, status: newUsed >= Number(hData.initial_meters) ? 'habis' : 'tersedia' }).eq('id', dc.id) }
      }
      for (const adss of adssUpdates) {
        const { data: hData } = await supabase.from('adss_haspels').select('initial_meters, used_meters').eq('id', adss.id).single()
        if (hData) { const newUsed = Number(hData.used_meters || 0) + Number(adss.add_meters); await supabase.from('adss_haspels').update({ used_meters: newUsed, status: newUsed >= Number(hData.initial_meters) ? 'habis' : 'tersedia' }).eq('id', adss.id) }
      }
      for (const wh of whUpdates) {
        const { data: wItem } = await supabase.from('warehouses').select('initial_stock').eq('id', wh.id).single()
        if (wItem) await supabase.from('warehouses').update({ initial_stock: Math.max(0, Number(wItem.initial_stock || 0) - Number(wh.qty)) }).eq('id', wh.id)
      }

      toast.success('Barang susulan berhasil ditambahkan dan stok dipotong!')
      setIsSusulanModalOpen(false)
      setDetailDispatch(null)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error('Gagal menyimpan susulan: ' + err.message)
    } finally { setSusulanSaving(false) }
  }

  const handleDelete = (dispatch) => {
    setConfirmModal({
      isOpen: true,
      title: 'Batalkan Bon Barang',
      message: 'Yakin ingin membatalkan bon ini? Semua stok akan dikembalikan ke gudang.',
      onConfirm: async () => {
        setConfirmModal({ isOpen: false, onConfirm: null })
        const ontR = [], dcR = [], adssR = [], whR = []
        for (const it of dispatch.items) {
          if (it.item_type === 'ont') ontR.push(it.serial_number_id)
          if (it.item_type === 'dropcore') dcR.push(it.haspel_id)
          if (it.item_type === 'adss') adssR.push(it.adss_id)
          if (it.item_type === 'other') whR.push({ id: it.warehouse_item_id, qty: it.quantity_dispatched })
        }
        if (ontR.length > 0) await supabase.from('serial_numbers').update({ status: 'tersedia' }).in('id', ontR)
        if (dcR.length > 0) await supabase.from('dropcore_haspels').update({ status: 'tersedia' }).in('id', dcR)
        if (adssR.length > 0) await supabase.from('adss_haspels').update({ status: 'tersedia' }).in('id', adssR)
        for (const wh of whR) {
          const { data: wData } = await supabase.from('warehouses').select('initial_stock, stock_on_hold').eq('id', wh.id).single()
          if (wData) await supabase.from('warehouses').update({ initial_stock: Number(wData.initial_stock || 0) + Number(wh.qty), stock_on_hold: Math.max(0, Number(wData.stock_on_hold || 0) - Number(wh.qty)) }).eq('id', wh.id)
        }
        if (dispatch.schedule_id) await supabase.from('technician_schedules').update({ status: 'pending' }).eq('id', dispatch.schedule_id)
        await supabase.from('dispatches').delete().eq('id', dispatch.id)
        toast.success('Bon berhasil dibatalkan')
        fetchData()
      }
    })
  }

  const handleExport = async (monthFilter = '', teamFilter = '') => {
    setIsExportModalOpen(false)
    try {
      showProgress('Menyiapkan Export', 'Menginisialisasi file Excel...', 10)
      const { applyHeaderStyle, applyDataRowStyles, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      
      const baseData = [...activeDispatches, ...historyDispatches]
      const filteredData = baseData.filter(d => {
        if (monthFilter && !d.dispatch_date?.startsWith(monthFilter)) return false
        if (teamFilter) {
          const techIds = d.technicians && d.technicians.length > 0 ? d.technicians : [d.technician_id].filter(Boolean)
          const isBackbone = techIds.some(tId => allUsers.find(u => u.id === tId)?.role === 'backbone')
          return teamFilter === 'backbone' ? isBackbone : !isBackbone
        }
        return true
      }).sort((a, b) => new Date(a.dispatch_date) - new Date(b.dispatch_date))

      if (filteredData.length === 0) { hideProgress(); toast.error('Tidak ada data'); return }

      // Sheet: Lokasi & Maps
      const wsLokasi = workbook.addWorksheet('Lokasi Pemasangan')
      const headersLokasi = ['Tanggal', 'Teknisi', 'Lokasi', 'Jenis Item', 'Detail', 'URL Maps']
      setColumnWidths(wsLokasi, [14, 25, 20, 20, 30, 50])
      applyHeaderStyle(wsLokasi, headersLokasi, '7C3AED')
      for (const d of filteredData) {
        if (!d.items) continue
        const techName = getTechNames(d.technicians && d.technicians.length > 0 ? d.technicians : [d.technician_id])
        const site = SITES.find(s => s.value === d.site)?.label || d.site
        for (const it of d.items) {
          if (it.item_type === 'other' && it.tiang_lokasi_url && isItemRequiresLocation(it.warehouse_item?.item_name)) {
            it.tiang_lokasi_url.split(/(?=https?:\/\/)/gi).forEach(u => wsLokasi.addRow([d.dispatch_date, techName, site, it.warehouse_item?.item_name || 'Material', 'Lokasi Pemasangan', u.trim().replace(/,$/, '')]))
          }
          if (it.item_type === 'adss' && (it.adss_titik_awal || it.adss_titik_akhir)) {
            if (it.adss_titik_awal) wsLokasi.addRow([d.dispatch_date, techName, site, 'Kabel ADSS', 'Titik Awal', it.adss_titik_awal])
            if (it.adss_titik_akhir) wsLokasi.addRow([d.dispatch_date, techName, site, 'Kabel ADSS', 'Titik Akhir', it.adss_titik_akhir])
          }
        }
      }
      applyDataRowStyles(wsLokasi)

      await downloadWorkbook(workbook, `Export_Bon_${new Date().getTime()}.xlsx`)
      toast.success('Export berhasil!')
    } catch (err) { toast.error('Gagal export: ' + err.message) } finally { hideProgress() }
  }

  const ontOptions = snList.map(sn => ({ value: sn.id, label: sn.serial_number }))
  const haspelOptions = haspelList.map(h => {
    const sisa = Number(h.initial_meters || 0) - Number(h.used_meters || 0)
    return { value: h.id, label: `${h.haspel_code} (Sisa: ${sisa}m)`, sisa }
  }).filter(h => h.sisa > 0)
  const adssOptions = adssList.map(h => {
    const sisa = Number(h.initial_meters || 0) - Number(h.used_meters || 0)
    return { value: h.id, label: `${h.haspel_code} (Sisa: ${sisa}m)`, sisa }
  }).filter(h => h.sisa > 0)
  const otherOptions = otherItems.map(w => ({ value: w.id, label: `${w.item_name} (stok: ${w.initial_stock})` }))

  let activeDispatches = dispatches.filter(d => d.status === 'sedang_dibawa')
  let historyDispatches = dispatches.filter(d => d.status === 'selesai')
  const combinedActive = [...activeDispatches.map(d => ({ ...d, _type: 'dispatch' })), ...schedules.filter(s => s.status !== 'completed' && !dispatches.map(d => d.schedule_id).includes(s.id)).map(s => ({ ...s, _type: 'schedule' }))]
  const paginatedCombined = combinedActive.slice((page - 1) * perPage, page * perPage)
  const getTechNames = (ids = []) => ids.map(id => allUsers.find(u => u.id === id)?.full_name || id).join(', ')

  return (
    <div>
      {/* ... [Header/Tabs/Stat Cards omitted for brevity] ... */}
      
      {/* Detail UI Item Map Section Replacement */}
      {/* Inside detailDispatch map loop: */}
      {/* {it.item_type === 'other' && it.tiang_lokasi_url && isItemRequiresLocation(it.warehouse_item?.item_name) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
          {it.tiang_lokasi_url.split(/(?=https?:\/\/)/gi).map(u => u.trim().replace(/,$/, '')).filter(Boolean).map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#3b82f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={12} /> {url.length > 40 ? url.substring(0, 40) + '...' : url}
            </a>
          ))}
        </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          {d.status === 'sedang_dibawa' && (
            <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <button className="btn btn-primary btn-sm" onClick={() => handleOpenLapor(d)} style={{ gap: '5px' }}><CheckCircle size={13} /> Lapor Pemakaian</button>
              <div style={{ display: 'flex', gap: '6px' }}>
                {role === 'superadmin' && <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(d)} title="Edit" style={{ padding: '5px 10px', color: 'var(--warning)' }}><Edit2 size={13} /></button>}
                {(role === 'superadmin' || role === 'admin') && <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(d)} title="Batalkan" style={{ padding: '5px 10px', color: 'var(--danger)' }}><Trash2 size={13} /></button>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

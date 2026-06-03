import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, Truck, CalendarDays, Users, Download, AlertCircle, Unlock, Lock } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import Pagination from '../../components/common/Pagination'
import Select from 'react-select'
import { useProgress } from '../../contexts/ProgressContext'

const SITES = [
  { value: 'banyumas', label: 'Banyumas' },
  { value: 'cilacap', label: 'Cilacap' },
  { value: 'cilacap_herman', label: 'Cilacap (Herman)' },
]

const WORK_TYPES = [
  { value: 'ikr_psb', label: 'IKR/PSB' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'odc_odp', label: 'Instalasi ODC/ODP' }
]

export default function Pengeluaran() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const { showProgress, hideProgress } = useProgress()

  const [expenses, setExpenses] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [snList, setSnList] = useState([])
  const [haspelList, setHaspelList] = useState([])
  const [otherItems, setOtherItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editItem, setEditItem] = useState(null)
  
  const [activeTab, setActiveTab] = useState('pengeluaran')
  const [schedules, setSchedules] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ schedule_date: format(new Date(), 'yyyy-MM-dd'), site: 'banyumas', work_type: 'ikr_psb', technicians: [], note: '' })
  const [myPendingSchedules, setMyPendingSchedules] = useState([])
  const [myTodaySchedule, setMyTodaySchedule] = useState(null)
  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const [statusFilter, setStatusFilter] = useState('semua')
  const [schedStatusFilter, setSchedStatusFilter] = useState('semua')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [schedPage, setSchedPage] = useState(1)
  const [schedPerPage, setSchedPerPage] = useState(20)

  const FORM_STORAGE_KEY = 'pengeluaran_draft'

  const [form, setForm] = useState(() => {
    try {
      const saved = sessionStorage.getItem(FORM_STORAGE_KEY)
      if (saved) return JSON.parse(saved)
    } catch {}
    return {
      expense_date: format(new Date(), 'yyyy-MM-dd'),
      site: 'banyumas',
      work_type: 'ikr_psb',
      technicians: [],
      note: '',
      items: []
    }
  })

  useEffect(() => {
    fetchAll()
  }, [])

  // Persist form to sessionStorage whenever it changes (so tab-switch doesn't lose data)
  useEffect(() => {
    if (isModalOpen) {
      try { sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(form)) } catch {}
    }
  }, [form, isModalOpen])

  // Back-button guard: push a history entry when modal opens, intercept popstate
  useEffect(() => {
    if (!isModalOpen) return
    window.history.pushState({ modalOpen: true }, '')
    const onPop = (e) => {
      const hasData = form.items.length > 0 || form.technicians.length > 0 || form.note
      if (hasData) {
        const leave = window.confirm('Data yang sudah diisi belum disimpan. Yakin ingin menutup form?')
        if (!leave) {
          // Put history back so back button doesn't navigate away
          window.history.pushState({ modalOpen: true }, '')
          return
        }
      }
      setIsModalOpen(false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [isModalOpen, form])

  useEffect(() => { setPage(1) }, [searchTerm, dateFilter, statusFilter])
  useEffect(() => { setSchedPage(1) }, [schedStatusFilter])

  const fetchAll = async () => {
    setLoading(true)
    const [expRes, techRes, snRes, haspelRes, schedRes, whRes] = await Promise.all([
      supabase.from('daily_expenses').select('*, items:expense_items(*, warehouse_item:warehouses(item_name), haspel:dropcore_haspels(haspel_code, remaining_meters, used_meters), sn:serial_numbers(serial_number))').order('expense_date', { ascending: false }),
      supabase.from('users').select('id, full_name, username').in('role', ['admin', 'teknisi']).eq('is_active', true),
      supabase.from('serial_numbers').select('id, serial_number, brand:ont_brands(brand_name), type:ont_types(type_name)').eq('status', 'tersedia'),
      supabase.from('dropcore_haspels').select('id, haspel_code, type, remaining_meters, used_meters').eq('status', 'tersedia'),
      supabase.from('technician_schedules').select('*').order('schedule_date', { ascending: false }),
      supabase.from('warehouses').select('id, item_name, initial_stock').eq('item_type', 'other')
    ])
    if (!expRes.error) setExpenses(expRes.data || [])
    if (!techRes.error) setTechnicians(techRes.data || [])
    if (!snRes.error) setSnList(snRes.data || [])
    if (!haspelRes.error) setHaspelList(haspelRes.data || [])
    if (!whRes.error) setOtherItems(whRes.data || [])
    if (!schedRes.error) {
      const allScheds = schedRes.data || []
      setSchedules(allScheds)
      const today = format(new Date(), 'yyyy-MM-dd')
      // Jadwal pending = status bukan 'completed' (termasuk null/pending) untuk teknisi ini, SEBELUM hari ini
      setMyPendingSchedules(allScheds.filter(s =>
        s.status !== 'completed' &&
        s.technicians?.includes(profile.id) &&
        s.schedule_date < today
      ))
      // Jadwal hari ini untuk teknisi ini (belum selesai)
      setMyTodaySchedule(allScheds.find(s =>
        s.schedule_date === today &&
        s.technicians?.includes(profile.id)
      ) || null)
    }
    setLoading(false)
  }

  // React Select Options
  const ontOptions = snList.map(s => {
    const parts = [s.serial_number]
    if (s.brand?.brand_name) parts.push(s.brand.brand_name)
    if (s.type?.type_name) parts.push(s.type.type_name)
    return { value: s.id, label: parts.join(' ') }
  })
  const haspelOptions = haspelList.map(h => ({ value: h.id, label: `${h.haspel_code} (${h.type?.toUpperCase() || ''}, sisa: ${h.remaining_meters}m)` }))
  const otherOptions = otherItems.map(w => ({ value: w.id, label: w.item_name }))

  const handleSaveSchedule = async () => {
    if (!scheduleForm.schedule_date || !scheduleForm.site) { toast.error('Tanggal dan lokasi wajib diisi'); return }
    if (scheduleForm.technicians.length === 0) { toast.error('Pilih minimal 1 teknisi'); return }
    setSaving(true)
    try {
      // status: 'pending' wajib agar filter teknisi berjalan
      const { error } = await supabase.from('technician_schedules').insert({ ...scheduleForm, status: 'pending', created_by: profile.id })
      if (error) throw error
      await logActivity({ userId: profile.id, username: profile.username, role, module: 'Jadwal Teknisi', action: 'Tambah Jadwal', detail: `${scheduleForm.schedule_date} - ${scheduleForm.site}` })
      toast.success('Jadwal berhasil ditambahkan')
      setIsScheduleModalOpen(false)
      fetchAll()
    } catch (err) {
      toast.error('Gagal menyimpan jadwal: ' + err.message)
    } finally { setSaving(false) }
  }

  const toggleScheduleExtraAccess = async (sched) => {
    const newVal = !sched.allow_extra_expense
    const { error } = await supabase.from('technician_schedules').update({ allow_extra_expense: newVal }).eq('id', sched.id)
    if (!error) {
      toast.success(newVal ? 'Akses pengeluaran tambahan dibuka' : 'Akses ditutup')
      fetchAll()
    }
  }

  const handleOpenAddExpense = (sched = null) => {
    resetForm()
    if (sched) {
      setSelectedScheduleId(sched.id)
      setForm(f => ({ ...f, expense_date: sched.schedule_date, site: sched.site, work_type: sched.work_type, technicians: sched.technicians }))
      setIsModalOpen(true)
    } else if (myTodaySchedule) {
      if (myTodaySchedule.status === 'completed' && !myTodaySchedule.allow_extra_expense) {
        toast.error('Tim Anda sudah mengisi pengeluaran hari ini. Hubungi admin untuk menambah pengeluaran.')
        return
      }
      setSelectedScheduleId(myTodaySchedule.id)
      setForm(f => ({ ...f, expense_date: myTodaySchedule.schedule_date, site: myTodaySchedule.site, work_type: myTodaySchedule.work_type, technicians: myTodaySchedule.technicians }))
      setIsModalOpen(true)
    } else {
      setSelectedScheduleId('')
      setIsModalOpen(true)
    }
  }

  const toggleScheduleTech = (techId) => setScheduleForm(f => ({ ...f, technicians: f.technicians.includes(techId) ? f.technicians.filter(t => t !== techId) : [...f.technicians, techId] }))

  const toggleTech = (techId) => {
    setForm(f => ({
      ...f,
      technicians: f.technicians.includes(techId)
        ? f.technicians.filter(t => t !== techId)
        : [...f.technicians, techId]
    }))
  }

  const addItem = () => {
    setForm(f => ({
      ...f,
      items: [...f.items, { id: Math.random().toString(36).substr(2, 9), item_type: 'ont', selected_onts: [], selected_haspels: [], haspel_meters: {}, selected_other: null, quantity: 1, item_name: '' }]
    }))
  }

  const removeItem = (itemId) => {
    setForm(f => ({ ...f, items: f.items.filter(i => i.id !== itemId) }))
  }

  const revertExpenseItems = async (itemsToRevert) => {
    // 1. Revert ONT Status
    const ontIds = itemsToRevert.filter(i => i.item_type === 'ont').map(i => i.serial_number_id)
    if (ontIds.length > 0) {
      await supabase.from('serial_numbers').update({ status: 'tersedia' }).in('id', ontIds)
    }

    // 2. Revert Dropcore
    const dcItems = itemsToRevert.filter(i => i.item_type === 'dropcore')
    for (const dc of dcItems) {
      const { data: haspel } = await supabase.from('dropcore_haspels').select('id, initial_meters, used_meters').eq('id', dc.haspel_id).single()
      if (haspel) {
        const newUsed = Math.max(0, Number(haspel.used_meters || 0) - Number(dc.meters_used))
        const newStatus = newUsed >= Number(haspel.initial_meters) ? 'habis' : 'tersedia'
        await supabase.from('dropcore_haspels').update({ used_meters: newUsed, status: newStatus }).eq('id', dc.haspel_id)
      }
    }

    // 3. Revert Warehouse
    const otherItemsList = itemsToRevert.filter(i => i.item_type === 'other')
    for (const other of otherItemsList) {
      const { data: wItem } = await supabase.from('warehouses').select('id, initial_stock').eq('id', other.warehouse_item_id).single()
      if (wItem) {
        const newStock = Number(wItem.initial_stock || 0) + Number(other.quantity)
        await supabase.from('warehouses').update({ initial_stock: newStock }).eq('id', other.warehouse_item_id)
      }
    }
  }

  const openEdit = (exp) => {
    setEditItem(exp)
    const formItems = []
    
    const onts = exp.items.filter(i => i.item_type === 'ont')
    if (onts.length > 0) {
      formItems.push({
        id: 'ont_edit',
        item_type: 'ont',
        selected_onts: onts.map(o => ({ value: o.serial_number_id, label: o.sn?.serial_number || 'Unknown' }))
      })
    }

    const dropcores = exp.items.filter(i => i.item_type === 'dropcore')
    if (dropcores.length > 0) {
      const selected_haspels = dropcores.map(d => ({ value: d.haspel_id, label: d.haspel?.haspel_code || 'Unknown' }))
      const haspel_meters = {}
      dropcores.forEach(d => {
        haspel_meters[d.haspel_id] = d.meters_used
      })
      formItems.push({
        id: 'dropcore_edit',
        item_type: 'dropcore',
        selected_haspels,
        haspel_meters
      })
    }

    const others = exp.items.filter(i => i.item_type === 'other')
    if (others.length > 0) {
      const selected_others = others.map(o => ({ value: o.warehouse_item_id, label: o.warehouse_item?.item_name || 'Unknown' }))
      const other_quantities = {}
      others.forEach(o => {
        other_quantities[o.warehouse_item_id] = o.quantity
      })
      formItems.push({
        id: 'other_edit',
        item_type: 'other',
        selected_others,
        other_quantities
      })
    }

    setForm({
      expense_date: exp.expense_date,
      site: exp.site,
      work_type: exp.work_type,
      technicians: exp.technicians || [],
      note: exp.note || '',
      items: formItems
    })
    setSelectedScheduleId(exp.schedule_id || '')
    setIsModalOpen(true)
  }

  const updateItem = (itemId, key, value) => {
    setForm(f => ({
      ...f,
      items: f.items.map(i => i.id === itemId ? { ...i, [key]: value } : i)
    }))
  }

  const validateStock = async (itemsToInsert, editItem) => {
    const oldOnts = new Set(editItem?.items?.filter(i => i.item_type === 'ont').map(i => i.serial_number_id) || [])
    const oldDropcores = {}
    editItem?.items?.filter(i => i.item_type === 'dropcore').forEach(i => {
      oldDropcores[i.haspel_id] = (oldDropcores[i.haspel_id] || 0) + Number(i.meters_used)
    })
    const oldOthers = {}
    editItem?.items?.filter(i => i.item_type === 'other').forEach(i => {
      oldOthers[i.warehouse_item_id] = (oldOthers[i.warehouse_item_id] || 0) + Number(i.quantity)
    })

    const ontIds = itemsToInsert.filter(i => i.item_type === 'ont').map(i => i.serial_number_id)
    if (ontIds.length > 0) {
      const { data: snData } = await supabase.from('serial_numbers').select('id, status, serial_number').in('id', ontIds)
      for (const sn of (snData || [])) {
        if (sn.status !== 'tersedia' && !oldOnts.has(sn.id)) {
          return `ONT ${sn.serial_number} sudah terpakai!`
        }
      }
    }

    const dcItems = itemsToInsert.filter(i => i.item_type === 'dropcore')
    for (const dc of dcItems) {
      const { data: haspel } = await supabase.from('dropcore_haspels').select('haspel_code, initial_meters, used_meters').eq('id', dc.haspel_id).single()
      if (haspel) {
        const capacity = Number(haspel.initial_meters || 0)
        const currentUsed = Number(haspel.used_meters || 0)
        const returned = oldDropcores[dc.haspel_id] || 0
        const available = capacity - currentUsed + returned
        if (Number(dc.meters_used) > available) {
          return `Sisa dropcore ${haspel.haspel_code} tidak cukup! (Tersedia: ${available}m)`
        }
      }
    }

    const otherItemsList = itemsToInsert.filter(i => i.item_type === 'other')
    for (const other of otherItemsList) {
      const { data: wItem } = await supabase.from('warehouses').select('item_name, initial_stock').eq('id', other.warehouse_item_id).single()
      if (wItem) {
        const currentStock = Number(wItem.initial_stock || 0)
        const returned = oldOthers[other.warehouse_item_id] || 0
        const available = currentStock + returned
        if (Number(other.quantity) > available) {
          return `Stok ${wItem.item_name} tidak cukup! (Tersedia: ${available})`
        }
      }
    }
    return null
  }

  const handleSave = async () => {
    if (!form.expense_date || !form.site) { toast.error('Tanggal dan lokasi wajib diisi'); return }
    if (form.technicians.length === 0) { toast.error('Pilih minimal 1 teknisi'); return }
    if (form.items.length === 0 && (!form.note || !form.note.trim())) {
      toast.error('Jika tidak ada pengeluaran barang, mohon isi Note (misal: "Tidak ada pengeluaran")')
      return
    }
    setSaving(true)
    try {
      // Build items to insert for validation
      const itemsToInsert = []
      for (const item of form.items) {
        if (item.item_type === 'ont') {
          (item.selected_onts || []).forEach(opt => {
            itemsToInsert.push({ item_type: 'ont', serial_number_id: opt.value, quantity: 1 })
          })
        } else if (item.item_type === 'dropcore') {
          (item.selected_haspels || []).forEach(opt => {
            const meters = item.haspel_meters?.[opt.value] || 0
            if (meters > 0) itemsToInsert.push({ item_type: 'dropcore', haspel_id: opt.value, meters_used: meters, quantity: 1 })
          })
        } else if (item.item_type === 'other') {
          (item.selected_others || []).forEach(opt => {
             const qty = item.other_quantities?.[opt.value] || 1
             itemsToInsert.push({ item_type: 'other', warehouse_item_id: opt.value, quantity: qty })
          })
        }
      }

      // Validate stock before doing any DB updates
      if (itemsToInsert.length > 0) {
        const errorMsg = await validateStock(itemsToInsert, editItem)
        if (errorMsg) {
          toast.error(errorMsg)
          setSaving(false)
          return
        }
      }

      let expId = null
      
      if (editItem) {
        expId = editItem.id
        // 1. Revert old items stock
        if (editItem.items && editItem.items.length > 0) {
          await revertExpenseItems(editItem.items)
          // Delete old items
          const { error: delError } = await supabase.from('expense_items').delete().eq('expense_id', editItem.id)
          if (delError) throw delError
        }
        
        // 2. Update daily_expenses record
        const { error: expError } = await supabase.from('daily_expenses').update({
          expense_date: form.expense_date,
          site: form.site,
          work_type: form.work_type,
          technicians: form.technicians,
          note: form.note,
          schedule_id: selectedScheduleId || null,
          updated_at: new Date().toISOString()
        }).eq('id', editItem.id)
        if (expError) throw expError

      } else {
        const { data: expData, error: expError } = await supabase.from('daily_expenses').insert({
          expense_date: form.expense_date,
          site: form.site,
          work_type: form.work_type,
          technicians: form.technicians,
          note: form.note,
          schedule_id: selectedScheduleId || null,
          created_by: profile.id,
        }).select().single()
        if (expError) throw expError
        expId = expData.id
      }

      // Insert items
      if (form.items.length > 0) {
        const itemsToInsert = []
        for (const item of form.items) {
          if (item.item_type === 'ont') {
            (item.selected_onts || []).forEach(opt => {
              itemsToInsert.push({ expense_id: expId, item_type: 'ont', serial_number_id: opt.value, quantity: 1 })
            })
          } else if (item.item_type === 'dropcore') {
            (item.selected_haspels || []).forEach(opt => {
              const meters = item.haspel_meters?.[opt.value] || 0
              if (meters > 0) {
                 itemsToInsert.push({ expense_id: expId, item_type: 'dropcore', haspel_id: opt.value, meters_used: meters, quantity: 1 })
              }
            })
          } else if (item.item_type === 'other') {
            (item.selected_others || []).forEach(opt => {
               const qty = item.other_quantities?.[opt.value] || 1
               itemsToInsert.push({ expense_id: expId, item_type: 'other', warehouse_item_id: opt.value, quantity: qty })
            })
          }
        }
        
        if (itemsToInsert.length > 0) {
          const { error: itemsError } = await supabase.from('expense_items').insert(itemsToInsert)
          if (itemsError) throw itemsError

          // Update SN status if used
          const ontIds = itemsToInsert.filter(i => i.item_type === 'ont').map(i => i.serial_number_id)
          if (ontIds.length > 0) {
            const { error: snError } = await supabase.from('serial_numbers').update({ status: 'terpakai' }).in('id', ontIds)
            if (snError) console.error("Gagal update SN:", snError)
          }

          // Update dropcore haspels
          const dcItems = itemsToInsert.filter(i => i.item_type === 'dropcore')
          for (const dc of dcItems) {
            const { data: haspel } = await supabase.from('dropcore_haspels').select('id, initial_meters, used_meters').eq('id', dc.haspel_id).single()
            if (haspel) {
              const newUsed = Number(haspel.used_meters || 0) + Number(dc.meters_used)
              const newStatus = newUsed >= Number(haspel.initial_meters) ? 'habis' : 'tersedia'
              const { error: dcError } = await supabase.from('dropcore_haspels')
                .update({ used_meters: newUsed, status: newStatus })
                .eq('id', dc.haspel_id)
              if (dcError) console.error("Gagal update dropcore:", dcError)
            }
          }

          // Update warehouses for 'other' items
          const otherItemsList = itemsToInsert.filter(i => i.item_type === 'other')
          for (const other of otherItemsList) {
            const { data: wItem } = await supabase.from('warehouses').select('id, initial_stock').eq('id', other.warehouse_item_id).single()
            if (wItem) {
              const newStock = Number(wItem.initial_stock || 0) - Number(other.quantity)
              const { error: whError } = await supabase.from('warehouses')
                .update({ initial_stock: newStock })
                .eq('id', other.warehouse_item_id)
              if (whError) console.error("Gagal update gudang:", whError)
            }
          }
        }
      }

      if (selectedScheduleId) {
        await supabase.from('technician_schedules').update({ status: 'completed' }).eq('id', selectedScheduleId)
      }

      await logActivity({
        userId: profile.id, username: profile.username, role,
        module: 'Pengeluaran', action: editItem ? 'Edit Pengeluaran' : 'Tambah Pengeluaran',
        detail: `Pengeluaran ${form.expense_date} - ${form.site} - ${form.work_type}`
      })

      toast.success('Pengeluaran berhasil disimpan')
      setIsModalOpen(false)
      resetForm()
      fetchAll()
    } catch (err) {
      toast.error('Gagal menyimpan: ' + err.message)
    } finally { setSaving(false) }
  }

  const resetForm = () => {
    setForm({ expense_date: format(new Date(), 'yyyy-MM-dd'), site: 'banyumas', work_type: 'ikr_psb', technicians: [], note: '', items: [] })
    setSelectedScheduleId('')
    setEditItem(null)
    try { sessionStorage.removeItem(FORM_STORAGE_KEY) } catch {}
  }

  const handleDelete = async (exp) => {
    if (!window.confirm('Hapus data pengeluaran ini dan kembalikan stok terkait?')) return
    
    // Revert items before deleting
    if (exp.items && exp.items.length > 0) {
      await revertExpenseItems(exp.items)
    }

    await supabase.from('daily_expenses').delete().eq('id', exp.id)
    
    // If it was linked to a schedule, revert schedule status to pending
    if (exp.schedule_id) {
       await supabase.from('technician_schedules').update({ status: 'pending' }).eq('id', exp.schedule_id)
    }

    await logActivity({ userId: profile.id, username: profile.username, role, module: 'Pengeluaran', action: 'Hapus Pengeluaran', detail: `Tanggal: ${exp.expense_date}` })
    toast.success('Data dihapus dan stok dikembalikan')
    fetchAll()
  }

  const handleDeleteSchedule = async (sched) => {
    if (!window.confirm('Hapus jadwal teknisi ini?')) return
    const { error } = await supabase.from('technician_schedules').delete().eq('id', sched.id)
    if (error) {
      toast.error('Gagal menghapus jadwal: ' + error.message)
      return
    }
    await logActivity({ userId: profile.id, username: profile.username, role, module: 'Jadwal Teknisi', action: 'Hapus Jadwal', detail: `Tanggal: ${sched.schedule_date} - ${sched.site}` })
    toast.success('Jadwal berhasil dihapus')
    fetchAll()
  }

  const getTechNames = (ids) => {
    if (!ids?.length) return '-'
    return ids.map(id => technicians.find(t => t.id === id)?.full_name || '?').join(', ')
  }

  const filtered = expenses.filter(e => {
    const matchDate = !dateFilter || e.expense_date === dateFilter
    const matchSearch = !searchTerm || getTechNames(e.technicians).toLowerCase().includes(searchTerm.toLowerCase()) || e.site?.includes(searchTerm.toLowerCase())
    return matchDate && matchSearch
  })

  // Data gabungan: Jadwal yang belum selesai + Pengeluaran aktual
  // Exclude jadwal yang sudah punya linked expense (via schedule_id)
  const expenseScheduleIds = new Set(expenses.map(e => e.schedule_id).filter(Boolean))

  const pendingSchedules = schedules.filter(s => {
    if (s.status === 'completed') return false
    if (expenseScheduleIds.has(s.id)) return false
    const matchDate = !dateFilter || s.schedule_date === dateFilter
    const matchSearch = !searchTerm || getTechNames(s.technicians).toLowerCase().includes(searchTerm.toLowerCase()) || s.site?.includes(searchTerm.toLowerCase())
    return matchDate && matchSearch
  }).map(s => ({ ...s, isSchedule: true, expense_date: s.schedule_date, items: [] }))

  const combinedData = [
    ...(statusFilter !== 'terisi' ? pendingSchedules : []),
    ...(statusFilter !== 'belum' ? filtered : [])
  ].sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date))

  const paginatedCombined = combinedData.slice((page - 1) * perPage, page * perPage)

  // Filter jadwal tab
  const filteredSchedules = schedules.map(s => ({
    ...s,
    isFilled: s.status === 'completed' || expenseScheduleIds.has(s.id)
  })).filter(s => {
    if (schedStatusFilter === 'terisi') return s.isFilled
    if (schedStatusFilter === 'belum') return !s.isFilled
    return true
  })

  const paginatedSchedules = filteredSchedules.slice((schedPage - 1) * schedPerPage, schedPage * schedPerPage)

  const handleExportExcel = async () => {
    try {
      showProgress('Menyiapkan Export', 'Menginisialisasi file Excel...', 10)
      const { applyHeaderStyle, applyDataRowStyles, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Maintory'
      workbook.created = new Date()

      // ===== SHEET 1: Rekap Pengeluaran =====
      const ws1 = workbook.addWorksheet('Rekap Pengeluaran')
      const headers1 = ['Tanggal', 'Lokasi', 'Jenis Pekerjaan', 'Teknisi', 'Jumlah Item', 'Catatan']
      setColumnWidths(ws1, [14, 18, 18, 32, 14, 30])
      applyHeaderStyle(ws1, headers1)
      for (let i = 0; i < filtered.length; i++) {
        const exp = filtered[i]
        ws1.addRow([
          exp.expense_date,
          SITES.find(s => s.value === exp.site)?.label || exp.site,
          WORK_TYPES.find(w => w.value === exp.work_type)?.label || exp.work_type,
          getTechNames(exp.technicians),
          exp.items?.length || 0,
          exp.note || ''
        ])
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses Rekap Pengeluaran... (${i + 1}/${filtered.length})`, 10 + ((i + 1) / filtered.length) * 40)
          await new Promise(r => setTimeout(r, 0))
        }
      }
      applyDataRowStyles(ws1)

      // ===== SHEET 2: Detail Barang Keluar =====
      const ws2 = workbook.addWorksheet('Detail Barang Keluar')
      const headers2 = ['Tanggal', 'Lokasi', 'Jenis Pekerjaan', 'Teknisi', 'Jenis Barang', 'Kode / Serial Number', 'Jumlah / Meter', 'Catatan']
      setColumnWidths(ws2, [14, 18, 18, 32, 16, 26, 16, 30])
      applyHeaderStyle(ws2, headers2, '065F46')

      for (let i = 0; i < filtered.length; i++) {
        const exp = filtered[i]
        const techNames = getTechNames(exp.technicians)
        const site = SITES.find(s => s.value === exp.site)?.label || exp.site
        const workType = WORK_TYPES.find(w => w.value === exp.work_type)?.label || exp.work_type

        if (!exp.items || exp.items.length === 0) {
          ws2.addRow([exp.expense_date, site, workType, techNames, '-', '-', '-', exp.note || ''])
        } else {
          exp.items.forEach(item => {
            let jenisBarang = ''
            let kode = ''
            let jumlah = ''

            if (item.item_type === 'ont') {
              jenisBarang = 'ONT / Modem'
              kode = item.sn?.serial_number || '-'
              jumlah = '1 unit'
            } else if (item.item_type === 'dropcore') {
              jenisBarang = 'Dropcore'
              kode = item.haspel?.haspel_code || '-'
              jumlah = `${item.meters_used} m`
            } else if (item.item_type === 'other') {
              jenisBarang = 'Material Lainnya'
              kode = item.warehouse_item?.item_name || '-'
              jumlah = `${item.quantity}`
            }
            ws2.addRow([exp.expense_date, site, workType, techNames, jenisBarang, kode, jumlah, exp.note || ''])
          })
        }
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses Detail Barang Keluar... (${i + 1}/${filtered.length})`, 50 + ((i + 1) / filtered.length) * 40)
          await new Promise(r => setTimeout(r, 0))
        }
      }
      applyDataRowStyles(ws2)

      // ===== SHEET 3: Rekap Per Item =====
      showProgress('Mengekspor Data', 'Membuat Rekap Per Item...', 88)
      const ws3 = workbook.addWorksheet('Rekap Per Item')
      const headers3 = ['Tanggal', 'Item', 'Total']
      setColumnWidths(ws3, [14, 30, 12])
      applyHeaderStyle(ws3, headers3, '7C3AED')

      // Build aggregation map: key = "tanggal||namaItem" => count
      const rekapMap = {}

      // Sort ascending by date to correctly process haspel usage chronologically
      const sortedForRekap = [...filtered].sort((a, b) => (a.expense_date || '').localeCompare(b.expense_date || ''))

      // Dropcore: track cumulative meters per haspel_id.
      // Hitung 1 saat cumulative = 0 (haspel baru/fresh atau baru restock ke 1000m).
      // Setelah cumulative mencapai 1000m → reset ke 0, sehingga pemakaian berikutnya
      // (setelah restock) dihitung sebagai haspel baru lagi.
      const HASPEL_FULL_METERS = 1000
      const haspelCumulative = {} // haspelId -> cumulative meters in current cycle

      for (const exp of sortedForRekap) {
        if (!exp.items || exp.items.length === 0) continue
        const tgl = exp.expense_date
        for (const item of exp.items) {
          if (item.item_type === 'ont') {
            const key = `${tgl}||ONT / Modem`
            rekapMap[key] = (rekapMap[key] || 0) + 1
          } else if (item.item_type === 'dropcore') {
            const haspelId = item.haspel_id || item.haspel?.id
            if (!haspelId) continue
            const haspelCode = item.haspel?.haspel_code || haspelId
            const metersUsed = item.meters_used || 0

            // Hitung stok awal haspel: remaining + used = kapasitas awal
            // Hanya haspel yang kapasitas awalnya = 1000m (utuh 1 haspel) yang dihitung
            const haspelOriginalMeters = (item.haspel?.remaining_meters || 0) + (item.haspel?.used_meters || 0)
            if (haspelOriginalMeters < HASPEL_FULL_METERS) continue // H4C-001 700m = skip

            const prevCumulative = haspelCumulative[haspelId] || 0

            // Jika cumulative sebelumnya = 0, artinya haspel baru/baru restock → hitung 1
            if (prevCumulative === 0) {
              const key = `${tgl}||${haspelCode}`
              rekapMap[key] = (rekapMap[key] || 0) + 1
            }

            const newCumulative = prevCumulative + metersUsed
            // Jika sudah habis (>= 1000m) → reset ke 0 agar pemakaian berikutnya
            // (setelah restock) terhitung sebagai haspel baru lagi
            haspelCumulative[haspelId] = newCumulative >= HASPEL_FULL_METERS ? 0 : newCumulative

          } else if (item.item_type === 'other') {
            const itemName = item.warehouse_item?.item_name || 'Material Lainnya'
            const key = `${tgl}||${itemName}`
            rekapMap[key] = (rekapMap[key] || 0) + (item.quantity || 1)
          }
        }
      }

      // Sort by tanggal then item name
      const rekapRows = Object.entries(rekapMap)
        .map(([key, total]) => {
          const [tgl, itemName] = key.split('||')
          return { tgl, itemName, total }
        })
        .sort((a, b) => a.tgl.localeCompare(b.tgl) || a.itemName.localeCompare(b.itemName))

      for (const row of rekapRows) {
        ws3.addRow([row.tgl, row.itemName, row.total])
      }
      applyDataRowStyles(ws3)

      showProgress('Menyelesaikan Export', 'Mengunduh file Excel...', 95)
      await downloadWorkbook(workbook, `Pengeluaran ${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success('Export berhasil!')
    } catch (err) {
      console.error(err)
      toast.error('Gagal export: ' + err.message)
    } finally {
      hideProgress()
    }
  }


  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Pengeluaran Harian</h2>
          <p>Rekap penggunaan material oleh teknisi per hari</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={handleExportExcel}>
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {/* Banner jadwal HARI INI untuk teknisi */}
      {myTodaySchedule && myTodaySchedule.status !== 'completed' && (
        <div style={{ padding: '16px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <AlertCircle size={24} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <h4 style={{ color: 'var(--accent)', margin: '0 0 4px 0', fontSize: '15px' }}>Jadwal Tugas Hari Ini</h4>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
              {SITES.find(s => s.value === myTodaySchedule.site)?.label || myTodaySchedule.site} — {WORK_TYPES.find(w => w.value === myTodaySchedule.work_type)?.label || myTodaySchedule.work_type}
            </p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => handleOpenAddExpense(myTodaySchedule)}>
            <Plus size={14} /> Isi Pengeluaran Hari Ini
          </button>
        </div>
      )}

      {/* Banner tunggakan pengeluaran (jadwal masa lalu belum diisi) */}
      {myPendingSchedules.length > 0 && (
        <div style={{ padding: '16px', background: 'var(--danger-dim)', border: '1px solid var(--danger)', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <AlertCircle size={24} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <h4 style={{ color: 'var(--danger)', margin: '0 0 4px 0', fontSize: '15px' }}>Tunggakan Laporan Pengeluaran</h4>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>Anda memiliki {myPendingSchedules.length} jadwal tugas yang belum diisi laporan pengeluarannya.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
            {myPendingSchedules.map(sched => (
              <button key={sched.id} className="btn btn-sm" style={{ background: 'var(--danger)', color: 'white', border: 'none' }} onClick={() => handleOpenAddExpense(sched)}>
                Isi Pengeluaran {format(new Date(sched.schedule_date), 'dd MMM')}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="tabs">
        <button className={`tab-item ${activeTab === 'pengeluaran' ? 'active' : ''}`} onClick={() => setActiveTab('pengeluaran')}>
          <Truck size={14} /> Pengeluaran Harian
        </button>
        {(role === 'admin' || role === 'superadmin') && (
          <button className={`tab-item ${activeTab === 'jadwal' ? 'active' : ''}`} onClick={() => setActiveTab('jadwal')}>
            <CalendarDays size={14} /> Jadwal Teknisi
          </button>
        )}
      </div>      {activeTab === 'pengeluaran' && (
      <div className="card">
        <div className="filter-bar" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div className="search-box" style={{ maxWidth: '200px' }}>
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Cari teknisi..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <input type="date" className="filter-select" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ padding: '0 12px' }} />
          <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '0 12px' }}>
            <option value="semua">Semua Status</option>
            <option value="belum">Belum Isi</option>
            <option value="terisi">Sudah Terisi</option>
          </select>
          {(dateFilter || statusFilter !== 'semua') && <button className="btn btn-ghost btn-sm" onClick={() => { setDateFilter(''); setStatusFilter('semua') }}>Reset</button>}
        </div>

        <div className="table-container">
          {loading ? (
            <div className="flex-center" style={{ height: '180px' }}><div className="spinner" /></div>
          ) : combinedData.length > 0 ? (
            <>
              <div className="mobile-card-list" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))', gap: '10px' }}>
                {paginatedCombined.map(item => {
                  if (item.isSchedule) {
                    return (
                    <div key={`sched-${item.id}`} className="mobile-card" style={{ borderLeft: '4px solid var(--warning)' }}>
                      <div className="mobile-card-header" onClick={() => setExpandedId(expandedId === `sched-${item.id}` ? null : `sched-${item.id}`)}
                        style={{ cursor: 'pointer' }}>
                        <div style={{ flex: 1 }}>
                          <div className="mobile-card-title">{format(new Date(item.expense_date), 'dd MMM yyyy', { locale: id })}</div>
                          <div className="mobile-card-subtitle">{getTechNames(item.technicians)}</div>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span className="badge badge-warning">Belum Isi</span>
                          <span className="badge badge-accent">{WORK_TYPES.find(w => w.value === item.work_type)?.label || item.work_type}</span>
                        </div>
                      </div>
                      {expandedId === `sched-${item.id}` && (
                        <div className="mobile-card-body">
                          <div className="mobile-info-row"><span className="mobile-info-label">Lokasi</span><span className="mobile-info-value">{SITES.find(s => s.value === item.site)?.label || item.site}</span></div>
                          {(item.technicians?.includes(profile.id) || ['admin', 'superadmin'].includes(role)) && (
                            <div className="mobile-card-actions">
                              <button className="btn btn-primary btn-sm" onClick={() => handleOpenAddExpense(item)}>
                                <Plus size={14} /> Isi Pengeluaran
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                }
                return (
                  <div key={`exp-${item.id}`} className="mobile-card" style={{ borderLeft: '4px solid var(--accent)' }}>
                    <div className="mobile-card-header" onClick={() => setExpandedId(expandedId === `exp-${item.id}` ? null : `exp-${item.id}`)}
                      style={{ cursor: 'pointer' }}>
                      <div style={{ flex: 1 }}>
                        <div className="mobile-card-title">{format(new Date(item.expense_date), 'dd MMM yyyy', { locale: id })}</div>
                        <div className="mobile-card-subtitle">{getTechNames(item.technicians)}</div>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span className="badge badge-success">Sudah Terisi</span>
                        <span className="badge badge-accent">{WORK_TYPES.find(w => w.value === item.work_type)?.label || item.work_type}</span>
                      </div>
                    </div>
                    {expandedId === `exp-${item.id}` && (
                      <div className="mobile-card-body">
                        <div className="mobile-info-row"><span className="mobile-info-label">Lokasi</span><span className="mobile-info-value">{SITES.find(s => s.value === item.site)?.label || item.site}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Jumlah Item</span><span className="mobile-info-value">{item.items?.length || 0} item</span></div>
                        {item.items?.length > 0 && (
                          <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px', letterSpacing: '0.5px' }}>BARANG KELUAR:</div>
                            {item.items.map((it, i) => {
                              let label = ''
                              if (it.item_type === 'ont') label = `ONT: ${it.sn?.serial_number || '-'}`
                              else if (it.item_type === 'dropcore') label = `Dropcore: ${it.haspel?.haspel_code || '-'} — ${it.meters_used}m`
                              else if (it.item_type === 'other') label = `${it.warehouse_item?.item_name || 'Barang'} × ${it.quantity}`
                              return (
                                <div key={i} style={{ fontSize: '12px', color: 'var(--text-primary)', padding: '2px 0', display: 'flex', gap: '6px' }}>
                                  <span style={{ color: 'var(--accent)' }}>•</span>
                                  <span>{label}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        <div className="mobile-info-row"><span className="mobile-info-label">Note</span><span className="mobile-info-value">{item.note || '-'}</span></div>
                        {(can(role, 'pengeluaran.edit') || can(role, 'pengeluaran.delete') || role === 'superadmin') && (
                          <div className="mobile-card-actions">
                            {(can(role, 'pengeluaran.edit') || role === 'superadmin') && (
                              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}><Edit2 size={14} /> Edit</button>
                            )}
                            {(can(role, 'pengeluaran.delete') || role === 'superadmin') && (
                              <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(item)}><Trash2 size={14} /> Hapus</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Pagination */}
            <Pagination 
              page={page} 
              setPage={setPage} 
              perPage={perPage} 
              setPerPage={setPerPage} 
              totalItems={combinedData.length} 
            />
          </>
          ) : (
            <div className="empty-state"><Truck size={48} /><h3>Belum Ada Data</h3><p>Tidak ada data sesuai filter yang dipilih.</p></div>
          )}
        </div>
      </div>
      )}

      {activeTab === 'jadwal' && (role === 'admin' || role === 'superadmin') && (
        <div className="card">
          <div className="flex justify-between items-center mb-3" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Jadwal Tim Teknisi</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="filter-select" value={schedStatusFilter} onChange={e => setSchedStatusFilter(e.target.value)} style={{ padding: '0 10px', height: '34px', fontSize: '13px' }}>
                <option value="semua">Semua Status</option>
                <option value="belum">Belum Isi</option>
                <option value="terisi">Sudah Terisi</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={() => { setScheduleForm({ schedule_date: format(new Date(), 'yyyy-MM-dd'), site: 'banyumas', work_type: 'ikr_psb', technicians: [], note: '' }); setIsScheduleModalOpen(true); }}>
                <Plus size={14} /> Tambah Jadwal
              </button>
            </div>
          </div>
          <div className="mobile-card-list" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))', gap: '10px' }}>
            {filteredSchedules.length > 0 ? paginatedSchedules.map(t => (
              <div key={t.id} className="mobile-card" style={{ borderLeft: `4px solid ${t.isFilled ? 'var(--success)' : 'var(--warning)'}` }}>
                <div className="mobile-card-header" onClick={() => setExpandedId(expandedId === `jadwal-${t.id}` ? null : `jadwal-${t.id}`)}
                  style={{ cursor: 'pointer' }}>
                  <div style={{ flex: 1 }}>
                    <div className="mobile-card-title">{format(new Date(t.schedule_date), 'dd MMM yyyy', { locale: id })}</div>
                    <div className="mobile-card-subtitle">{t.technicians?.length ? getTechNames(t.technicians) : <span className="badge badge-danger">Kosong</span>}</div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    {t.isFilled
                      ? <span className="badge badge-success">Sudah Terisi</span>
                      : <span className="badge badge-warning">Belum Isi</span>}
                    <span className="badge badge-accent">{WORK_TYPES.find(w => w.value === t.work_type)?.label || t.work_type}</span>
                  </div>
                </div>
                {expandedId === `jadwal-${t.id}` && (
                  <div className="mobile-card-body">
                    <div className="mobile-info-row"><span className="mobile-info-label">Lokasi</span><span className="mobile-info-value">{SITES.find(s => s.value === t.site)?.label || t.site}</span></div>
                    <div className="mobile-info-row"><span className="mobile-info-label">Pekerjaan</span><span className="mobile-info-value">{WORK_TYPES.find(w => w.value === t.work_type)?.label || t.work_type}</span></div>
                    {t.note && <div className="mobile-info-row"><span className="mobile-info-label">Note</span><span className="mobile-info-value">{t.note}</span></div>}
                    
                    {role === 'superadmin' && (
                      <div className="mobile-card-actions">
                        <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDeleteSchedule(t)}>
                          <Trash2 size={14} /> Hapus Jadwal
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )) : (
              <div className="empty-state"><CalendarDays size={40} /><h3>Tidak Ada Jadwal</h3><p>Tidak ada jadwal sesuai filter.</p></div>
            )}
          </div>
          {filteredSchedules.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', marginTop: '4px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Showing {filteredSchedules.length === 0 ? 0 : (schedPage-1)*schedPerPage+1}–{Math.min(schedPage*schedPerPage, filteredSchedules.length)} of {filteredSchedules.length} entries
                </span>
                <select value={schedPerPage} onChange={e => { setSchedPerPage(Number(e.target.value)); setSchedPage(1) }} style={{ padding: '3px 8px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer' }}>
                  {[10,25,50,100].map(n => <option key={n} value={n}>{n} / hal</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {(() => {
                  const tp = Math.ceil(filteredSchedules.length / schedPerPage)
                  const btns = []
                  btns.push(<button key="first" onClick={() => setSchedPage(1)} disabled={schedPage===1} style={{ padding:'4px 8px', borderRadius:'6px', background:'var(--bg-card)', border:'1px solid var(--border)', color: schedPage===1?'var(--text-muted)':'var(--text-primary)', cursor: schedPage===1?'default':'pointer', fontSize:'13px' }}>«</button>)
                  btns.push(<button key="prev" onClick={() => setSchedPage(p=>Math.max(1,p-1))} disabled={schedPage===1} style={{ padding:'4px 8px', borderRadius:'6px', background:'var(--bg-card)', border:'1px solid var(--border)', color: schedPage===1?'var(--text-muted)':'var(--text-primary)', cursor: schedPage===1?'default':'pointer', fontSize:'13px' }}>‹</button>)
                  let s=Math.max(1,schedPage-2), e=Math.min(tp,schedPage+2)
                  if(s>1) btns.push(<span key="se" style={{padding:'4px 4px',color:'var(--text-muted)',fontSize:'13px'}}>...</span>)
                  for(let i=s;i<=e;i++) btns.push(<button key={i} onClick={()=>setSchedPage(i)} style={{ padding:'4px 10px', borderRadius:'6px', background: i===schedPage?'var(--accent)':'var(--bg-card)', border:'1px solid var(--border)', color: i===schedPage?'#000':'var(--text-primary)', cursor:'pointer', fontWeight: i===schedPage?700:400, fontSize:'13px' }}>{i}</button>)
                  if(e<tp) btns.push(<span key="ee" style={{padding:'4px 4px',color:'var(--text-muted)',fontSize:'13px'}}>...</span>)
                  btns.push(<button key="next" onClick={() => setSchedPage(p=>Math.min(tp,p+1))} disabled={schedPage>=tp} style={{ padding:'4px 8px', borderRadius:'6px', background:'var(--bg-card)', border:'1px solid var(--border)', color: schedPage>=tp?'var(--text-muted)':'var(--text-primary)', cursor: schedPage>=tp?'default':'pointer', fontSize:'13px' }}>›</button>)
                  btns.push(<button key="last" onClick={() => setSchedPage(tp)} disabled={schedPage>=tp} style={{ padding:'4px 8px', borderRadius:'6px', background:'var(--bg-card)', border:'1px solid var(--border)', color: schedPage>=tp?'var(--text-muted)':'var(--text-primary)', cursor: schedPage>=tp?'default':'pointer', fontSize:'13px' }}>»</button>)
                  return btns
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal modal-lg" style={{ display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
            <div className="modal-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: '14px 18px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>Tambah Pengeluaran Harian</h3>
                {form.items.length > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>
                    {form.items.length} item diisi · Data tersimpan otomatis
                  </span>
                )}
              </div>
              <button
                className="btn-icon"
                onClick={() => {
                  const hasData = form.items.length > 0 || form.technicians.length > 0 || form.note
                  if (hasData && !window.confirm('Data yang sudah diisi belum disimpan. Yakin ingin menutup?')) return
                  resetForm()
                  setIsModalOpen(false)
                }}
                style={{ color: 'var(--danger)', background: 'var(--danger-dim)', borderRadius: '6px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0 }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {selectedScheduleId && (
                <div style={{ background: 'var(--accent-dim)', padding: '10px 12px', borderRadius: '6px', fontSize: '13px', color: 'var(--accent)' }}>
                  Mengisi pengeluaran untuk Jadwal Tim tanggal {format(new Date(form.expense_date), 'dd MMM yyyy')}
                </div>
              )}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Tanggal <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="date" className="form-input" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} disabled={!!selectedScheduleId} />
                </div>
                <div className="form-group">
                  <label className="form-label">Lokasi <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-input" style={{ height: 'auto' }} value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))} disabled={!!selectedScheduleId}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Jenis Pekerjaan</label>
                <select className="form-input" style={{ height: 'auto' }} value={form.work_type} onChange={e => setForm(f => ({ ...f, work_type: e.target.value }))} disabled={!!selectedScheduleId}>
                  {WORK_TYPES.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Teknisi <span style={{ color: 'var(--danger)' }}>*</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {technicians.map(t => (
                    <button key={t.id} type="button"
                      onClick={() => !selectedScheduleId && toggleTech(t.id)}
                      className={`badge ${form.technicians.includes(t.id) ? 'badge-accent' : 'badge-muted'}`}
                      style={{ border: 'none', cursor: selectedScheduleId ? 'default' : 'pointer', padding: '5px 10px', opacity: selectedScheduleId && !form.technicians.includes(t.id) ? 0.5 : 1 }}
                    >
                      {t.full_name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="form-label" style={{ marginBottom: 0 }}>Item Keluar</label>
                  <button className="btn btn-secondary btn-sm" onClick={addItem}><Plus size={14} /> Tambah Item</button>
                </div>
                {form.items.length === 0 && (
                  <div style={{ padding: '16px', background: 'var(--bg-hover)', borderRadius: '8px', textAlign: 'center' }}>
                    <p className="text-secondary" style={{ fontSize: '13px' }}>Belum ada item ditambahkan. Klik "Tambah Item" untuk mulai.</p>
                  </div>
                )}
                {form.items.map((item, idx) => (
                  <div key={item.id} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-secondary" style={{ fontSize: '12px' }}>Item #{idx + 1}</span>
                      <button className="btn-icon text-danger" style={{ width: '24px', height: '24px', border: 'none' }} onClick={() => removeItem(item.id)}><X size={14} /></button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <select className="form-input" style={{ height: 'auto' }} value={item.item_type} onChange={e => updateItem(item.id, 'item_type', e.target.value)}>
                        <option value="ont">ONT / Modem</option>
                        <option value="dropcore">Dropcore</option>
                        <option value="other">Barang Lainnya</option>
                      </select>
                      {item.item_type === 'ont' && (
                        <Select 
                          isMulti 
                          options={ontOptions} 
                          placeholder="Pilih beberapa ONT/Modem..."
                          value={item.selected_onts || []}
                          onChange={val => updateItem(item.id, 'selected_onts', val)}
                          styles={{
                            control: (base) => ({
                              ...base,
                              background: 'var(--bg-input)',
                              borderColor: 'var(--border)',
                              color: 'var(--text-primary)',
                            }),
                            menu: (base) => ({
                              ...base,
                              background: 'var(--bg-input)',
                              color: 'var(--text-primary)',
                            }),
                            input: (base) => ({
                              ...base,
                              color: 'var(--text-primary)',
                            }),
                            option: (base, state) => ({
                              ...base,
                              backgroundColor: state.isFocused ? 'var(--accent-dim)' : 'transparent',
                              color: state.isFocused ? 'var(--accent)' : 'var(--text-primary)',
                              cursor: 'pointer'
                            }),
                            multiValue: (base) => ({
                              ...base,
                              backgroundColor: 'var(--accent-dim)',
                            }),
                            multiValueLabel: (base) => ({
                              ...base,
                              color: 'var(--accent)',
                            })
                          }}
                        />
                      )}
                      {item.item_type === 'dropcore' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <Select 
                            isMulti 
                            options={haspelOptions} 
                            placeholder="Pilih beberapa Haspel..."
                            value={item.selected_haspels || []}
                            onChange={val => updateItem(item.id, 'selected_haspels', val)}
                            styles={{
                              control: (base) => ({
                                ...base,
                                background: 'var(--bg-input)',
                                borderColor: 'var(--border)',
                                color: 'var(--text-primary)',
                              }),
                              menu: (base) => ({
                                ...base,
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                              }),
                              input: (base) => ({
                                ...base,
                                color: 'var(--text-primary)',
                              }),
                              option: (base, state) => ({
                                ...base,
                                backgroundColor: state.isFocused ? 'var(--accent-dim)' : 'transparent',
                                color: state.isFocused ? 'var(--accent)' : 'var(--text-primary)',
                                cursor: 'pointer'
                              }),
                              multiValue: (base) => ({
                                ...base,
                                backgroundColor: 'var(--accent-dim)',
                              }),
                              multiValueLabel: (base) => ({
                                ...base,
                                color: 'var(--accent)',
                              })
                            }}
                          />
                          {(item.selected_haspels || []).map(h => (
                            <div key={h.value} className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ flex: 1, fontSize: '12px', color: 'var(--text-secondary)' }}>{h.label}</div>
                              <input 
                                type="number" 
                                className="form-input" 
                                placeholder="Meter dipakai" 
                                style={{ width: '130px' }}
                                value={(item.haspel_meters || {})[h.value] || ''} 
                                onChange={e => updateItem(item.id, 'haspel_meters', { ...(item.haspel_meters || {}), [h.value]: e.target.value })} 
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {item.item_type === 'other' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <Select 
                            isMulti
                            options={otherOptions} 
                            placeholder="Pilih Barang Lainnya..."
                            value={item.selected_others || []}
                            onChange={val => updateItem(item.id, 'selected_others', val)}
                            styles={{
                              control: (base) => ({
                                ...base,
                                background: 'var(--bg-input)',
                                borderColor: 'var(--border)',
                                color: 'var(--text-primary)',
                              }),
                              menu: (base) => ({
                                ...base,
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                              }),
                              input: (base) => ({
                                ...base,
                                color: 'var(--text-primary)',
                              }),
                              option: (base, state) => ({
                                ...base,
                                backgroundColor: state.isFocused ? 'var(--accent-dim)' : 'transparent',
                                color: state.isFocused ? 'var(--accent)' : 'var(--text-primary)',
                                cursor: 'pointer'
                              }),
                              multiValue: (base) => ({
                                ...base,
                                backgroundColor: 'var(--accent-dim)',
                              }),
                              multiValueLabel: (base) => ({
                                ...base,
                                color: 'var(--accent)',
                              })
                            }}
                          />
                          {(item.selected_others || []).map(o => (
                            <div key={o.value} className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ flex: 1, fontSize: '12px', color: 'var(--text-secondary)' }}>{o.label}</div>
                              <input 
                                type="number" 
                                className="form-input" 
                                placeholder="Jumlah" 
                                min="1"
                                style={{ width: '100px' }}
                                value={(item.other_quantities || {})[o.value] || ''} 
                                onChange={e => updateItem(item.id, 'other_quantities', { ...(item.other_quantities || {}), [o.value]: e.target.value })} 
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label className="form-label">Note</label>
                <textarea className="form-input" rows={2} placeholder="Keterangan tambahan (opsional)" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer" style={{ position: 'sticky', bottom: 0, zIndex: 10, background: 'var(--bg-card)', borderTop: '1px solid var(--border)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', padding: '12px 18px', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={() => {
                const hasData = form.items.length > 0 || form.technicians.length > 0 || form.note
                if (hasData && !window.confirm('Data yang sudah diisi belum disimpan. Yakin ingin menutup?')) return
                resetForm()
                setIsModalOpen(false)
              }}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : 'Simpan Pengeluaran'}
              </button>
            </div>
          </div>
        </div>
      )}
      {isScheduleModalOpen && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>Tambah Jadwal Tim Teknisi</h3>
              <button className="btn-icon" onClick={() => setIsScheduleModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Tanggal <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="date" className="form-input" value={scheduleForm.schedule_date} onChange={e => setScheduleForm(f => ({ ...f, schedule_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Lokasi <span style={{ color: 'var(--danger)' }}>*</span></label>
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {technicians.map(t => (
                    <button key={t.id} type="button"
                      onClick={() => toggleScheduleTech(t.id)}
                      className={`badge ${scheduleForm.technicians.includes(t.id) ? 'badge-accent' : 'badge-muted'}`}
                      style={{ border: 'none', cursor: 'pointer', padding: '5px 10px' }}
                    >
                      {t.full_name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Note</label>
                <textarea className="form-input" rows={2} placeholder="Keterangan jadwal" value={scheduleForm.note} onChange={e => setScheduleForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsScheduleModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSaveSchedule} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : 'Simpan Jadwal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

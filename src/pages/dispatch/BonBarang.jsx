import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import toast from 'react-hot-toast'
import { Plus, ClipboardList, CheckCircle, X, Trash2, PackageCheck, Package } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import Select from 'react-select'

const SITES = [
  { value: 'banyumas', label: 'Banyumas' },
  { value: 'cilacap', label: 'Cilacap' },
  { value: 'cilacap_herman', label: 'Cilacap (Herman)' }
]

export default function BonBarang() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'

  const [activeTab, setActiveTab] = useState('sedang_dibawa')
  const [dispatches, setDispatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  const [technicians, setTechnicians] = useState([])
  const [snList, setSnList] = useState([])
  const [haspelList, setHaspelList] = useState([])
  const [otherItems, setOtherItems] = useState([])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    dispatch_date: format(new Date(), 'yyyy-MM-dd'),
    site: 'banyumas',
    technician_id: '',
    note: '',
    items: []
  })

  const [isLaporModalOpen, setIsLaporModalOpen] = useState(false)
  const [selectedDispatch, setSelectedDispatch] = useState(null)
  const [laporForm, setLaporForm] = useState({})
  const [laporSaving, setLaporSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [dispRes, techRes, snRes, haspelRes, otherRes] = await Promise.all([
        supabase
          .from('dispatches')
          .select('*, items:dispatch_items(*, sn:serial_numbers(serial_number), haspel:dropcore_haspels(haspel_code), warehouse_item:warehouses(item_name)), techs:users!technician_id(full_name)')
          .order('created_at', { ascending: false }),
        supabase.from('users').select('id, full_name').in('role', ['admin', 'teknisi']).eq('is_active', true),
        supabase.from('serial_numbers').select('id, serial_number').eq('status', 'tersedia'),
        supabase.from('dropcore_haspels').select('id, haspel_code, initial_meters, used_meters, type').in('status', ['tersedia']),
        supabase.from('warehouses').select('id, item_name, initial_stock').gt('initial_stock', 0)
      ])

      if (dispRes.data) setDispatches(dispRes.data)
      if (techRes.data) setTechnicians(techRes.data.map(t => ({ value: t.id, label: t.full_name })))
      if (snRes.data) setSnList(snRes.data)
      if (haspelRes.data) setHaspelList(haspelRes.data)
      if (otherRes.data) setOtherItems(otherRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Gagal mengambil data')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenAdd = () => {
    setForm({ dispatch_date: format(new Date(), 'yyyy-MM-dd'), site: 'banyumas', technician_id: '', note: '', items: [] })
    setIsModalOpen(true)
  }

  const addItemType = (type) => {
    setForm(f => ({ ...f, items: [...f.items, { id: Date.now().toString(), item_type: type }] }))
  }

  const removeItem = (itemId) => {
    setForm(f => ({ ...f, items: f.items.filter(i => i.id !== itemId) }))
  }

  const updateItem = (itemId, field, value) => {
    setForm(f => ({ ...f, items: f.items.map(i => i.id === itemId ? { ...i, [field]: value } : i) }))
  }

  const handleSaveBon = async () => {
    if (!form.technician_id) { toast.error('Pilih teknisi terlebih dahulu'); return }
    if (form.items.length === 0) { toast.error('Tambahkan minimal 1 barang'); return }

    setSaving(true)
    try {
      const itemsToInsert = []
      const ontIds = []
      const dcIds = []
      const whUpdates = []

      for (const item of form.items) {
        if (item.item_type === 'ont') {
          (item.selected_onts || []).forEach(opt => {
            itemsToInsert.push({ item_type: 'ont', serial_number_id: opt.value, quantity_dispatched: 1 })
            ontIds.push(opt.value)
          })
        } else if (item.item_type === 'dropcore') {
          (item.selected_haspels || []).forEach(opt => {
            itemsToInsert.push({ item_type: 'dropcore', haspel_id: opt.value, quantity_dispatched: 1 })
            dcIds.push(opt.value)
          })
        } else if (item.item_type === 'other') {
          (item.selected_others || []).forEach(opt => {
            const qty = item.other_quantities?.[opt.value] || 1
            if (qty > 0) {
              itemsToInsert.push({ item_type: 'other', warehouse_item_id: opt.value, quantity_dispatched: qty })
              whUpdates.push({ id: opt.value, qty })
            }
          })
        }
      }

      if (itemsToInsert.length === 0) { toast.error('Belum ada item valid yang dipilih'); setSaving(false); return }

      const { data: dData, error: dErr } = await supabase.from('dispatches').insert({
        dispatch_date: form.dispatch_date,
        technician_id: form.technician_id,
        site: form.site,
        notes: form.note,
        status: 'sedang_dibawa',
        created_by: profile.id
      }).select('id').single()
      if (dErr) throw dErr

      const { error: iErr } = await supabase.from('dispatch_items').insert(itemsToInsert.map(i => ({ ...i, dispatch_id: dData.id })))
      if (iErr) throw iErr

      if (ontIds.length > 0) await supabase.from('serial_numbers').update({ status: 'dibawa teknisi' }).in('id', ontIds)
      if (dcIds.length > 0) await supabase.from('dropcore_haspels').update({ status: 'dibawa teknisi' }).in('id', dcIds)
      for (const wh of whUpdates) {
        const { data: wItem } = await supabase.from('warehouses').select('initial_stock, stock_on_hold').eq('id', wh.id).single()
        if (wItem) {
          await supabase.from('warehouses').update({
            initial_stock: Number(wItem.initial_stock || 0) - Number(wh.qty),
            stock_on_hold: Number(wItem.stock_on_hold || 0) + Number(wh.qty)
          }).eq('id', wh.id)
        }
      }

      toast.success('Bon Barang berhasil dibuat!')
      setIsModalOpen(false)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error('Terjadi kesalahan saat menyimpan')
    } finally {
      setSaving(false)
    }
  }

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
      const expItemsToInsert = []
      const dispatchUpdates = []
      const ontReturns = []
      const ontUsed = []
      const dcUpdates = []
      const whReturns = []
      const whUsed = []

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
          technicians: [selectedDispatch.technician_id],
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
        if (hData) {
          const newUsed = Number(hData.used_meters || 0) + Number(dc.add_meters)
          await supabase.from('dropcore_haspels').update({ used_meters: newUsed, status: newUsed >= Number(hData.initial_meters) ? 'habis' : 'tersedia' }).eq('id', dc.id)
        }
      }
      for (const wh of whReturns) {
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
    } finally {
      setLaporSaving(false)
    }
  }

  const handleDelete = async (dispatch) => {
    if (!window.confirm('Yakin ingin membatalkan bon ini? Semua stok akan dikembalikan ke gudang.')) return
    const ontReturns = [], dcReturns = [], whReturns = []
    for (const it of dispatch.items) {
      if (it.item_type === 'ont') ontReturns.push(it.serial_number_id)
      if (it.item_type === 'dropcore') dcReturns.push(it.haspel_id)
      if (it.item_type === 'other') whReturns.push({ id: it.warehouse_item_id, qty: it.quantity_dispatched })
    }
    if (ontReturns.length > 0) await supabase.from('serial_numbers').update({ status: 'tersedia' }).in('id', ontReturns)
    if (dcReturns.length > 0) await supabase.from('dropcore_haspels').update({ status: 'tersedia' }).in('id', dcReturns)
    for (const wh of whReturns) {
      const { data: wData } = await supabase.from('warehouses').select('initial_stock, stock_on_hold').eq('id', wh.id).single()
      if (wData) await supabase.from('warehouses').update({ initial_stock: Number(wData.initial_stock || 0) + Number(wh.qty), stock_on_hold: Math.max(0, Number(wData.stock_on_hold || 0) - Number(wh.qty)) }).eq('id', wh.id)
    }
    await supabase.from('dispatches').delete().eq('id', dispatch.id)
    toast.success('Bon berhasil dibatalkan')
    fetchData()
  }

  const ontOptions = snList.map(sn => ({ value: sn.id, label: sn.serial_number }))
  const haspelOptions = haspelList.map(h => {
    const sisa = Number(h.initial_meters || 0) - Number(h.used_meters || 0)
    return { value: h.id, label: `${h.haspel_code} (${h.type?.toUpperCase() || ''}) — sisa ${sisa}m`, sisa }
  }).filter(h => h.sisa > 0)
  const otherOptions = otherItems.map(w => ({ value: w.id, label: `${w.item_name} (stok: ${w.initial_stock})` }))

  const activeDispatches = dispatches.filter(d => d.status === 'sedang_dibawa')
  const historyDispatches = dispatches.filter(d => d.status !== 'sedang_dibawa')
  const displayed = activeTab === 'sedang_dibawa' ? activeDispatches : historyDispatches

  const ITEM_TYPE_LABELS = { ont: 'ONT', dropcore: 'Dropcore', other: 'Material Lain' }
  const ITEM_TYPE_COLORS = { ont: 'var(--accent)', dropcore: 'var(--warning)', other: 'var(--success)' }

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h2>Bon Barang</h2>
          <p>Catat barang yang dibawa teknisi ke lapangan &amp; rekam pemakaian aktual</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={handleOpenAdd}>
            <Plus size={16} /> Buat Bon Baru
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
              <Package size={20} style={{ color: 'var(--warning)' }} />
            </div>
            <div className="stat-card-value">{activeDispatches.length}</div>
          </div>
          <div className="stat-card-label">Sedang Dibawa</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon" style={{ background: 'rgba(16,185,129,0.15)' }}>
              <PackageCheck size={20} style={{ color: 'var(--success)' }} />
            </div>
            <div className="stat-card-value">{historyDispatches.length}</div>
          </div>
          <div className="stat-card-label">Bon Selesai</div>
        </div>
      </div>

      {/* Tab Navigation + Table */}
      <div className="card">
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {[
            { key: 'sedang_dibawa', label: `Sedang Dibawa (${activeDispatches.length})` },
            { key: 'riwayat', label: 'Riwayat Bon' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '14px 20px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.key ? 700 : 400,
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="card-body">
          {loading ? (
            <div className="flex-center" style={{ height: '200px' }}><div className="spinner" /></div>
          ) : displayed.length > 0 ? (
            <div className="mobile-card-list" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))', gap: '12px' }}>
              {displayed.map(d => {
                const isExpanded = expandedId === d.id
                return (
                  <div
                    key={d.id}
                    className="mobile-card"
                    style={{ borderLeft: `4px solid ${d.status === 'sedang_dibawa' ? 'var(--warning)' : 'var(--success)'}` }}
                  >
                    {/* Card Header — always visible, clickable */}
                    <div
                      className="mobile-card-header"
                      onClick={() => setExpandedId(isExpanded ? null : d.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="mobile-card-title">
                          {format(new Date(d.dispatch_date), 'dd MMM yyyy', { locale: id })}
                        </div>
                        <div className="mobile-card-subtitle" style={{ fontWeight: 600, color: 'var(--accent)' }}>
                          {d.techs?.full_name || 'Teknisi'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                        <span className={`badge ${d.status === 'sedang_dibawa' ? 'badge-warning' : 'badge-success'}`}>
                          {d.status === 'sedang_dibawa' ? 'Sedang Dibawa' : 'Selesai'}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {d.items?.length || 0} item
                        </span>
                      </div>
                    </div>

                    {/* Card Body — expandable */}
                    {isExpanded && (
                      <div className="mobile-card-body">
                        <div className="mobile-info-row">
                          <span className="mobile-info-label">Lokasi</span>
                          <span className="mobile-info-value">{SITES.find(s => s.value === d.site)?.label || d.site}</span>
                        </div>
                        {d.notes && (
                          <div className="mobile-info-row">
                            <span className="mobile-info-label">Catatan</span>
                            <span className="mobile-info-value">{d.notes}</span>
                          </div>
                        )}

                        <div style={{ marginTop: '12px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Daftar Barang
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {d.items?.map((it, i) => {
                              let name = ''
                              let detail = ''
                              let statusBadge = null
                              if (it.item_type === 'ont') {
                                name = it.sn?.serial_number || '-'
                                if (d.status === 'selesai') statusBadge = it.quantity_used > 0
                                  ? <span className="badge badge-danger" style={{ fontSize: '10px', padding: '1px 6px' }}>Terpakai</span>
                                  : <span className="badge badge-success" style={{ fontSize: '10px', padding: '1px 6px' }}>Kembali</span>
                              } else if (it.item_type === 'dropcore') {
                                name = it.haspel?.haspel_code || '-'
                                if (d.status === 'selesai') detail = `${it.meters_used}m terpakai`
                              } else if (it.item_type === 'other') {
                                name = it.warehouse_item?.item_name || 'Barang'
                                detail = d.status === 'selesai' ? `${it.quantity_used} terpakai, ${it.quantity_returned} kembali` : `× ${it.quantity_dispatched}`
                              }
                              return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'var(--bg-primary)', borderRadius: '6px' }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: ITEM_TYPE_COLORS[it.item_type], flexShrink: 0 }} />
                                  <span style={{ fontSize: '12px', fontWeight: 500, flex: 1 }}>{name}</span>
                                  {detail && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{detail}</span>}
                                  {statusBadge}
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {d.status === 'sedang_dibawa' && (
                          <div className="mobile-card-actions" style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ flex: 1 }}
                              onClick={() => handleOpenLapor(d)}
                            >
                              <CheckCircle size={14} /> Lapor Pemakaian
                            </button>
                            {(role === 'superadmin' || role === 'admin') && (
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ color: 'var(--danger)' }}
                                onClick={() => handleDelete(d)}
                                title="Batalkan Bon"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="empty-state">
              <ClipboardList size={48} />
              <h3>Belum Ada Data</h3>
              <p>{activeTab === 'sedang_dibawa' ? 'Belum ada bon barang yang sedang dalam pengiriman.' : 'Belum ada riwayat bon yang selesai.'}</p>
            </div>
          )}
        </div>
      </div>

      {/* ======= MODAL BUAT BON ======= */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal modal-lg" style={{ display: 'flex', flexDirection: 'column', maxHeight: '93vh' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Buat Bon Barang Baru</h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Catat barang yang akan dibawa teknisi ke lapangan
                </p>
              </div>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>

            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              {/* Info Fields */}
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tanggal Berangkat</label>
                  <input type="date" className="form-input" value={form.dispatch_date} onChange={e => setForm({ ...form, dispatch_date: e.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Teknisi</label>
                  <Select
                    options={technicians}
                    value={technicians.find(t => t.value === form.technician_id) || null}
                    onChange={val => setForm({ ...form, technician_id: val?.value || '' })}
                    placeholder="Pilih teknisi..."
                    styles={{ control: (base) => ({ ...base, minHeight: '40px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }) }}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Lokasi / Site</label>
                  <select className="form-input" value={form.site} onChange={e => setForm({ ...form, site: e.target.value })}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Catatan (opsional)</label>
                  <input type="text" className="form-input" placeholder="Misal: PSB Pak Budi..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
                </div>
              </div>

              {/* Item Section */}
              <div style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>Daftar Barang Dibawa</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Tambahkan barang yang akan dibawa</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => addItemType('ont')} style={{ fontSize: '12px' }}>
                      <Plus size={13} /> ONT
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => addItemType('dropcore')} style={{ fontSize: '12px' }}>
                      <Plus size={13} /> Dropcore
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => addItemType('other')} style={{ fontSize: '12px' }}>
                      <Plus size={13} /> Material
                    </button>
                  </div>
                </div>

                {form.items.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Klik tombol di atas untuk menambahkan barang bawaan
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {form.items.map((item, idx) => (
                      <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: ITEM_TYPE_COLORS[item.item_type] }} />
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>
                              {ITEM_TYPE_LABELS[item.item_type]} #{idx + 1}
                            </span>
                          </div>
                          <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}>
                            <Trash2 size={15} />
                          </button>
                        </div>

                        <div style={{ padding: '12px 14px' }}>
                          {item.item_type === 'ont' && (
                            <Select
                              isMulti
                              options={ontOptions}
                              placeholder="Pilih Serial Number ONT..."
                              value={item.selected_onts || []}
                              onChange={val => updateItem(item.id, 'selected_onts', val)}
                              styles={{ control: (base) => ({ ...base, background: 'var(--bg-card)', border: '1px solid var(--border)' }) }}
                            />
                          )}
                          {item.item_type === 'dropcore' && (
                            <Select
                              isMulti
                              options={haspelOptions}
                              placeholder="Pilih Haspel Dropcore..."
                              value={item.selected_haspels || []}
                              onChange={val => updateItem(item.id, 'selected_haspels', val)}
                              styles={{ control: (base) => ({ ...base, background: 'var(--bg-card)', border: '1px solid var(--border)' }) }}
                            />
                          )}
                          {item.item_type === 'other' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <Select
                                isMulti
                                options={otherOptions}
                                placeholder="Pilih Material..."
                                value={item.selected_others || []}
                                onChange={val => updateItem(item.id, 'selected_others', val)}
                                styles={{ control: (base) => ({ ...base, background: 'var(--bg-card)', border: '1px solid var(--border)' }) }}
                              />
                              {(item.selected_others || []).length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                                  {(item.selected_others || []).map(opt => (
                                    <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', background: 'var(--bg-primary)', borderRadius: '6px' }}>
                                      <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-secondary)' }}>{opt.label}</span>
                                      <input
                                        type="number"
                                        className="form-input"
                                        style={{ width: '80px', height: '34px', textAlign: 'center' }}
                                        min="1"
                                        placeholder="Qty"
                                        value={item.other_quantities?.[opt.value] || ''}
                                        onChange={e => updateItem(item.id, 'other_quantities', { ...item.other_quantities, [opt.value]: Number(e.target.value) })}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSaveBon}>
                {saving ? 'Menyimpan...' : 'Simpan Bon & Kunci Stok'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======= MODAL LAPOR PEMAKAIAN ======= */}
      {isLaporModalOpen && selectedDispatch && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '560px', maxWidth: '95%', maxHeight: '93vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Lapor Pemakaian</h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {selectedDispatch.techs?.full_name} · {format(new Date(selectedDispatch.dispatch_date), 'dd MMM yyyy', { locale: id })}
                </p>
              </div>
              <button className="btn-close" onClick={() => setIsLaporModalOpen(false)}><X size={20} /></button>
            </div>

            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                💡 Centang / isi jumlah barang yang <strong>benar-benar terpakai</strong>. Sisa akan otomatis dikembalikan ke stok gudang.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {selectedDispatch.items.map((it) => (
                  <div key={it.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    {/* Item header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: ITEM_TYPE_COLORS[it.item_type] }} />
                      <span style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.4px', color: ITEM_TYPE_COLORS[it.item_type] }}>{ITEM_TYPE_LABELS[it.item_type]}</span>
                    </div>

                    {/* Item content */}
                    <div style={{ padding: '12px 14px' }}>
                      {it.item_type === 'ont' && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{it.sn?.serial_number || '-'}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Centang jika ONT ini terpasang</div>
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: laporForm[it.id]?.used ? 'rgba(16,185,129,0.1)' : 'var(--bg-primary)', transition: 'all 0.2s' }}>
                            <input
                              type="checkbox"
                              checked={laporForm[it.id]?.used || false}
                              onChange={e => setLaporForm({ ...laporForm, [it.id]: { used: e.target.checked } })}
                              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--success)' }}
                            />
                            <span style={{ fontSize: '13px', fontWeight: 600, color: laporForm[it.id]?.used ? 'var(--success)' : 'var(--text-secondary)' }}>
                              {laporForm[it.id]?.used ? 'Terpakai ✓' : 'Belum / Kembali'}
                            </span>
                          </label>
                        </div>
                      )}

                      {it.item_type === 'dropcore' && (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>{it.haspel?.haspel_code || '-'}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <label style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Meter terpakai:</label>
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: '110px', height: '36px', textAlign: 'center' }}
                              min="0"
                              placeholder="0"
                              value={laporForm[it.id]?.meters_used || ''}
                              onChange={e => setLaporForm({ ...laporForm, [it.id]: { meters_used: e.target.value } })}
                            />
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>meter</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                              {Number(laporForm[it.id]?.meters_used || 0) === 0 ? '→ Seluruhnya dikembalikan' : ''}
                            </span>
                          </div>
                        </div>
                      )}

                      {it.item_type === 'other' && (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>{it.warehouse_item?.item_name || 'Barang'}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Qty terpakai:</label>
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: '80px', height: '36px', textAlign: 'center' }}
                              min="0"
                              max={it.quantity_dispatched}
                              placeholder="0"
                              value={laporForm[it.id]?.qty_used || ''}
                              onChange={e => setLaporForm({ ...laporForm, [it.id]: { qty_used: e.target.value } })}
                            />
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>dari {it.quantity_dispatched} dibawa</span>
                            {Number(laporForm[it.id]?.qty_used || 0) < Number(it.quantity_dispatched) && (
                              <span style={{ fontSize: '12px', color: 'var(--success)', marginLeft: 'auto' }}>
                                {Number(it.quantity_dispatched) - Number(laporForm[it.id]?.qty_used || 0)} kembali ke gudang
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsLaporModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" disabled={laporSaving} onClick={handleSaveLapor}>
                {laporSaving ? 'Menyimpan...' : '✓ Selesaikan & Kembalikan Stok'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import toast from 'react-hot-toast'
import { Plus, ClipboardList, CheckCircle, X, Trash2 } from 'lucide-react'
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
  
  const [technicians, setTechnicians] = useState([])
  const [snList, setSnList] = useState([])
  const [haspelList, setHaspelList] = useState([])
  const [otherItems, setOtherItems] = useState([])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ dispatch_date: format(new Date(), 'yyyy-MM-dd'), site: 'banyumas', technician_id: '', note: '', items: [] })

  const [isLaporModalOpen, setIsLaporModalOpen] = useState(false)
  const [selectedDispatch, setSelectedDispatch] = useState(null)
  const [laporForm, setLaporForm] = useState({}) // { [dispatchItemId]: { used: boolean/number } }
  const [laporSaving, setLaporSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [dispRes, techRes, snRes, haspelRes, otherRes] = await Promise.all([
        supabase.from('dispatches').select('*, items:dispatch_items(*, sn:serial_numbers(serial_number), haspel:dropcore_haspels(haspel_code), warehouse_item:warehouses(item_name)), techs:users!technician_id(full_name)').order('created_at', { ascending: false }),
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

  // --- BUAT BON LOGIC ---
  const handleOpenAdd = () => {
    setForm({ dispatch_date: format(new Date(), 'yyyy-MM-dd'), site: 'banyumas', technician_id: '', note: '', items: [] })
    setIsModalOpen(true)
  }

  const addItemType = (type) => {
    setForm(f => ({
      ...f,
      items: [...f.items, { id: Date.now().toString(), item_type: type }]
    }))
  }

  const removeItem = (id) => {
    setForm(f => ({ ...f, items: f.items.filter(i => i.id !== id) }))
  }

  const updateItem = (id, field, value) => {
    setForm(f => ({
      ...f,
      items: f.items.map(i => i.id === id ? { ...i, [field]: value } : i)
    }))
  }

  const handleSaveBon = async () => {
    if (!form.technician_id) { toast.error('Pilih teknisi'); return }
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

      if (itemsToInsert.length === 0) {
        toast.error('Belum ada item valid yang dipilih')
        setSaving(false)
        return
      }

      const { data: dData, error: dErr } = await supabase.from('dispatches').insert({
        dispatch_date: form.dispatch_date,
        technician_id: form.technician_id,
        site: form.site,
        notes: form.note,
        status: 'sedang_dibawa',
        created_by: profile.id
      }).select('id').single()

      if (dErr) throw dErr
      const dispatchId = dData.id

      const itemsData = itemsToInsert.map(i => ({ ...i, dispatch_id: dispatchId }))
      const { error: iErr } = await supabase.from('dispatch_items').insert(itemsData)
      if (iErr) throw iErr

      if (ontIds.length > 0) {
        await supabase.from('serial_numbers').update({ status: 'dibawa teknisi' }).in('id', ontIds)
      }
      if (dcIds.length > 0) {
        await supabase.from('dropcore_haspels').update({ status: 'dibawa teknisi' }).in('id', dcIds)
      }
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
      toast.error('Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  // --- LAPOR PEMAKAIAN LOGIC ---
  const handleOpenLapor = (dispatch) => {
    setSelectedDispatch(dispatch)
    const initForm = {}
    dispatch.items.forEach(it => {
      if (it.item_type === 'ont') {
        initForm[it.id] = { used: false }
      } else if (it.item_type === 'dropcore') {
        initForm[it.id] = { meters_used: 0 }
      } else if (it.item_type === 'other') {
        initForm[it.id] = { qty_used: 0 }
      }
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
          if (used) {
            ontUsed.push(it.serial_number_id)
            expItemsToInsert.push({ item_type: 'ont', serial_number_id: it.serial_number_id, quantity: 1 })
          } else {
            ontReturns.push(it.serial_number_id)
          }
        } else if (it.item_type === 'dropcore') {
          const meters = Number(lapor?.meters_used || 0)
          dispatchUpdates.push({ id: it.id, meters_used: meters })
          if (meters > 0) {
            expItemsToInsert.push({ item_type: 'dropcore', haspel_id: it.haspel_id, meters_used: meters, quantity: 1 })
          }
          dcUpdates.push({ id: it.haspel_id, add_meters: meters })
        } else if (it.item_type === 'other') {
          const qUsed = Number(lapor?.qty_used || 0)
          const qRet = Number(it.quantity_dispatched) - qUsed
          dispatchUpdates.push({ id: it.id, quantity_used: qUsed, quantity_returned: qRet })
          if (qUsed > 0) {
            expItemsToInsert.push({ item_type: 'other', warehouse_item_id: it.warehouse_item_id, quantity: qUsed })
            whUsed.push({ id: it.warehouse_item_id, qty: qUsed })
          }
          if (qRet > 0) {
            whReturns.push({ id: it.warehouse_item_id, qty: qRet })
          }
        }
      }

      // Create Daily Expense
      if (expItemsToInsert.length > 0) {
        const { data: expData, error: expErr } = await supabase.from('daily_expenses').insert({
          expense_date: format(new Date(), 'yyyy-MM-dd'), // Today as report date
          site: selectedDispatch.site,
          technicians: [selectedDispatch.technician_id],
          work_type: 'ikr_psb',
          note: 'Otomatis dari Laporan Bon Barang',
          created_by: profile.id
        }).select('id').single()

        if (expErr) throw expErr

        const finalExpItems = expItemsToInsert.map(i => ({ ...i, expense_id: expData.id }))
        await supabase.from('expense_items').insert(finalExpItems)
      }

      for (const up of dispatchUpdates) {
        await supabase.from('dispatch_items').update(up).eq('id', up.id)
      }
      
      await supabase.from('dispatches').update({ status: 'selesai', updated_at: new Date().toISOString() }).eq('id', selectedDispatch.id)

      if (ontReturns.length > 0) await supabase.from('serial_numbers').update({ status: 'tersedia' }).in('id', ontReturns)
      if (ontUsed.length > 0) await supabase.from('serial_numbers').update({ status: 'terpakai' }).in('id', ontUsed)
      
      for (const dc of dcUpdates) {
        const { data: hData } = await supabase.from('dropcore_haspels').select('initial_meters, used_meters').eq('id', dc.id).single()
        if (hData) {
          const newUsed = Number(hData.used_meters || 0) + Number(dc.add_meters)
          const st = newUsed >= Number(hData.initial_meters) ? 'habis' : 'tersedia'
          await supabase.from('dropcore_haspels').update({ used_meters: newUsed, status: st }).eq('id', dc.id)
        }
      }

      for (const wh of whReturns) {
        const { data: wData } = await supabase.from('warehouses').select('initial_stock, stock_on_hold').eq('id', wh.id).single()
        if (wData) {
          await supabase.from('warehouses').update({
            initial_stock: Number(wData.initial_stock || 0) + Number(wh.qty),
            stock_on_hold: Math.max(0, Number(wData.stock_on_hold || 0) - Number(wh.qty))
          }).eq('id', wh.id)
        }
      }
      
      for (const wh of whUsed) {
        const { data: wData } = await supabase.from('warehouses').select('stock_on_hold').eq('id', wh.id).single()
        if (wData) {
          await supabase.from('warehouses').update({
            stock_on_hold: Math.max(0, Number(wData.stock_on_hold || 0) - Number(wh.qty))
          }).eq('id', wh.id)
        }
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
    if (!window.confirm('Yakin ingin membatalkan bon ini? Stok akan dikembalikan ke gudang.')) return
    
    const ontReturns = []
    const dcReturns = []
    const whReturns = []

    for (const it of dispatch.items) {
      if (it.item_type === 'ont') ontReturns.push(it.serial_number_id)
      if (it.item_type === 'dropcore') dcReturns.push(it.haspel_id)
      if (it.item_type === 'other') whReturns.push({ id: it.warehouse_item_id, qty: it.quantity_dispatched })
    }

    if (ontReturns.length > 0) await supabase.from('serial_numbers').update({ status: 'tersedia' }).in('id', ontReturns)
    if (dcReturns.length > 0) await supabase.from('dropcore_haspels').update({ status: 'tersedia' }).in('id', dcReturns)
    for (const wh of whReturns) {
        const { data: wData } = await supabase.from('warehouses').select('initial_stock, stock_on_hold').eq('id', wh.id).single()
        if (wData) {
          await supabase.from('warehouses').update({
            initial_stock: Number(wData.initial_stock || 0) + Number(wh.qty),
            stock_on_hold: Math.max(0, Number(wData.stock_on_hold || 0) - Number(wh.qty))
          }).eq('id', wh.id)
        }
    }

    await supabase.from('dispatches').delete().eq('id', dispatch.id)
    toast.success('Bon dibatalkan')
    fetchData()
  }

  const ontOptions = snList.map(sn => ({ value: sn.id, label: sn.serial_number }))
  const haspelOptions = haspelList.map(h => {
    const sisa = Number(h.initial_meters || 0) - Number(h.used_meters || 0)
    return { value: h.id, label: `${h.haspel_code} (${h.type?.toUpperCase() || ''}, sisa: ${sisa}m)`, sisa }
  }).filter(h => h.sisa > 0)
  const otherOptions = otherItems.map(w => ({ value: w.id, label: `${w.item_name} (sisa: ${w.initial_stock})` }))

  const activeDispatches = dispatches.filter(d => d.status === 'sedang_dibawa')
  const historyDispatches = dispatches.filter(d => d.status !== 'sedang_dibawa')
  const displayed = activeTab === 'sedang_dibawa' ? activeDispatches : historyDispatches

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <h2 className="card-title"><ClipboardList className="icon" /> Bon Barang</h2>
        {(can(role, 'pengeluaran.add') || true) && (
          <button className="btn btn-primary" onClick={handleOpenAdd}>
            <Plus size={16} /> Buat Bon Baru
          </button>
        )}
      </div>

      <div className="tabs" style={{ padding: '0 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '20px' }}>
        <button className={`tab ${activeTab === 'sedang_dibawa' ? 'active' : ''}`} onClick={() => setActiveTab('sedang_dibawa')} style={{ padding: '10px 0', borderBottom: activeTab === 'sedang_dibawa' ? '2px solid var(--accent)' : 'none', background: 'none', color: activeTab === 'sedang_dibawa' ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
          Sedang Dibawa ({activeDispatches.length})
        </button>
        <button className={`tab ${activeTab === 'riwayat' ? 'active' : ''}`} onClick={() => setActiveTab('riwayat')} style={{ padding: '10px 0', borderBottom: activeTab === 'riwayat' ? '2px solid var(--accent)' : 'none', background: 'none', color: activeTab === 'riwayat' ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
          Riwayat Bon
        </button>
      </div>

      <div className="card-body">
        {loading ? (
          <div className="flex-center" style={{ height: '200px' }}><div className="spinner" /></div>
        ) : displayed.length > 0 ? (
          <div className="mobile-card-list" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))', gap: '15px' }}>
            {displayed.map(d => (
              <div key={d.id} className="mobile-card" style={{ borderLeft: `4px solid ${d.status === 'sedang_dibawa' ? 'var(--warning)' : 'var(--success)'}` }}>
                <div className="mobile-card-header">
                  <div style={{ flex: 1 }}>
                    <div className="mobile-card-title">{format(new Date(d.dispatch_date), 'dd MMM yyyy', { locale: id })}</div>
                    <div className="mobile-card-subtitle text-accent" style={{ fontWeight: 600 }}>{d.techs?.full_name || 'Teknisi'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {d.status === 'sedang_dibawa' ? <span className="badge badge-warning">Sedang Dibawa</span> : <span className="badge badge-success">Selesai</span>}
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-info-row"><span className="mobile-info-label">Lokasi</span><span className="mobile-info-value">{SITES.find(s => s.value === d.site)?.label || d.site}</span></div>
                  
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>DAFTAR BARANG:</div>
                    {d.items?.map((it, i) => {
                      let label = ''
                      let usedLabel = ''
                      if (it.item_type === 'ont') {
                        label = `ONT: ${it.sn?.serial_number || '-'}`
                        if (d.status === 'selesai') usedLabel = it.quantity_used > 0 ? '(Terpakai)' : '(Kembali)'
                      } else if (it.item_type === 'dropcore') {
                        label = `Dropcore: ${it.haspel?.haspel_code || '-'}`
                        if (d.status === 'selesai') usedLabel = `(Terpakai ${it.meters_used}m)`
                      } else if (it.item_type === 'other') {
                        label = `${it.warehouse_item?.item_name || 'Barang'} × ${it.quantity_dispatched}`
                        if (d.status === 'selesai') usedLabel = `(Terpakai ${it.quantity_used})`
                      }
                      return (
                        <div key={i} style={{ fontSize: '13px', padding: '2px 0', display: 'flex', justifyContent: 'space-between' }}>
                          <span>• {label}</span>
                          {usedLabel && <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{usedLabel}</span>}
                        </div>
                      )
                    })}
                  </div>

                  {d.status === 'sedang_dibawa' && (
                    <div className="mobile-card-actions" style={{ marginTop: '15px' }}>
                      <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => handleOpenLapor(d)}>
                        <CheckCircle size={14} /> Lapor Pemakaian
                      </button>
                      {(role === 'superadmin' || role === 'admin') && (
                        <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(d)} title="Hapus Bon">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state"><ClipboardList size={48} /><h3>Belum Ada Data</h3><p>Tidak ada bon di tab ini.</p></div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal modal-lg" style={{ display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Buat Bon Barang Baru</h3>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Tanggal</label>
                  <input type="date" className="form-input" value={form.dispatch_date} onChange={e => setForm({ ...form, dispatch_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Teknisi</label>
                  <Select options={technicians} value={technicians.find(t => t.value === form.technician_id)} onChange={val => setForm({ ...form, technician_id: val?.value })} placeholder="Pilih teknisi..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Lokasi / Site</label>
                  <select className="form-input" value={form.site} onChange={e => setForm({ ...form, site: e.target.value })}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Catatan</label>
                  <input type="text" className="form-input" placeholder="Opsional..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
                </div>
              </div>

              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => addItemType('ont')}><Plus size={14} /> ONT</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => addItemType('dropcore')}><Plus size={14} /> Dropcore</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => addItemType('other')}><Plus size={14} /> Material Lain</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {form.items.map((item, idx) => (
                    <div key={item.id} className="card" style={{ padding: '15px', background: 'var(--bg-primary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', fontSize: '13px' }}>Item {idx + 1}: {item.item_type}</span>
                        <button className="btn-close text-danger" onClick={() => removeItem(item.id)}><Trash2 size={16} /></button>
                      </div>
                      
                      {item.item_type === 'ont' && (
                        <div className="form-group mb-0">
                          <Select isMulti options={ontOptions} placeholder="Pilih ONT..." value={item.selected_onts || []} onChange={val => updateItem(item.id, 'selected_onts', val)} />
                        </div>
                      )}

                      {item.item_type === 'dropcore' && (
                        <div className="form-group mb-0">
                          <Select isMulti options={haspelOptions} placeholder="Pilih Haspel Dropcore..." value={item.selected_haspels || []} onChange={val => updateItem(item.id, 'selected_haspels', val)} />
                        </div>
                      )}

                      {item.item_type === 'other' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <Select isMulti options={otherOptions} placeholder="Pilih Material..." value={item.selected_others || []} onChange={val => updateItem(item.id, 'selected_others', val)} />
                          {(item.selected_others || []).map(opt => (
                            <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '10px' }}>
                              <span style={{ flex: 1, fontSize: '13px' }}>{opt.label}</span>
                              <input type="number" className="form-input" style={{ width: '80px', height: '30px' }} min="1" value={item.other_quantities?.[opt.value] || ''} onChange={e => updateItem(item.id, 'other_quantities', { ...item.other_quantities, [opt.value]: Number(e.target.value) })} placeholder="Qty" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {form.items.length === 0 && <div className="empty-state" style={{ padding: '20px' }}><p>Pilih tombol di atas untuk menambahkan barang.</p></div>}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSaveBon}>{saving ? 'Menyimpan...' : 'Simpan Bon'}</button>
            </div>
          </div>
        </div>
      )}

      {isLaporModalOpen && selectedDispatch && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '600px', maxWidth: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Lapor Pemakaian - {selectedDispatch.techs?.full_name}</h3>
              <button className="btn-close" onClick={() => setIsLaporModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '15px' }}>Tentukan barang mana saja yang benar-benar terpakai. Sisa barang akan otomatis dikembalikan ke stok gudang.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {selectedDispatch.items.map((it) => (
                  <div key={it.id} className="card" style={{ padding: '15px', background: 'var(--bg-primary)' }}>
                    {it.item_type === 'ont' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>ONT</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>SN: {it.sn?.serial_number}</div>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={laporForm[it.id]?.used || false} onChange={e => setLaporForm({ ...laporForm, [it.id]: { used: e.target.checked } })} style={{ width: '18px', height: '18px' }} />
                          <span style={{ fontSize: '14px', fontWeight: 600, color: laporForm[it.id]?.used ? 'var(--success)' : 'var(--text-primary)' }}>{laporForm[it.id]?.used ? 'Terpakai' : 'Kembali'}</span>
                        </label>
                      </div>
                    )}
                    
                    {it.item_type === 'dropcore' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>Dropcore</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Kode: {it.haspel?.haspel_code}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '13px' }}>Terpakai:</span>
                          <input type="number" className="form-input" style={{ width: '100px' }} min="0" placeholder="Meter" value={laporForm[it.id]?.meters_used || ''} onChange={e => setLaporForm({ ...laporForm, [it.id]: { meters_used: Number(e.target.value) } })} />
                          <span style={{ fontSize: '13px' }}>m</span>
                        </div>
                      </div>
                    )}

                    {it.item_type === 'other' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{it.warehouse_item?.item_name}</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Dibawa: {it.quantity_dispatched}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '13px' }}>Terpakai:</span>
                          <input type="number" className="form-input" style={{ width: '80px' }} min="0" max={it.quantity_dispatched} value={laporForm[it.id]?.qty_used || ''} onChange={e => setLaporForm({ ...laporForm, [it.id]: { qty_used: Number(e.target.value) } })} />
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>(Sisa: {Number(it.quantity_dispatched) - Number(laporForm[it.id]?.qty_used || 0)} kembali)</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsLaporModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" disabled={laporSaving} onClick={handleSaveLapor}>{laporSaving ? 'Menyimpan...' : 'Simpan Laporan'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

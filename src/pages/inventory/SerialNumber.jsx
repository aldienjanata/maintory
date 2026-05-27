import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, Edit2, X, Hash, UploadCloud, CheckCircle, Clock, FileDown, Upload, Download } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import * as XLSX from 'xlsx'

export default function SerialNumber() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'

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

  const handleBrandInput = async (brandName) => {
    setForm(f => ({ ...f, brand_name: brandName, brand_id: '', type_id: '', type_name: '' }))
    setTypes([])
    // Cari brand yang match persis (case insensitive)
    const matched = brands.find(b => b.brand_name.toLowerCase() === brandName.toLowerCase())
    if (matched) {
      setForm(f => ({ ...f, brand_id: matched.id }))
      fetchTypes(matched.id)
    }
  }

  const handleTypeInput = (typeName) => {
    setForm(f => ({ ...f, type_name: typeName, type_id: '' }))
    const matched = types.find(t => t.type_name.toLowerCase() === typeName.toLowerCase())
    if (matched) {
      setForm(f => ({ ...f, type_id: matched.id }))
    }
  }

  const handleSaveSingle = async () => {
    if (!form.serial_number) { toast.error('Serial Number wajib diisi'); return }
    setSaving(true)
    try {
      let brandId = form.brand_id || null
      let typeId = form.type_id || null

      // Buat merk baru jika diketik manual dan belum ada
      if (form.brand_name && !brandId) {
        const { data: newBrand, error } = await supabase.from('ont_brands').insert([{ brand_name: form.brand_name.trim() }]).select().single()
        if (error && error.code !== '23505') throw error
        if (newBrand) brandId = newBrand.id
        else {
          // Sudah ada, fetch id-nya
          const { data: ex } = await supabase.from('ont_brands').select('id').ilike('brand_name', form.brand_name.trim()).single()
          if (ex) brandId = ex.id
        }
      }

      // Buat tipe baru jika diketik manual dan belum ada
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
        const { error } = await supabase.from('serial_numbers').insert({
          brand_id: brandId,
          type_id: typeId,
          serial_number: form.serial_number,
          date_in: form.date_in,
          note: form.note,
          status: 'tersedia',
          created_by: profile.id
        })
        if (error) throw error
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

      const inserts = lines.map(sn => ({
        brand_id: brandId,
        type_id: typeId,
        serial_number: sn,
        date_in: form.date_in,
        status: 'tersedia',
        created_by: profile.id
      }))
      const { error } = await supabase.from('serial_numbers').insert(inserts)
      if (error) throw error
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

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(i => ({
      'Serial Number': i.serial_number,
      'Merk': i.brand?.brand_name || '-',
      'Tipe': i.type?.type_name || '-',
      'Tanggal Masuk': i.date_in,
      'Status': i.status,
      'Note': i.note || '',
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Serial Number')
    XLSX.writeFile(wb, `serial_number_${new Date().toISOString().slice(0,10)}.xlsx`)
    toast.success('Export berhasil')
  }

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Serial Number', 'Merk', 'Tipe', 'Tanggal Masuk (yyyy-mm-dd)', 'Note'],
      ['ZTE123456', 'ZTE', 'F670L', '2024-01-01', 'Baru'],
      ['HUAWEI789', 'Huawei', 'HG8245H5', '2024-01-01', '']
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, 'template_serial_number.xlsx')
  }

  const handleImportExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setSaving(true)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws)
        if (!data.length) { toast.error('File kosong'); setSaving(false); return }
        
        // Step 1: Extract unique brands from excel
        const uniqueBrands = [...new Set(data.map(r => String(r['Merk'] || '').trim()).filter(Boolean))]
        const brandMap = {}
        // Copy existing brands
        brands.forEach(b => { brandMap[b.brand_name.toLowerCase()] = b.id })
        
        for (const bName of uniqueBrands) {
          const lowerName = bName.toLowerCase()
          if (!brandMap[lowerName] && bName !== '-') {
            // Insert new brand
            const { data: newBrand, error } = await supabase.from('ont_brands').insert([{ brand_name: bName }]).select().single()
            if (error) {
              console.error('Error inserting brand:', bName, error)
              toast.error(`Gagal membuat Merk baru (${bName}): ${error.message}`)
            }
            if (!error && newBrand) {
              brandMap[lowerName] = newBrand.id
            }
          }
        }

        // Step 2: Fetch all types to avoid duplicates
        const { data: allTypes } = await supabase.from('ont_types').select('id, brand_id, type_name')
        const typeMap = {} // key: brandId_typeNameLower -> value: typeId
        if (allTypes) {
          allTypes.forEach(t => { typeMap[`${t.brand_id}_${t.type_name.toLowerCase()}`] = t.id })
        }

        // Step 3: Insert missing types
        const typesToInsert = []
        data.forEach(r => {
          const mName = String(r['Merk'] || '').trim().toLowerCase()
          const bId = brandMap[mName]
          const tName = String(r['Tipe'] || '').trim()
          if (bId && tName && tName !== '-') {
            const key = `${bId}_${tName.toLowerCase()}`
            if (!typeMap[key] && !typesToInsert.find(t => t.brand_id === bId && t.type_name.toLowerCase() === tName.toLowerCase())) {
              typesToInsert.push({ brand_id: bId, type_name: tName })
            }
          }
        })

        if (typesToInsert.length > 0) {
          const { data: newTypes, error } = await supabase.from('ont_types').insert(typesToInsert).select()
          if (error) {
            console.error('Error inserting types:', error)
            toast.error(`Gagal membuat Tipe baru: ${error.message}`)
          }
          if (!error && newTypes) {
            newTypes.forEach(t => { typeMap[`${t.brand_id}_${t.type_name.toLowerCase()}`] = t.id })
          }
        }

        // Step 4: Map data to insertion payload
        const toInsert = data.map(row => {
          const sn = String(row['Serial Number'] || '').trim()
          if (!sn) return null
          
          const mName = String(row['Merk'] || '').trim().toLowerCase()
          const tName = String(row['Tipe'] || '').trim().toLowerCase()
          
          const bId = brandMap[mName] || null
          const tId = bId && tName && tName !== '-' ? typeMap[`${bId}_${tName}`] || null : null

          return {
            serial_number: sn,
            date_in: row['Tanggal Masuk (yyyy-mm-dd)'] || row['Tanggal Masuk'] || format(new Date(), 'yyyy-MM-dd'),
            status: 'tersedia',
            note: String(row['Note'] || '').trim(),
            brand_id: bId,
            type_id: tId,
            created_by: profile.id,
          }
        }).filter(r => r)
        
        if (!toInsert.length) { toast.error('Tidak ada data valid'); setSaving(false); return }
        
        const { error } = await supabase.from('serial_numbers').insert(toInsert)
        if (error) throw error
        toast.success(`${toInsert.length} SN berhasil diimport`)
        fetchAll()
      } catch (err) {
        toast.error('Gagal import: ' + err.message)
      } finally {
        setSaving(false)
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
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
                            {can(role, 'inventory.sn.edit') && (
                              <button className="btn-icon" onClick={() => {
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
                              }}><Edit2 size={15} /></button>
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
                            {can(role, 'inventory.sn.edit') && (
                              <button className="btn btn-secondary btn-sm" onClick={() => {
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
                              }}><Edit2 size={14} /> Edit</button>
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
              {/* Mode toggle */}
              {!editItem && (
                <div className="tabs" style={{ marginBottom: 0 }}>
                  <button className={`tab-item ${!isBulkMode ? 'active' : ''}`} onClick={() => setIsBulkMode(false)}>Input Satu</button>
                  <button className={`tab-item ${isBulkMode ? 'active' : ''}`} onClick={() => setIsBulkMode(true)}><UploadCloud size={14} /> Input Massal</button>
                </div>
              )}
              <div className="grid-2">
                {/* Merk ONT — combobox: pilih atau ketik baru */}
                <div className="form-group">
                  <label className="form-label">Merk ONT</label>
                  <input
                    className="form-input"
                    list="brand-list"
                    placeholder="Pilih atau ketik merk..."
                    value={form.brand_name}
                    onChange={e => handleBrandInput(e.target.value)}
                    autoComplete="off"
                  />
                  <datalist id="brand-list">
                    {brands.map(b => <option key={b.id} value={b.brand_name} />)}
                  </datalist>
                </div>
                {/* Tipe ONT — combobox: pilih dari daftar atau ketik baru */}
                <div className="form-group">
                  <label className="form-label">Tipe</label>
                  <input
                    className="form-input"
                    list="type-list"
                    placeholder="Pilih atau ketik tipe..."
                    value={form.type_name}
                    onChange={e => handleTypeInput(e.target.value)}
                    autoComplete="off"
                  />
                  <datalist id="type-list">
                    {types.map(t => <option key={t.id} value={t.type_name} />)}
                  </datalist>
                  {form.brand_name && types.length === 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                      Tipe baru akan dibuat otomatis
                    </span>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal Masuk</label>
                <input type="date" className="form-input" value={form.date_in} onChange={e => setForm(f => ({ ...f, date_in: e.target.value }))} />
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
                  <textarea className="form-input" rows={8} placeholder={"ZXHN12345\nZXHN67890\nZXHN11111"} value={bulkText} onChange={e => setBulkText(e.target.value)} style={{ fontFamily: 'monospace', resize: 'vertical' }} />
                  <span className="text-secondary" style={{ fontSize: '12px' }}>
                    {bulkText.split('\n').filter(l => l.trim()).length} SN terdeteksi
                  </span>
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
    </div>
  )
}

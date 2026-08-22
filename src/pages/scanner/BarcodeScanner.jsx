import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import toast from 'react-hot-toast'
import {
  ScanLine, Search, Trash2, Edit2, X, Download,
  CheckSquare, Calendar, RefreshCw, FileDown, Clock,
  Copy, Tag
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import * as XLSX from 'xlsx'

const CATEGORIES = ['umum', 'ONT', 'Kabel', 'Material', 'Perangkat', 'Lain-lain']

export default function BarcodeScanner() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const [activeTab, setActiveTab] = useState('simpan')
  const [scans, setScans] = useState([])
  const [users, setUsers] = useState({})
  const [loading, setLoading] = useState(true)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const scanInputRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [filterFirstFrom, setFilterFirstFrom] = useState('')
  const [filterFirstTo, setFilterFirstTo] = useState('')
  const [filterLastFrom, setFilterLastFrom] = useState('')
  const [filterLastTo, setFilterLastTo] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [editForm, setEditForm] = useState({ barcode: '', note: '', category: 'umum' })
  const [showDeleteByDate, setShowDeleteByDate] = useState(false)
  const [deleteByDateFrom, setDeleteByDateFrom] = useState('')
  const [deleteByDateTo, setDeleteByDateTo] = useState('')
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportMonth, setExportMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [exportMode, setExportMode] = useState('month')
  const [newCategory, setNewCategory] = useState('umum')
  const [newNote, setNewNote] = useState('')
  const [tempScans, setTempScans] = useState([])
  const [tempInput, setTempInput] = useState('')
  const tempInputRef = useRef(null)

  useEffect(() => { fetchScans(); fetchUsers() }, [])
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'simpan') scanInputRef.current?.focus()
      else tempInputRef.current?.focus()
    }, 150)
    return () => clearTimeout(timer)
  }, [activeTab])

  const fetchScans = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('barcode_scans').select('*').order('last_scan', { ascending: false })
    if (!error) setScans(data || [])
    setLoading(false)
  }
  const fetchUsers = async () => {
    const { data } = await supabase.from('users').select('id, full_name')
    if (data) setUsers(Object.fromEntries(data.map(u => [u.id, u.full_name])))
  }

  const handleScan = async (e) => {
    if (e.key !== 'Enter') return
    const barcode = barcodeInput.trim()
    if (!barcode) return
    setBarcodeInput('')
    setScanning(true)
    try {
      const { data: existing } = await supabase.from('barcode_scans').select('*').eq('barcode', barcode).maybeSingle()
      if (existing) {
        const newCount = (existing.scan_count || 1) + 1
        const { error } = await supabase.from('barcode_scans').update({ last_scan: new Date().toISOString(), scan_count: newCount, updated_by: profile.id }).eq('id', existing.id)
        if (!error) { toast.success(`Diperbarui: "${barcode}" (scan ke-${newCount})`); fetchScans() }
        else throw error
      } else {
        const now = new Date().toISOString()
        const { error } = await supabase.from('barcode_scans').insert({ barcode, note: newNote.trim() || null, category: newCategory, scanned_by: profile.id, first_scan: now, last_scan: now, scan_count: 1 })
        if (!error) { toast.success(`Tersimpan: "${barcode}"`); fetchScans() }
        else throw error
      }
    } catch (err) { toast.error('Gagal: ' + (err.message || 'Error')) }
    finally { setScanning(false); scanInputRef.current?.focus() }
  }

  const filtered = scans.filter(s => {
    if (searchTerm && !s.barcode.toLowerCase().includes(searchTerm.toLowerCase()) && !(s.note||'').toLowerCase().includes(searchTerm.toLowerCase())) return false
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false
    if (filterFirstFrom && s.first_scan < filterFirstFrom) return false
    if (filterFirstTo && s.first_scan > filterFirstTo + 'T23:59:59') return false
    if (filterLastFrom && s.last_scan < filterLastFrom) return false
    if (filterLastTo && s.last_scan > filterLastTo + 'T23:59:59') return false
    return true
  })

  const toggleSelect = (id) => { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const toggleSelectAll = () => { setSelected(selected.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(s => s.id))) }

  const handleDeleteSelected = async () => {
    if (!selected.size) return
    if (!window.confirm(`Hapus ${selected.size} data? Tindakan ini tidak bisa dibatalkan.`)) return
    const { error } = await supabase.from('barcode_scans').delete().in('id', [...selected])
    if (!error) { toast.success(`${selected.size} data dihapus`); setSelected(new Set()); setSelectMode(false); fetchScans() }
    else toast.error('Gagal hapus: ' + error.message)
  }

  const handleDeleteByDate = async () => {
    if (!deleteByDateFrom) { toast.error('Pilih tanggal awal'); return }
    if (!window.confirm('Hapus semua data dalam rentang tanggal ini?')) return
    let query = supabase.from('barcode_scans').delete().gte('first_scan', deleteByDateFrom + 'T00:00:00')
    if (deleteByDateTo) query = query.lte('first_scan', deleteByDateTo + 'T23:59:59')
    const { error } = await query
    if (!error) { toast.success('Data dihapus berdasarkan tanggal'); setShowDeleteByDate(false); setDeleteByDateFrom(''); setDeleteByDateTo(''); fetchScans() }
    else toast.error('Gagal: ' + error.message)
  }

  const handleDeleteSingle = async (s) => {
    if (!window.confirm(`Hapus "${s.barcode}"?`)) return
    const { error } = await supabase.from('barcode_scans').delete().eq('id', s.id)
    if (!error) { toast.success('Data dihapus'); fetchScans() }
  }

  const handleEdit = (item) => { setEditItem(item); setEditForm({ barcode: item.barcode, note: item.note || '', category: item.category || 'umum' }) }
  const handleSaveEdit = async () => {
    if (!editForm.barcode.trim()) { toast.error('Barcode tidak boleh kosong'); return }
    const { error } = await supabase.from('barcode_scans').update({ barcode: editForm.barcode.trim(), note: editForm.note.trim() || null, category: editForm.category, updated_by: profile.id }).eq('id', editItem.id)
    if (!error) { toast.success('Data diupdate'); setEditItem(null); fetchScans() }
    else toast.error('Gagal: ' + error.message)
  }

  const handleExport = () => {
    let data = scans
    let filename = 'Export_Data_Scan_Semua.xlsx'
    if (exportMode === 'month') {
      const from = startOfMonth(parseISO(exportMonth + '-01'))
      const to = endOfMonth(from)
      data = scans.filter(s => { const d = new Date(s.first_scan); return d >= from && d <= to })
      filename = `Export_Data_Scan_${exportMonth}.xlsx`
    }
    if (!data.length) { toast.error('Tidak ada data untuk diexport'); return }
    const ws = XLSX.utils.json_to_sheet(data.map((s, i) => ({ 'No': i+1, 'Barcode / SN': s.barcode, 'Kategori': s.category||'umum', 'Catatan': s.note||'', 'Pertama Scan': format(new Date(s.first_scan), 'dd/MM/yyyy HH:mm', {locale:idLocale}), 'Terakhir Scan': format(new Date(s.last_scan), 'dd/MM/yyyy HH:mm', {locale:idLocale}), 'Jumlah Scan': s.scan_count, 'Di-scan Oleh': users[s.scanned_by]||'-', 'Diupdate Oleh': users[s.updated_by]||'-' })))
    ws['!cols'] = [{wch:5},{wch:28},{wch:12},{wch:25},{wch:20},{wch:20},{wch:13},{wch:18},{wch:18}]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Data Scan'); XLSX.writeFile(wb, filename)
    toast.success('Export berhasil: ' + filename); setShowExportModal(false)
  }

  const resetFilters = () => { setSearchTerm(''); setCategoryFilter('all'); setFilterFirstFrom(''); setFilterFirstTo(''); setFilterLastFrom(''); setFilterLastTo('') }
  const hasFilter = searchTerm || categoryFilter !== 'all' || filterFirstFrom || filterFirstTo || filterLastFrom || filterLastTo

  const handleTempScan = (e) => {
    if (e.key !== 'Enter') return
    const barcode = tempInput.trim(); if (!barcode) return
    setTempInput('')
    if (tempScans.find(s => s.barcode === barcode)) { toast(`Barcode sudah ada dalam sesi ini`, { icon: 'Already in session' }); tempInputRef.current?.focus(); return }
    setTempScans(prev => [...prev, { id: crypto.randomUUID(), barcode, scanned_at: new Date().toISOString() }])
    tempInputRef.current?.focus()
  }
  const handleCopyAll = () => { if (!tempScans.length) return; navigator.clipboard.writeText(tempScans.map(s=>s.barcode).join('\n')); toast.success(`${tempScans.length} barcode disalin`) }
  const handleExportTemp = () => {
    if (!tempScans.length) return
    const ws = XLSX.utils.json_to_sheet(tempScans.map((s,i) => ({ 'No': i+1, 'Barcode / SN': s.barcode, 'Waktu Scan': format(new Date(s.scanned_at), 'HH:mm:ss dd/MM/yyyy') })))
    ws['!cols'] = [{wch:5},{wch:28},{wch:22}]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Scan Sementara')
    const fn = `Scan_Sementara_${format(new Date(), 'ddMMyyyy_HHmm')}.xlsx`; XLSX.writeFile(wb, fn); toast.success('Export: '+fn)
  }
  const handleClearTemp = () => { if (!tempScans.length) return; if (!window.confirm('Hapus semua sesi ini?')) return; setTempScans([]); toast.success('Sesi dibersihkan'); tempInputRef.current?.focus() }
  const fmtDate = (iso) => { try { return format(new Date(iso), 'dd MMM yyyy HH:mm', {locale:idLocale}) } catch { return '-' } }
  const todayCount = scans.filter(s => { const d = new Date(s.first_scan); const t = new Date(); return d.toDateString() === t.toDateString() }).length

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:'10px'}}><ScanLine size={22}/> Scan Barcode / Serial Number</h1>
          <p className="page-subtitle">Scan &amp; simpan permanen ke database, atau scan sementara per sesi</p>
        </div>
      </div>

      <div style={{display:'flex',gap:'2px',marginBottom:'24px',borderBottom:'2px solid var(--border)'}}>
        {[{key:'simpan',label:'💾 Scan & Simpan'},{key:'sementara',label:'⏱ Scan Sementara'}].map(tab => (
          <button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{padding:'12px 24px',border:'none',cursor:'pointer',background:'none',borderBottom:activeTab===tab.key?'3px solid var(--accent)':'3px solid transparent',color:activeTab===tab.key?'var(--accent)':'var(--text-secondary)',fontWeight:activeTab===tab.key?700:400,fontSize:'14px',transition:'all 0.15s',marginBottom:'-2px'}}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'simpan' && (
        <div>
          <div className="card" style={{marginBottom:'20px',borderColor:'var(--accent)',borderWidth:'2px'}}>
            <div style={{fontSize:'11px',fontWeight:700,color:'var(--accent)',letterSpacing:'0.8px',marginBottom:'10px'}}>AREA SCAN — tekan Enter setelah scan/ketik</div>
            <div style={{display:'flex',gap:'12px',flexWrap:'wrap',alignItems:'flex-end'}}>
              <div style={{flex:'2',minWidth:'240px'}}>
                <label className="form-label">Barcode / SN</label>
                <div style={{position:'relative'}}>
                  <input ref={scanInputRef} type="text" className="form-input" placeholder="Scan atau ketik barcode, lalu tekan Enter..." value={barcodeInput} onChange={e=>setBarcodeInput(e.target.value)} onKeyDown={handleScan} disabled={scanning} style={{fontFamily:'monospace',fontSize:'15px'}} autoComplete="off"/>
                  {scanning && <div style={{position:'absolute',right:'12px',top:'50%',transform:'translateY(-50%)'}}><div className="spinner" style={{width:'18px',height:'18px'}}/></div>}
                </div>
              </div>
              <div style={{minWidth:'140px'}}>
                <label className="form-label">Kategori</label>
                <select className="form-input" value={newCategory} onChange={e=>setNewCategory(e.target.value)}>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
              </div>
              <div style={{flex:'1',minWidth:'180px'}}>
                <label className="form-label">Catatan <span style={{color:'var(--text-muted)',fontWeight:400}}>(opsional)</span></label>
                <input type="text" className="form-input" placeholder="Tambah catatan..." value={newNote} onChange={e=>setNewNote(e.target.value)}/>
              </div>
            </div>
            <div style={{marginTop:'10px',fontSize:'12px',color:'var(--text-muted)',display:'flex',alignItems:'center',gap:'6px'}}>
              <ScanLine size={12}/> Barcode sudah ada? &rarr; <strong>Tanggal pertama tidak berubah</strong>, hanya terakhir scan &amp; jumlah scan diperbarui.
            </div>
          </div>

          <div style={{display:'flex',gap:'10px',marginBottom:'16px',flexWrap:'wrap'}}>
            {[{label:'Total Data',value:scans.length,color:'var(--accent)'},{label:'Input Hari Ini',value:todayCount,color:'var(--success)'},{label:'Hasil Filter',value:filtered.length,color:'var(--text-secondary)'}].map(stat=>(
              <div key={stat.label} style={{padding:'10px 18px',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',display:'flex',gap:'10px',alignItems:'center'}}>
                <span style={{fontSize:'22px',fontWeight:800,color:stat.color}}>{stat.value}</span>
                <span style={{fontSize:'12px',color:'var(--text-secondary)'}}>{stat.label}</span>
              </div>
            ))}
          </div>

          <div style={{display:'flex',gap:'8px',marginBottom:'12px',flexWrap:'wrap',alignItems:'center'}}>
            <div className="search-box" style={{maxWidth:'220px'}}><Search size={14} className="search-icon"/><input type="text" placeholder="Cari barcode/catatan..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/></div>
            <select className="filter-select" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">Semua Kategori</option>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
            <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
              <Calendar size={13} style={{color:'var(--text-muted)'}}/><span style={{fontSize:'12px',color:'var(--text-muted)'}}>Pertama:</span>
              <input type="date" className="form-input" style={{padding:'5px 8px',fontSize:'12px',width:'130px'}} value={filterFirstFrom} onChange={e=>setFilterFirstFrom(e.target.value)}/>
              <span style={{color:'var(--text-muted)',fontSize:'12px'}}>–</span>
              <input type="date" className="form-input" style={{padding:'5px 8px',fontSize:'12px',width:'130px'}} value={filterFirstTo} onChange={e=>setFilterFirstTo(e.target.value)}/>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
              <Clock size={13} style={{color:'var(--text-muted)'}}/><span style={{fontSize:'12px',color:'var(--text-muted)'}}>Terakhir:</span>
              <input type="date" className="form-input" style={{padding:'5px 8px',fontSize:'12px',width:'130px'}} value={filterLastFrom} onChange={e=>setFilterLastFrom(e.target.value)}/>
              <span style={{color:'var(--text-muted)',fontSize:'12px'}}>–</span>
              <input type="date" className="form-input" style={{padding:'5px 8px',fontSize:'12px',width:'130px'}} value={filterLastTo} onChange={e=>setFilterLastTo(e.target.value)}/>
            </div>
            {hasFilter && <button className="btn btn-secondary btn-sm" onClick={resetFilters}><X size={12}/> Reset</button>}
            <div style={{marginLeft:'auto',display:'flex',gap:'6px',flexWrap:'wrap'}}>
              {can(role,'scanner.delete') && (<>
                <button className={`btn btn-sm ${selectMode?'btn-primary':'btn-secondary'}`} onClick={()=>{setSelectMode(!selectMode);setSelected(new Set())}}><CheckSquare size={13}/> {selectMode?'Batal':'Pilih'}</button>
                {selectMode && selected.size>0 && <button className="btn btn-danger btn-sm" onClick={handleDeleteSelected}><Trash2 size={13}/> Hapus ({selected.size})</button>}
                <button className="btn btn-secondary btn-sm" onClick={()=>setShowDeleteByDate(true)}><Calendar size={13}/> Hapus by Tgl</button>
              </>)}
              {can(role,'scanner.export') && <button className="btn btn-secondary btn-sm" onClick={()=>setShowExportModal(true)}><FileDown size={13}/> Export Excel</button>}
              <button className="btn btn-secondary btn-sm" onClick={fetchScans} title="Refresh"><RefreshCw size={13}/></button>
            </div>
          </div>

          {loading ? (
            <div style={{textAlign:'center',padding:'60px',color:'var(--text-muted)'}}><div className="spinner" style={{margin:'0 auto 12px'}}/>Memuat data...</div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead><tr>
                  {selectMode && <th style={{width:'36px'}}><input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={toggleSelectAll} style={{cursor:'pointer'}}/></th>}
                  <th style={{width:'45px'}}>No</th><th>Barcode / SN</th><th>Kategori</th><th>Catatan</th><th>Pertama Scan</th><th>Terakhir Scan</th><th style={{textAlign:'center',width:'65px'}}>Ke-scan</th><th>Oleh</th><th style={{width:'70px'}}></th>
                </tr></thead>
                <tbody>
                  {filtered.length===0 ? (
                    <tr><td colSpan={selectMode?10:9} style={{textAlign:'center',padding:'50px 20px',color:'var(--text-muted)'}}>
                      <ScanLine size={40} style={{opacity:0.25,display:'block',margin:'0 auto 12px'}}/>
                      <div style={{fontWeight:600,marginBottom:'4px'}}>{hasFilter?'Tidak ada data sesuai filter':'Belum ada data scan'}</div>
                      <div style={{fontSize:'13px'}}>{hasFilter?'Coba ubah filter.':'Mulai scan barcode di area atas.'}</div>
                    </td></tr>
                  ) : filtered.map((s,i)=>(
                    <tr key={s.id} style={{background:selected.has(s.id)?'rgba(99,179,237,0.07)':undefined}}>
                      {selectMode && <td><input type="checkbox" checked={selected.has(s.id)} onChange={()=>toggleSelect(s.id)} style={{cursor:'pointer'}}/></td>}
                      <td style={{color:'var(--text-muted)',fontSize:'12px'}}>{i+1}</td>
                      <td><span style={{fontFamily:'monospace',fontWeight:700,fontSize:'13px',color:'var(--accent)'}}>{s.barcode}</span></td>
                      <td><span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'2px 8px',borderRadius:'10px',fontSize:'11px',fontWeight:600,background:'var(--accent-dim)',color:'var(--accent)'}}><Tag size={10}/>{s.category||'umum'}</span></td>
                      <td style={{fontSize:'12px',color:'var(--text-secondary)',maxWidth:'180px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.note||<span style={{color:'var(--text-muted)'}}>—</span>}</td>
                      <td style={{fontSize:'12px',color:'var(--text-secondary)',whiteSpace:'nowrap'}}>{fmtDate(s.first_scan)}</td>
                      <td style={{fontSize:'12px',whiteSpace:'nowrap'}}>{s.scan_count>1?<span style={{color:'var(--warning)',fontWeight:600}}>{fmtDate(s.last_scan)}</span>:<span style={{color:'var(--text-muted)'}}>{fmtDate(s.last_scan)}</span>}</td>
                      <td style={{textAlign:'center'}}><span style={{background:s.scan_count>1?'rgba(245,158,11,0.15)':'var(--bg-primary)',color:s.scan_count>1?'var(--warning)':'var(--text-muted)',borderRadius:'12px',padding:'2px 8px',fontSize:'11px',fontWeight:700}}>{s.scan_count}×</span></td>
                      <td style={{fontSize:'12px',color:'var(--text-secondary)'}}>{users[s.scanned_by]||'—'}</td>
                      <td><div style={{display:'flex',gap:'4px',justifyContent:'flex-end'}}>
                        {can(role,'scanner.edit')&&<button className="btn-icon" onClick={()=>handleEdit(s)} title="Edit"><Edit2 size={14}/></button>}
                        {can(role,'scanner.delete')&&<button className="btn-icon text-danger" onClick={()=>handleDeleteSingle(s)} title="Hapus"><Trash2 size={14}/></button>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sementara' && (
        <div>
          <div style={{padding:'12px 16px',marginBottom:'16px',borderRadius:'var(--radius-md)',background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.3)',fontSize:'13px',color:'var(--warning)',display:'flex',alignItems:'center',gap:'8px'}}>
            ⚠️ <strong>Mode Sementara:</strong> Data tidak tersimpan ke database. Jika halaman ditutup/refresh, semua data hilang.
          </div>
          <div className="card" style={{marginBottom:'20px',border:'2px solid rgba(245,158,11,0.5)'}}>
            <div style={{fontSize:'11px',fontWeight:700,color:'var(--warning)',letterSpacing:'0.8px',marginBottom:'10px'}}>AREA SCAN SEMENTARA</div>
            <input ref={tempInputRef} type="text" className="form-input" placeholder="Scan atau ketik barcode, lalu tekan Enter..." value={tempInput} onChange={e=>setTempInput(e.target.value)} onKeyDown={handleTempScan} style={{fontFamily:'monospace',fontSize:'15px',width:'100%'}} autoComplete="off"/>
            <div style={{marginTop:'8px',fontSize:'12px',color:'var(--text-muted)'}}>Barcode duplikat dalam satu sesi akan diberi peringatan.</div>
          </div>
          <div style={{display:'flex',gap:'10px',marginBottom:'16px',flexWrap:'wrap',alignItems:'center'}}>
            <div style={{padding:'10px 18px',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',display:'flex',gap:'10px',alignItems:'center'}}>
              <span style={{fontSize:'22px',fontWeight:800,color:'var(--warning)'}}>{tempScans.length}</span>
              <span style={{fontSize:'12px',color:'var(--text-secondary)'}}>Item dalam sesi ini</span>
            </div>
            <div style={{marginLeft:'auto',display:'flex',gap:'6px'}}>
              <button className="btn btn-secondary btn-sm" onClick={handleCopyAll} disabled={!tempScans.length}><Copy size={13}/> Salin Semua</button>
              <button className="btn btn-secondary btn-sm" onClick={handleExportTemp} disabled={!tempScans.length}><FileDown size={13}/> Export Excel</button>
              <button className="btn btn-danger btn-sm" onClick={handleClearTemp} disabled={!tempScans.length}><Trash2 size={13}/> Hapus Semua</button>
            </div>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th style={{width:'55px'}}>No</th><th>Barcode / SN</th><th style={{width:'200px'}}>Waktu Scan</th><th style={{width:'50px'}}></th></tr></thead>
              <tbody>
                {tempScans.length===0 ? (
                  <tr><td colSpan={4} style={{textAlign:'center',padding:'50px 20px',color:'var(--text-muted)'}}><ScanLine size={40} style={{opacity:0.25,display:'block',margin:'0 auto 12px'}}/><div style={{fontWeight:600,marginBottom:'4px'}}>Sesi kosong</div><div style={{fontSize:'13px'}}>Mulai scan di atas.</div></td></tr>
                ) : [...tempScans].reverse().map((s,i)=>(
                  <tr key={s.id}>
                    <td style={{color:'var(--text-muted)',fontSize:'12px'}}>{tempScans.length-i}</td>
                    <td><span style={{fontFamily:'monospace',fontWeight:700,fontSize:'13px',color:'var(--warning)'}}>{s.barcode}</span></td>
                    <td style={{fontSize:'12px',color:'var(--text-secondary)'}}>{format(new Date(s.scanned_at),'HH:mm:ss · dd MMM yyyy')}</td>
                    <td><button className="btn-icon text-danger" onClick={()=>setTempScans(prev=>prev.filter(t=>t.id!==s.id))}><Trash2 size={14}/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editItem && (
        <div className="modal-overlay"><div className="modal">
          <div className="modal-header"><div><h3>Edit Data Scan</h3><p style={{margin:'4px 0 0',fontSize:'12px',color:'var(--text-secondary)'}}>Hanya superadmin</p></div><button className="btn-close" onClick={()=>setEditItem(null)}><X size={18}/></button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">Barcode / SN *</label><input type="text" className="form-input" style={{fontFamily:'monospace',fontWeight:600}} value={editForm.barcode} onChange={e=>setEditForm(p=>({...p,barcode:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Kategori</label><select className="form-input" value={editForm.category} onChange={e=>setEditForm(p=>({...p,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Catatan</label><input type="text" className="form-input" placeholder="Opsional..." value={editForm.note} onChange={e=>setEditForm(p=>({...p,note:e.target.value}))}/></div>
            <div style={{padding:'10px 12px',background:'var(--bg-primary)',borderRadius:'var(--radius-sm)',fontSize:'12px',color:'var(--text-muted)',lineHeight:1.7}}>
              <div>Pertama Scan: <strong>{fmtDate(editItem.first_scan)}</strong></div>
              <div>Terakhir Scan: <strong>{fmtDate(editItem.last_scan)}</strong></div>
              <div>Jumlah Scan: <strong>{editItem.scan_count}×</strong></div>
            </div>
          </div>
          <div className="modal-footer"><button className="btn btn-secondary" onClick={()=>setEditItem(null)}>Batal</button><button className="btn btn-primary" onClick={handleSaveEdit}>Simpan</button></div>
        </div></div>
      )}

      {showDeleteByDate && (
        <div className="modal-overlay"><div className="modal">
          <div className="modal-header"><h3>Hapus by Tanggal</h3><button className="btn-close" onClick={()=>setShowDeleteByDate(false)}><X size={18}/></button></div>
          <div className="modal-body">
            <p style={{color:'var(--text-secondary)',fontSize:'13px',marginBottom:'16px'}}>Hapus berdasarkan rentang <strong>tanggal pertama scan</strong>.</p>
            <div className="form-group"><label className="form-label">Dari Tanggal *</label><input type="date" className="form-input" value={deleteByDateFrom} onChange={e=>setDeleteByDateFrom(e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Sampai Tanggal <span style={{fontWeight:400,color:'var(--text-muted)'}}>(kosong = hanya tanggal di atas)</span></label><input type="date" className="form-input" value={deleteByDateTo} onChange={e=>setDeleteByDateTo(e.target.value)} min={deleteByDateFrom}/></div>
            <div style={{padding:'10px 12px',background:'rgba(239,68,68,0.08)',borderRadius:'var(--radius-sm)',fontSize:'12px',color:'var(--danger)'}}>⚠️ Data yang dihapus <strong>tidak bisa dikembalikan!</strong></div>
          </div>
          <div className="modal-footer"><button className="btn btn-secondary" onClick={()=>setShowDeleteByDate(false)}>Batal</button><button className="btn btn-danger" onClick={handleDeleteByDate}>Hapus Data</button></div>
        </div></div>
      )}

      {showExportModal && (
        <div className="modal-overlay"><div className="modal">
          <div className="modal-header"><h3>Export Data Scan</h3><button className="btn-close" onClick={()=>setShowExportModal(false)}><X size={18}/></button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">Pilih Rentang Data</label>
              <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontSize:'14px'}}><input type="radio" name="exportMode" value="month" checked={exportMode==='month'} onChange={()=>setExportMode('month')}/> Per Bulan</label>
                {exportMode==='month' && <input type="month" className="form-input" value={exportMonth} onChange={e=>setExportMonth(e.target.value)} style={{marginLeft:'24px',width:'170px'}}/>}
                <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontSize:'14px'}}><input type="radio" name="exportMode" value="all" checked={exportMode==='all'} onChange={()=>setExportMode('all')}/> Semua Data <span style={{fontSize:'12px',color:'var(--text-muted)'}}>({scans.length} baris)</span></label>
              </div>
            </div>
            <div style={{padding:'10px 12px',background:'var(--bg-primary)',borderRadius:'var(--radius-sm)',fontSize:'12px',color:'var(--text-muted)'}}>
              Nama file: <strong style={{fontFamily:'monospace',color:'var(--text-primary)'}}>{exportMode==='month'?`Export_Data_Scan_${exportMonth}.xlsx`:'Export_Data_Scan_Semua.xlsx'}</strong>
            </div>
          </div>
          <div className="modal-footer"><button className="btn btn-secondary" onClick={()=>setShowExportModal(false)}>Batal</button><button className="btn btn-primary" onClick={handleExport}><Download size={14}/> Download Excel</button></div>
        </div></div>
      )}
    </div>
  )
}

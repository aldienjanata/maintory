import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  Plus, X, Edit2, Trash2, MapPin, Search, Download,
  ChevronDown, ChevronUp, ExternalLink, Antenna
} from 'lucide-react'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import * as XLSX from 'xlsx'

const SITES = [
  { value: 'banyumas', label: 'Banyumas' },
  { value: 'cilacap', label: 'Cilacap' },
  { value: 'cilacap_herman', label: 'Cilacap (Herman)' },
]

const SITE_CODE = { banyumas: 'BMS', cilacap: 'CLP', cilacap_herman: 'CLH' }

const POLE_TYPES = [
  { value: 'tiang_7m', label: 'Tiang 7 m' },
  { value: 'tiang_9m', label: 'Tiang 9 m' },
]

const EMPTY_FORM = {
  site: 'banyumas',
  pole_type: 'tiang_7m',
  provinsi: 'Jawa Tengah',
  kabupaten: 'Banyumas',
  kecamatan: '',
  desa: '',
  maps_url: '',
  longitude: '',
  latitude: '',
  keterangan: '',
}

// Generate pole_id: NAT/BMS/POLE/DESA_SLUG/NO
function generatePoleId(site, desa, existingPoles) {
  if (!desa) return ''
  const siteCode = SITE_CODE[site] || 'BMS'
  const desaSlug = desa.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').substring(0, 15)
  // Count poles in same desa & site
  const count = existingPoles.filter(
    p => p.site === site && p.desa?.toUpperCase().trim() === desa.toUpperCase().trim()
  ).length
  const no = String(count + 1).padStart(3, '0')
  return `NAT/${siteCode}/POLE/${desaSlug}/${no}`
}

export default function DataTiang() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'

  const [poles, setPoles] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSite, setFilterSite] = useState('')
  const [filterKecamatan, setFilterKecamatan] = useState('')
  const [filterType, setFilterType] = useState('')

  // Sorting
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Pagination
  const [page, setPage] = useState(1)
  const perPage = 15

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [polesRes, usersRes] = await Promise.all([
        supabase.from('network_poles').select('*').order('created_at', { ascending: false }),
        supabase.from('users').select('id, full_name'),
      ])
      if (polesRes.data) setPoles(polesRes.data)
      if (usersRes.data) setUsers(usersRes.data)
    } catch (e) {
      toast.error('Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }

  const getUserName = (uid) => users.find(u => u.id === uid)?.full_name || '-'

  const kecamatanList = useMemo(() => {
    const set = new Set(poles.map(p => p.kecamatan).filter(Boolean))
    return [...set].sort()
  }, [poles])

  const filtered = useMemo(() => {
    let data = [...poles]
    if (filterSite) data = data.filter(p => p.site === filterSite)
    if (filterKecamatan) data = data.filter(p => p.kecamatan === filterKecamatan)
    if (filterType) data = data.filter(p => p.pole_type === filterType)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      data = data.filter(p =>
        p.pole_id?.toLowerCase().includes(q) ||
        p.desa?.toLowerCase().includes(q) ||
        p.kecamatan?.toLowerCase().includes(q) ||
        p.keterangan?.toLowerCase().includes(q)
      )
    }
    data.sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey]
      if (va === null || va === undefined) va = ''
      if (vb === null || vb === undefined) vb = ''
      if (sortDir === 'asc') return va > vb ? 1 : -1
      return va < vb ? 1 : -1
    })
    return data
  }, [poles, filterSite, filterKecamatan, filterType, searchQuery, sortKey, sortDir])

  const paginated = useMemo(() => {
    const start = (page - 1) * perPage
    return filtered.slice(start, start + perPage)
  }, [filtered, page])

  const totalPages = Math.ceil(filtered.length / perPage)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ChevronDown size={12} style={{ opacity: 0.3 }} />
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  const openAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setIsModalOpen(true)
  }

  const openEdit = (pole) => {
    setEditingId(pole.id)
    setForm({
      site: pole.site || 'banyumas',
      pole_type: pole.pole_type || 'tiang_7m',
      provinsi: pole.provinsi || '',
      kabupaten: pole.kabupaten || '',
      kecamatan: pole.kecamatan || '',
      desa: pole.desa || '',
      maps_url: pole.maps_url || '',
      longitude: pole.longitude || '',
      latitude: pole.latitude || '',
      keterangan: pole.keterangan || '',
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.kecamatan.trim()) return toast.error('Kecamatan wajib diisi!')
    if (!form.desa.trim()) return toast.error('Desa/Kelurahan wajib diisi!')
    setSaving(true)
    try {
      if (editingId) {
        // UPDATE
        const { error } = await supabase.from('network_poles').update({
          ...form,
          longitude: form.longitude ? Number(form.longitude) : null,
          latitude: form.latitude ? Number(form.latitude) : null,
          updated_by: profile.id,
        }).eq('id', editingId)
        if (error) throw error
        toast.success('Data tiang berhasil diperbarui!')
      } else {
        // INSERT with generated pole_id
        const poleId = generatePoleId(form.site, form.desa, poles)
        const { error } = await supabase.from('network_poles').insert({
          ...form,
          pole_id: poleId,
          longitude: form.longitude ? Number(form.longitude) : null,
          latitude: form.latitude ? Number(form.latitude) : null,
          created_by: profile.id,
          updated_by: profile.id,
        })
        if (error) throw error
        toast.success(`Tiang ${poleId} berhasil ditambahkan!`)
      }
      setIsModalOpen(false)
      fetchData()
    } catch (e) {
      toast.error(e.message || 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (pole) => {
    try {
      const { error } = await supabase.from('network_poles').delete().eq('id', pole.id)
      if (error) throw error
      toast.success('Data tiang dihapus')
      setConfirmDelete(null)
      fetchData()
    } catch (e) {
      toast.error('Gagal menghapus data')
    }
  }

  // Extract coords from Google Maps URL
  const extractCoordsFromUrl = (url) => {
    if (!url) return
    const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (match) {
      setForm(f => ({ ...f, latitude: match[1], longitude: match[2] }))
      toast.success('Koordinat berhasil diekstrak dari URL Maps!')
    } else {
      toast.error('Koordinat tidak ditemukan di URL. Masukkan manual.')
    }
  }

  const handleExport = () => {
    if (filtered.length === 0) return toast.error('Tidak ada data untuk diekspor')
    const rows = filtered.map((p, i) => ({
      'No': i + 1,
      'Site': SITES.find(s => s.value === p.site)?.label || p.site,
      'ID Tiang': p.pole_id || '-',
      'Jenis Tiang': POLE_TYPES.find(t => t.value === p.pole_type)?.label || p.pole_type,
      'Provinsi': p.provinsi || '-',
      'Kabupaten/Kota': p.kabupaten || '-',
      'Kecamatan': p.kecamatan || '-',
      'Desa/Kelurahan': p.desa || '-',
      'Maps URL': p.maps_url || '-',
      'Longitude': p.longitude || '-',
      'Latitude': p.latitude || '-',
      'Keterangan': p.keterangan || '-',
      'Diinput Oleh': getUserName(p.created_by),
      'Edit Oleh': getUserName(p.updated_by),
      'Tanggal Input': p.created_at ? format(new Date(p.created_at), 'dd/MM/yyyy HH:mm') : '-',
      'Tanggal Update': p.updated_at ? format(new Date(p.updated_at), 'dd/MM/yyyy HH:mm') : '-',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data Tiang')
    XLSX.writeFile(wb, `Data_Tiang_${format(new Date(), 'yyyyMMdd')}.xlsx`)
    toast.success('Export berhasil!')
  }

  const poleIdPreview = !editingId && form.desa
    ? generatePoleId(form.site, form.desa, poles)
    : null

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Antenna size={22} style={{ color: 'var(--accent)' }} />
            Data Tiang
          </h2>
          <p className="page-subtitle">Jaringan Fiber — Pencatatan & Manajemen Tiang</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>
            <Download size={15} /> Export Excel
          </button>
          {['admin', 'superadmin', 'teknisi'].includes(role) && (
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <Plus size={15} /> Tambah Tiang
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Tiang', value: poles.length, color: 'var(--accent)' },
          { label: 'Tiang 7 m', value: poles.filter(p => p.pole_type === 'tiang_7m').length, color: 'var(--success)' },
          { label: 'Tiang 9 m', value: poles.filter(p => p.pole_type === 'tiang_9m').length, color: 'var(--warning)' },
          { label: 'Kecamatan', value: kecamatanList.length, color: 'var(--purple)' },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: '14px 18px', borderTop: `3px solid ${card.color}` }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              className="form-input"
              style={{ paddingLeft: '32px', height: '36px' }}
              placeholder="Cari ID Tiang, Desa, Kecamatan..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
            />
          </div>
          <select className="form-input" style={{ height: '36px', width: 'auto' }} value={filterSite} onChange={e => { setFilterSite(e.target.value); setPage(1) }}>
            <option value="">Semua Site</option>
            {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="form-input" style={{ height: '36px', width: 'auto' }} value={filterKecamatan} onChange={e => { setFilterKecamatan(e.target.value); setPage(1) }}>
            <option value="">Semua Kecamatan</option>
            {kecamatanList.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <select className="form-input" style={{ height: '36px', width: 'auto' }} value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }}>
            <option value="">Semua Jenis</option>
            {POLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {(filterSite || filterKecamatan || filterType || searchQuery) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setFilterSite(''); setFilterKecamatan(''); setFilterType(''); setSearchQuery(''); setPage(1) }}>
              Reset
            </button>
          )}
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
            {filtered.length} tiang ditemukan
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: '1000px' }}>
            <thead>
              <tr>
                <th style={{ width: '45px' }}>No</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('site')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Site <SortIcon col="site" /></div>
                </th>
                <th style={{ cursor: 'pointer', minWidth: '220px' }} onClick={() => handleSort('pole_id')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>ID Tiang <SortIcon col="pole_id" /></div>
                </th>
                <th>Jenis</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kecamatan')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Kecamatan <SortIcon col="kecamatan" /></div>
                </th>
                <th>Desa/Kelurahan</th>
                <th>Koordinat</th>
                <th>Maps</th>
                <th>Keterangan</th>
                <th>Diinput Oleh</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('created_at')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Tanggal Input <SortIcon col="created_at" /></div>
                </th>
                {['admin', 'superadmin'].includes(role) && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Memuat data...</td></tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      <Antenna size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                      <div>Belum ada data tiang</div>
                    </div>
                  </td>
                </tr>
              ) : paginated.map((pole, idx) => (
                <tr key={pole.id}>
                  <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                    {(page - 1) * perPage + idx + 1}
                  </td>
                  <td>
                    <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '20px', background: 'var(--bg-primary)', border: '1px solid var(--border)', fontWeight: 600 }}>
                      {SITES.find(s => s.value === pole.site)?.label || pole.site}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>
                      {pole.pole_id || '-'}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      fontSize: '12px', padding: '2px 8px', borderRadius: '20px', fontWeight: 600,
                      background: pole.pole_type === 'tiang_9m' ? 'rgba(251,191,36,0.15)' : 'rgba(16,185,129,0.12)',
                      color: pole.pole_type === 'tiang_9m' ? 'var(--warning)' : 'var(--success)',
                    }}>
                      {POLE_TYPES.find(t => t.value === pole.pole_type)?.label || pole.pole_type}
                    </span>
                  </td>
                  <td style={{ fontSize: '13px' }}>{pole.kecamatan || '-'}</td>
                  <td style={{ fontSize: '13px' }}>{pole.desa || '-'}</td>
                  <td>
                    {pole.latitude && pole.longitude ? (
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        <div>{Number(pole.latitude).toFixed(6)}</div>
                        <div>{Number(pole.longitude).toFixed(6)}</div>
                      </div>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>}
                  </td>
                  <td>
                    {pole.maps_url ? (
                      <a href={pole.maps_url} target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                        <MapPin size={13} /> Lihat
                        <ExternalLink size={11} />
                      </a>
                    ) : '-'}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '150px' }}>
                    <span title={pole.keterangan} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pole.keterangan || '-'}
                    </span>
                  </td>
                  <td style={{ fontSize: '12px' }}>
                    <div>{getUserName(pole.created_by)}</div>
                    {pole.updated_by && pole.updated_by !== pole.created_by && (
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Edit: {getUserName(pole.updated_by)}</div>
                    )}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <div>{pole.created_at ? format(new Date(pole.created_at), 'dd MMM yyyy', { locale: localeId }) : '-'}</div>
                    {pole.updated_at && pole.updated_at !== pole.created_at && (
                      <div style={{ fontSize: '11px' }}>Upd: {format(new Date(pole.updated_at), 'dd MMM yyyy', { locale: localeId })}</div>
                    )}
                  </td>
                  {['admin', 'superadmin'].includes(role) && (
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => openEdit(pole)}>
                          <Edit2 size={13} />
                        </button>
                        <button className="btn btn-sm" style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.12)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)' }} onClick={() => setConfirmDelete(pole)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '16px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1).map((p, i, arr) => (
              <>
                {i > 0 && arr[i - 1] !== p - 1 && <span key={`dots-${p}`} style={{ color: 'var(--text-secondary)' }}>...</span>}
                <button key={p} className={`btn btn-sm ${page === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPage(p)}>{p}</button>
              </>
            ))}
            <button className="btn btn-secondary btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next ›</button>
          </div>
        )}
      </div>

      {/* ===== MODAL TAMBAH/EDIT ===== */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '680px', maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>{editingId ? 'Edit Data Tiang' : 'Tambah Tiang Baru'}</h3>
                {!editingId && poleIdPreview && (
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--accent)', fontFamily: 'monospace' }}>
                    ID: {poleIdPreview}
                  </p>
                )}
              </div>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Row 1: Site + Jenis */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label">Site <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-input" value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))}>
                    {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Jenis Tiang <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-input" value={form.pole_type} onChange={e => setForm(f => ({ ...f, pole_type: e.target.value }))}>
                    {POLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>📍 Lokasi Administratif</span>
              </div>

              {/* Row 2: Provinsi + Kabupaten */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label">Provinsi</label>
                  <input className="form-input" value={form.provinsi} onChange={e => setForm(f => ({ ...f, provinsi: e.target.value }))} placeholder="Jawa Tengah" />
                </div>
                <div>
                  <label className="form-label">Kabupaten/Kota</label>
                  <input className="form-input" value={form.kabupaten} onChange={e => setForm(f => ({ ...f, kabupaten: e.target.value }))} placeholder="Banyumas" />
                </div>
              </div>

              {/* Row 3: Kecamatan + Desa */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label">Kecamatan <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" value={form.kecamatan} onChange={e => setForm(f => ({ ...f, kecamatan: e.target.value }))} placeholder="Cth: Purwokerto Selatan" />
                </div>
                <div>
                  <label className="form-label">Desa/Kelurahan <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="form-input" value={form.desa} onChange={e => setForm(f => ({ ...f, desa: e.target.value }))} placeholder="Cth: Tanjung" />
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>🗺️ Koordinat GPS</span>
              </div>

              {/* Maps URL + auto-extract button */}
              <div>
                <label className="form-label">URL Google Maps</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    className="form-input"
                    style={{ flex: 1 }}
                    value={form.maps_url}
                    onChange={e => setForm(f => ({ ...f, maps_url: e.target.value }))}
                    placeholder="Tempel link Google Maps di sini..."
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={() => extractCoordsFromUrl(form.maps_url)}
                    type="button"
                  >
                    <MapPin size={13} /> Ambil Koordinat
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Klik "Ambil Koordinat" untuk otomatis mengisi Latitude & Longitude dari URL Maps.
                </div>
              </div>

              {/* Row: Longitude + Latitude */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label">Longitude</label>
                  <input className="form-input" type="number" step="any" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} placeholder="-109.1234567" />
                </div>
                <div>
                  <label className="form-label">Latitude</label>
                  <input className="form-input" type="number" step="any" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} placeholder="-7.1234567" />
                </div>
              </div>

              {/* Keterangan */}
              <div>
                <label className="form-label">Keterangan</label>
                <textarea
                  className="form-input"
                  rows={2}
                  style={{ resize: 'vertical' }}
                  value={form.keterangan}
                  onChange={e => setForm(f => ({ ...f, keterangan: e.target.value }))}
                  placeholder="Catatan tambahan tentang tiang ini..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? '...' : editingId ? '✓ Simpan Perubahan' : '✓ Tambah Tiang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL KONFIRMASI HAPUS ===== */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: '420px', maxWidth: '96vw' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, color: 'var(--danger)' }}>⚠ Hapus Data Tiang</h3>
              <button className="btn-close" onClick={() => setConfirmDelete(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p>Yakin ingin menghapus tiang <strong style={{ color: 'var(--accent)' }}>{confirmDelete.pole_id}</strong>?</p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Aksi ini tidak bisa dibatalkan.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Batal</button>
              <button className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleDelete(confirmDelete)}>
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

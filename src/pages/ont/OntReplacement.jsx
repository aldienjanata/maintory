import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { Search, Plus, Trash2, X, RefreshCcw, ArrowRight, Download, ClipboardPaste, CheckCircle } from 'lucide-react'
import { format, parse, isValid } from 'date-fns'
import { id } from 'date-fns/locale'
import { useProgress } from '../../contexts/ProgressContext'
import Pagination from '../../components/common/Pagination'

const SITES = [
  { value: 'banyumas', label: 'Banyumas' },
  { value: 'cilacap', label: 'Cilacap' },
  { value: 'cilacap_herman', label: 'Cilacap (Herman)' }
]

// ─── DATE PARSER ────────────────────────────────────────────────────────────
// Parses Indonesian date strings like "Jum'at,24 Juli 2026" or "24 Juli 2026" or "24/07/2026"
function parseIndonesianDate(raw) {
  if (!raw || !raw.trim()) return null
  let s = raw.trim()

  // Strip day-name prefix: "Jum'at,24 Juli 2026" → "24 Juli 2026"
  s = s.replace(/^[A-Za-z']+\s*,\s*/u, '').trim()

  const MONTHS = {
    januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
    juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agt: 8, sep: 9, okt: 10, nov: 11, des: 12,
    'agu': 8,
  }

  // "24 Juli 2026"
  const longMatch = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (longMatch) {
    const d = parseInt(longMatch[1])
    const m = MONTHS[longMatch[2].toLowerCase()]
    const y = parseInt(longMatch[3])
    if (m && d && y) {
      const date = new Date(y, m - 1, d)
      if (isValid(date)) return format(date, 'yyyy-MM-dd')
    }
  }

  // "24/07/2026" or "24-07-2026"
  const slashMatch = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
  if (slashMatch) {
    const d = parseInt(slashMatch[1])
    const m = parseInt(slashMatch[2])
    const y = parseInt(slashMatch[3])
    const date = new Date(y, m - 1, d)
    if (isValid(date)) return format(date, 'yyyy-MM-dd')
  }

  // "2026-07-24"
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) return s

  return null
}

// ─── WA TEXT PARSER ─────────────────────────────────────────────────────────
function parseWaText(text) {
  const up = (s) => (s || '').trim().toUpperCase()

  const getField = (label) => {
    const regex = new RegExp(`${label}\\s*:?\\s*(.+)`, 'im')
    const m = text.match(regex)
    return m ? m[1].trim() : ''
  }

  const rawDate = getField('Tanggal Pergantian')
  const parsedDate = parseIndonesianDate(rawDate) || format(new Date(), 'yyyy-MM-dd')
  
  let customerId = getField('ID PELANGGAN').toLowerCase()
  if (customerId && !customerId.includes('@')) {
    customerId += '@bms.wifian.net.id'
  }

  return {
    replacement_date: parsedDate,
    customer_name: up(getField('NAMA PELANGGAN')),
    customer_id: customerId,
    old_serial_number: up(getField('SN LAMA')),
    new_serial_number_raw: up(getField('SN BARU')),
    reason: up(getField('ALASAN DI GANTI')),
    technician_raw: up(getField('TEKNISI')),
  }
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function OntReplacement() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  const { showProgress, hideProgress } = useProgress()

  const [items, setItems] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  // WA modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [waText, setWaText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [saving, setSaving] = useState(false)
  const [site, setSite] = useState('banyumas')

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { setPage(1) }, [searchTerm, dateFilter])

  const fetchAll = async () => {
    setLoading(true)
    const [res, techRes] = await Promise.all([
      supabase.from('ont_replacements').select('*, new_sn:serial_numbers(serial_number, brand:ont_brands(brand_name), type:ont_types(type_name))').order('replacement_date', { ascending: false }).limit(1000),
      supabase.from('users').select('id, full_name').in('role', ['admin', 'teknisi']).eq('is_active', true)
    ])
    if (!res.error) setItems(res.data || [])
    if (!techRes.error) setTechnicians(techRes.data || [])
    setLoading(false)
  }

  // ── Parse on every WA text change ──────────────────────────────────────────
  const handleWaChange = (val) => {
    setWaText(val)
    if (val.trim()) {
      setParsed(parseWaText(val))
    } else {
      setParsed(null)
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!parsed) { toast.error('Belum ada teks WA yang diparse'); return }
    if (!parsed.customer_name || !parsed.customer_id || !parsed.old_serial_number) {
      toast.error('Nama pelanggan, ID pelanggan, dan SN Lama wajib ada di teks WA')
      return
    }
    setSaving(true)
    try {
      // Cek apakah data duplicate (tanggal, id pelanggan, sn lama yang sama)
      const { data: existing, error: checkError } = await supabase
        .from('ont_replacements')
        .select('id')
        .eq('replacement_date', parsed.replacement_date)
        .eq('customer_id', parsed.customer_id)
        .eq('old_serial_number', parsed.old_serial_number)
        
      if (checkError) throw checkError
      if (existing && existing.length > 0) {
        toast.error('Gagal: Data pergantian ONT ini sudah pernah diinput (Data Ganda)')
        setSaving(false)
        return
      }

      const submitData = {
        replacement_date: parsed.replacement_date,
        site,
        customer_name: parsed.customer_name,
        customer_id: parsed.customer_id,
        old_serial_number: parsed.old_serial_number,
        new_serial_number_raw: parsed.new_serial_number_raw || null,
        reason: parsed.reason || null,
        technician_text: parsed.technician_raw || null,
        technicians: [],
        created_by: profile.id,
      }

      const { error } = await supabase.from('ont_replacements').insert(submitData)
      if (error) throw error

      await logActivity({
        userId: profile.id, username: profile.username, role,
        module: 'Pergantian ONT', action: 'Input Pergantian ONT',
        detail: `${parsed.customer_name} | SN Lama: ${parsed.old_serial_number} | SN Baru: ${parsed.new_serial_number_raw || '-'}`,
      })

      toast.success('Data pergantian ONT berhasil disimpan!')
      setIsModalOpen(false)
      setWaText('')
      setParsed(null)
      fetchAll()
    } catch (err) {
      // If column doesn't exist yet, fallback to basic insert
      if (err.message?.includes('new_serial_number_raw') || err.message?.includes('technician_text')) {
        try {
          const fallback = {
            replacement_date: parsed.replacement_date,
            site,
            customer_name: parsed.customer_name,
            customer_id: parsed.customer_id,
            old_serial_number: parsed.old_serial_number,
            reason: parsed.reason || null,
            technicians: [],
            created_by: profile.id,
          }
          const { error: e2 } = await supabase.from('ont_replacements').insert(fallback)
          if (e2) throw e2
          toast.success('Data disimpan (mode kompatibilitas)')
          setIsModalOpen(false)
          setWaText('')
          setParsed(null)
          fetchAll()
        } catch (e3) {
          toast.error('Gagal: ' + e3.message)
        }
      } else {
        toast.error('Gagal: ' + err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm('Hapus data pergantian ONT ini?')) return
    await supabase.from('ont_replacements').delete().eq('id', item.id)
    await logActivity({ userId: profile.id, username: profile.username, role, module: 'Pergantian ONT', action: 'Hapus', detail: `ID: ${item.customer_id}` })
    toast.success('Data dihapus')
    fetchAll()
  }

  const getSnDisplay = (item) => {
    if (item.new_sn?.serial_number) return item.new_sn.serial_number
    if (item.new_serial_number_raw) return item.new_serial_number_raw
    return '-'
  }

  const getTechDisplay = (item) => {
    if (item.technician_text) return item.technician_text
    if (item.technicians?.length) {
      return item.technicians.map(id => technicians.find(t => t.id === id)?.full_name || id).join(', ')
    }
    return '-'
  }

  const filtered = items.filter(i => {
    const matchSearch =
      i.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.customer_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.old_serial_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (i.new_sn?.serial_number || i.new_serial_number_raw || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchDate = !dateFilter || i.replacement_date === dateFilter
    return matchSearch && matchDate
  })

  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    try {
      showProgress('Menyiapkan Export', 'Menginisialisasi file Excel...', 10)
      const { applyHeaderStyle, applyDataRowStyles, setColumnWidths, downloadWorkbook } = await import('../../utils/excelHelper.js')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const ws = workbook.addWorksheet('Pergantian ONT')

      const headers = ['Tanggal', 'Lokasi', 'ID Pelanggan', 'Nama Pelanggan', 'SN Lama', 'SN Baru', 'Alasan', 'Teknisi']
      setColumnWidths(ws, [14, 14, 28, 26, 20, 20, 30, 24])
      applyHeaderStyle(ws, headers)

      for (let i = 0; i < filtered.length; i++) {
        const item = filtered[i]
        ws.addRow([
          item.replacement_date ? format(new Date(item.replacement_date + 'T00:00:00'), 'dd/MM/yyyy') : '',
          SITES.find(s => s.value === item.site)?.label || item.site || '',
          item.customer_id || '',
          item.customer_name || '',
          item.old_serial_number || '',
          getSnDisplay(item),
          item.reason || '',
          getTechDisplay(item),
        ])
        if (i % 20 === 0) {
          showProgress('Mengekspor Data', `Memproses ${i + 1} dari ${filtered.length}...`, 10 + ((i + 1) / filtered.length) * 80)
          await new Promise(r => setTimeout(r, 0))
        }
      }
      applyDataRowStyles(ws)

      showProgress('Menyelesaikan Export', 'Mengunduh file Excel...', 95)
      await downloadWorkbook(workbook, `Pergantian ONT ${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      toast.success('Export berhasil!')
    } catch (err) {
      toast.error('Gagal export: ' + err.message)
    } finally {
      hideProgress()
    }
  }

  // ── Format date for display ────────────────────────────────────────────────
  const fmtDate = (dateStr) => {
    if (!dateStr) return '-'
    try { return format(new Date(dateStr + 'T00:00:00'), 'dd MMM yyyy', { locale: id }) }
    catch { return dateStr }
  }

  const TEMPLATE = `GANTI ONT

Tanggal Pergantian : 
NAMA PELANGGAN : 
ID PELANGGAN : 
SN LAMA : 
SN BARU : 
ALASAN DI GANTI : 
TEKNISI : 

Minta tolong Config ulang @Call Center Wifian Solution`

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Pergantian ONT</h2>
          <p>Riwayat pergantian perangkat ONT pelanggan</p>
        </div>
        <div className="page-header-right">
          {can(role, 'ont.export') && (
            <button className="btn btn-secondary" onClick={handleExportExcel}>
              <Download size={16} /> Export
            </button>
          )}
          {can(role, 'ont.input') && (
            <button className="btn btn-primary" onClick={() => { setWaText(''); setParsed(null); setIsModalOpen(true) }}>
              <ClipboardPaste size={16} /> Input Pergantian ONT
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="filter-bar mb-4" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <div className="search-box" style={{ flex: 1, minWidth: '200px' }}>
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Cari nama, ID, SN..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="date-filter-group" style={{ position: 'relative', flex: 1, minWidth: '150px', maxWidth: '250px' }}>
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
              <button className="btn-clear-date" onClick={() => setDateFilter('')}
                style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', padding: '4px' }}>
                <X size={16} />
              </button>
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
                    <th>Tanggal</th>
                    <th>Lokasi</th>
                    <th>Pelanggan</th>
                    <th>SN Lama</th>
                    <th></th>
                    <th>SN Baru</th>
                    <th>Alasan</th>
                    <th>Teknisi</th>
                    {can(role, 'ont.delete') && <th style={{ textAlign: 'right' }}>Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(item => (
                    <tr key={item.id}>
                      <td className="text-secondary">{fmtDate(item.replacement_date)}</td>
                      <td>
                        <span className="badge badge-accent">
                          {SITES.find(s => s.value === item.site)?.label || item.site || '-'}
                        </span>
                      </td>
                      <td>
                        <div className="font-semibold">{item.customer_name}</div>
                        <div className="text-secondary" style={{ fontSize: '11px' }}>{item.customer_id}</div>
                      </td>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--danger)' }}>{item.old_serial_number}</span></td>
                      <td><ArrowRight size={14} style={{ color: 'var(--text-muted)' }} /></td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--success)' }}>
                          {getSnDisplay(item)}
                        </span>
                        {item.new_sn?.brand && (
                          <div className="text-secondary" style={{ fontSize: '10px' }}>{item.new_sn.brand.brand_name} {item.new_sn.type?.type_name}</div>
                        )}
                      </td>
                      <td className="text-secondary">{item.reason || '-'}</td>
                      <td style={{ fontSize: '12px' }}>{getTechDisplay(item)}</td>
                      {can(role, 'ont.delete') && (
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn-icon text-danger" onClick={() => handleDelete(item)}><Trash2 size={15} /></button>
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
                        <div className="mobile-card-title">{item.customer_name}</div>
                        <div className="mobile-card-subtitle">{item.customer_id}</div>
                      </div>
                      <div className="text-secondary" style={{ fontSize: '12px' }}>{fmtDate(item.replacement_date)}</div>
                    </div>
                    {expandedId === item.id && (
                      <div className="mobile-card-body">
                        <div className="mobile-info-row"><span className="mobile-info-label">Lokasi</span><span className="mobile-info-value">{SITES.find(s => s.value === item.site)?.label || item.site || '-'}</span></div>
                        <div className="mobile-info-row">
                          <span className="mobile-info-label">SN Lama</span>
                          <span className="mobile-info-value" style={{ fontFamily: 'monospace', color: 'var(--danger)' }}>{item.old_serial_number}</span>
                        </div>
                        <div className="mobile-info-row">
                          <span className="mobile-info-label">SN Baru</span>
                          <span className="mobile-info-value" style={{ fontFamily: 'monospace', color: 'var(--success)' }}>{getSnDisplay(item)}</span>
                        </div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Alasan</span><span className="mobile-info-value">{item.reason || '-'}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">Teknisi</span><span className="mobile-info-value">{getTechDisplay(item)}</span></div>
                        {can(role, 'ont.delete') && (
                          <div className="mobile-card-actions">
                            <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(item)}><Trash2 size={14} /> Hapus</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <Pagination page={page} setPage={setPage} perPage={perPage} setPerPage={setPerPage} totalItems={filtered.length} />
            </>
          ) : (
            <div className="empty-state"><RefreshCcw size={48} /><h3>Belum Ada Data</h3><p>Belum ada riwayat pergantian ONT.</p></div>
          )}
        </div>
      </div>

      {/* ── Input Modal ─────────────────────────────────────────────────────── */}
      {isModalOpen && createPortal(
        <div className="modal-overlay">
          <div className="modal modal-lg" style={{ display: 'flex', flexDirection: 'column', maxHeight: '92vh', width: '90%', maxWidth: '680px' }}>
            <div className="modal-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '16px 20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardPaste size={16} /> Input Pergantian ONT dari WA
              </h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={18} /></button>
            </div>

            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Lokasi */}
              <div className="form-group">
                <label className="form-label">Lokasi</label>
                <select className="form-input" style={{ height: 'auto' }} value={site} onChange={e => setSite(e.target.value)}>
                  {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              {/* Format contoh */}
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '12px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '8px', lineHeight: '1.8' }}>
                <strong style={{ color: 'var(--accent)', display: 'block', marginBottom: '4px' }}>Format pesan WA:</strong>
                <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{TEMPLATE}</pre>
              </div>

              {/* Textarea paste */}
              <div className="form-group">
                <label className="form-label">Paste pesan WA di sini</label>
                <textarea
                  className="form-input"
                  rows={6}
                  value={waText}
                  onChange={e => handleWaChange(e.target.value)}
                  placeholder="Paste teks WA di sini..."
                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '13px', padding: '12px' }}
                />
              </div>

              {/* Preview hasil parse */}
              {parsed && (
                <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,.08),rgba(5,150,105,.04))', border: '1px solid rgba(16,185,129,.3)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(16,185,129,.2)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', color: 'var(--success)' }}>
                    <CheckCircle size={14} /> Preview Hasil Parsing
                  </div>
                  <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      ['Tanggal Pergantian', fmtDate(parsed.replacement_date)],
                      ['Nama Pelanggan', parsed.customer_name || '—'],
                      ['ID Pelanggan', parsed.customer_id || '—'],
                      ['SN Lama', parsed.old_serial_number || '—'],
                      ['SN Baru', parsed.new_serial_number_raw || '—'],
                      ['Alasan', parsed.reason || '—'],
                      ['Teknisi', parsed.technician_raw || '—'],
                    ].map(([label, val]) => (
                      <div key={label} style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
                        <span style={{ minWidth: '160px', color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
                        <span style={{ fontWeight: 600, wordBreak: 'break-all', fontFamily: label.includes('SN') ? 'monospace' : 'inherit' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !parsed}>
                {saving ? <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> : 'Simpan'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

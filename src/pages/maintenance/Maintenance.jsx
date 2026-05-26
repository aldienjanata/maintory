import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { can, isAdmin } from '../../utils/permissions'
import { logActivity } from '../../utils/logActivity'
import toast from 'react-hot-toast'
import { 
  Search, Filter, Plus, Trash2, Edit2, CheckCircle, Clock,
  MapPin, Phone, MessageCircle, AlertCircle, X, Download, Wrench
} from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'

export default function Maintenance() {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi'
  
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [technicians, setTechnicians] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  
  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [waText, setWaText] = useState('')
  const [parsedTickets, setParsedTickets] = useState([])
  const [globalTechnicians, setGlobalTechnicians] = useState([]) // Teknisi hari ini, berlaku ke semua tiket
  const [actionModal, setActionModal] = useState({ open: false, ticket: null, type: 'close', note: '' })

  useEffect(() => {
    fetchTickets()
    fetchTechnicians()
  }, [])

  const fetchTickets = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .order('created_at', { ascending: false })
      
    if (error) {
      toast.error('Gagal mengambil data maintenance')
    } else {
      setTickets(data || [])
    }
    setLoading(false)
  }

  const fetchTechnicians = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, username')
      .neq('role', 'superadmin')
      .eq('is_active', true)
      
    if (!error && data) {
      setTechnicians(data)
    }
  }

  // --- WA Parsing Logic ---
  const parseWaText = (text) => {
    if (!text.trim()) {
      setParsedTickets([])
      return
    }

    // Split by numbers like "1.", "2." at the start of a line
    // or double newlines between blocks
    const blocks = text.split(/(?=\n\d+\.)|(?:\n\s*\n(?=\d+\.))/g)
    
    const parsed = blocks.map(block => {
      const b = block.trim()
      if (!b) return null

      // Regex to extract fields
      const ticketMatch = b.match(/^(\d+)\.Desa\s+(.+)$/im) || b.match(/^(\d+)\.\s*Desa\s+(.+)$/im)
      const namaMatch = b.match(/Nama\s*:\s*(.+)$/im)
      const alamatMatch = b.match(/Alamat\s*:\s*(.+)$/im)
      const idMatch = b.match(/ID Pelanggan\s*:\s*(.+)$/im)
      const hpMatch = b.match(/No Hp\s*:\s*(.+)$/im)
      const keluhanMatch = b.match(/Keluhan\s*:\s*(.+)$/im)
      const sharelokMatch = b.match(/Sharelok\s*:\s*(.+)$/im)
      const noteMatch = b.match(/Note\s*:\s*(.+)$/im)

      if (!ticketMatch && !namaMatch) return null // not a valid block

      return {
        _id: Math.random().toString(36).substr(2, 9), // temp id for UI
        ticket_number: ticketMatch ? ticketMatch[1].trim() : '',
        village: ticketMatch ? ticketMatch[2].trim() : '',
        customer_name: namaMatch ? namaMatch[1].trim() : '',
        address: alamatMatch ? alamatMatch[1].trim() : '',
        customer_id: idMatch ? idMatch[1].trim() : '',
        phone_number: hpMatch ? hpMatch[1].trim() : '',
        complaint: keluhanMatch ? keluhanMatch[1].trim() : '',
        sharelok: sharelokMatch ? sharelokMatch[1].trim() : '',
        note: noteMatch ? noteMatch[1].trim() : '',
        technicians: [] // default empty
      }
    }).filter(Boolean)

    setParsedTickets(parsed)
  }

  const handleWaTextChange = (e) => {
    setWaText(e.target.value)
    parseWaText(e.target.value)
  }

  // Toggle teknisi global (berlaku untuk semua tiket hari ini)
  const handleGlobalTechnicianChange = (techId) => {
    setGlobalTechnicians(prev =>
      prev.includes(techId) ? prev.filter(id => id !== techId) : [...prev, techId]
    )
  }

  const handleSaveParsed = async () => {
    if (parsedTickets.length === 0) return

    // Validations
    const invalid = parsedTickets.find(t => !t.ticket_number || !t.customer_name)
    if (invalid) {
      toast.error('Ada data tidak lengkap (No Tiket atau Nama kosong). Periksa kembali hasil parsing.')
      return
    }

    try {
      // Gunakan globalTechnicians untuk semua tiket
      const toInsert = parsedTickets.map(({ _id, ...rest }) => ({
        ...rest,
        technicians: globalTechnicians,
        status: 'aktif',
        created_by: profile.id
      }))

      const { error } = await supabase.from('maintenance_tickets').insert(toInsert)
      if (error) throw error

      const techNames = globalTechnicians.map(id => technicians.find(t => t.id === id)?.full_name || '').filter(Boolean).join(', ')
      await logActivity({
        userId: profile.id,
        username: profile.username,
        role: profile.role,
        module: 'Maintenance',
        action: 'Tambah Tiket Massal',
        detail: `Menambahkan ${toInsert.length} tiket baru — Teknisi: ${techNames || '-'}`
      })

      toast.success(`${toInsert.length} tiket berhasil ditambahkan`)
      setIsAddModalOpen(false)
      setWaText('')
      setParsedTickets([])
      setGlobalTechnicians([])
      fetchTickets()
    } catch (err) {
      toast.error('Gagal menyimpan data: ' + err.message)
    }
  }

  // --- Action Modal (Pending / Close) ---
  const handleOpenAction = (ticket) => {
    setActionModal({ open: true, ticket, type: 'close', note: '' })
  }

  const handleConfirmAction = async () => {
    const { ticket, type, note } = actionModal
    try {
      const updateData = {
        status: type,
        action_note: note || null,
        ...(type === 'close' ? { completed_at: new Date().toISOString() } : { completed_at: null })
      }
      const { error } = await supabase
        .from('maintenance_tickets')
        .update(updateData)
        .eq('id', ticket.id)

      if (error) throw error

      await logActivity({
        userId: profile.id,
        username: profile.username,
        role: profile.role,
        module: 'Maintenance',
        action: type === 'close' ? 'Close Tiket' : 'Pending Tiket',
        detail: `Tiket #${ticket.ticket_number} - ${ticket.customer_name}${note ? ' | Catatan: ' + note : ''}`
      })

      toast.success(type === 'close' ? 'Tiket berhasil diselesaikan' : 'Tiket ditandai pending')
      setActionModal({ open: false, ticket: null, type: 'close', note: '' })
      fetchTickets()
    } catch (err) {
      toast.error('Gagal: ' + err.message)
    }
  }

  const handleDelete = async (ticket) => {
    if (!window.confirm(`Hapus tiket #${ticket.ticket_number}? Data akan hilang permanen.`)) return

    try {
      const { error } = await supabase
        .from('maintenance_tickets')
        .delete()
        .eq('id', ticket.id)

      if (error) throw error

      await logActivity({
        userId: profile.id,
        username: profile.username,
        role: profile.role,
        module: 'Maintenance',
        action: 'Hapus Tiket',
        detail: `Menghapus tiket #${ticket.ticket_number} - ${ticket.customer_name}`
      })

      toast.success('Tiket berhasil dihapus')
      fetchTickets()
    } catch (err) {
      toast.error('Gagal menghapus tiket')
    }
  }

  // Filters
  const filteredTickets = tickets.filter(t => {
    const matchSearch = 
      t.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.customer_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.ticket_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.village?.toLowerCase().includes(searchTerm.toLowerCase())
      
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    
    return matchSearch && matchStatus
  })

  // Export (dummy implementation for now)
  const handleExport = () => {
    toast('Fitur Export Excel akan segera hadir', { icon: '📊' })
  }

  const getTechNames = (techIds) => {
    if (!techIds || !techIds.length) return '-'
    return techIds.map(id => technicians.find(t => t.id === id)?.full_name || 'Unknown').join(', ')
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Data Maintenance</h2>
          <p>Kelola tiket keluhan pelanggan dan penjadwalan</p>
        </div>
        <div className="page-header-right">
          {can(role, 'maintenance.export') && (
            <button className="btn btn-secondary" onClick={handleExport}>
              <Download size={16} /> Export
            </button>
          )}
          {can(role, 'maintenance.input') && (
            <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)}>
              <Plus size={16} /> Input Tiket WA
            </button>
          )}
        </div>
      </div>

      <div className="card mb-4">
        <div className="filter-bar">
          <div className="search-box" style={{ maxWidth: '250px' }}>
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              placeholder="Cari nama, ID, desa, tiket..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="pending">Pending</option>
            <option value="close">Close</option>
          </select>
        </div>

        <div className="table-container">
          {loading ? (
            <div className="flex-center" style={{ height: '200px' }}>
              <div className="spinner"></div>
            </div>
          ) : filteredTickets.length > 0 ? (
            <>
              <table className="desktop-only">
                <thead>
                  <tr>
                    <th>No Tiket</th>
                    <th>Tanggal</th>
                    <th>Pelanggan</th>
                    <th>Keluhan & Note</th>
                    <th>Lokasi</th>
                    <th>Teknisi</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map(ticket => (
                    <tr key={ticket.id}>
                      <td><div className="font-semibold">#{ticket.ticket_number}</div></td>
                      <td>{format(new Date(ticket.date_input), 'dd MMM yyyy', { locale: id })}</td>
                      <td>
                        <div className="font-semibold text-accent">{ticket.customer_name}</div>
                        <div className="text-secondary" style={{ fontSize: '11px' }}>{ticket.customer_id}</div>
                        {ticket.phone_number && (
                          <a href={`https://wa.me/${ticket.phone_number.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="badge badge-success" style={{ marginTop: '4px', textDecoration: 'none' }}>
                            <MessageCircle size={10} /> {ticket.phone_number}
                          </a>
                        )}
                      </td>
                      <td>
                        <div>{ticket.complaint}</div>
                        {ticket.note && <div className="text-secondary mt-2" style={{ fontSize: '12px' }}>Note: {ticket.note}</div>}
                      </td>
                      <td>
                        <div>{ticket.village}</div>
                        {ticket.sharelok && (
                          <a href={ticket.sharelok} target="_blank" rel="noreferrer" className="text-accent" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                            <MapPin size={12} /> Buka Maps
                          </a>
                        )}
                      </td>
                      <td>{getTechNames(ticket.technicians)}</td>
                      <td>
                        {ticket.status === 'close' ? (
                          <span className="badge badge-success"><CheckCircle size={12} /> Close</span>
                        ) : ticket.status === 'pending' ? (
                          <span className="badge" style={{ background: 'rgba(255,170,0,0.15)', color: '#ffaa00', border: '1px solid rgba(255,170,0,0.3)' }}><Clock size={12} /> Pending</span>
                        ) : (
                          <span className="badge badge-warning"><AlertCircle size={12} /> Aktif</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                          {ticket.status === 'aktif' && (
                            <button 
                              className="btn-icon text-success" 
                              title="Update Status Tiket"
                              onClick={() => handleOpenAction(ticket)}
                            >
                              <CheckCircle size={16} />
                            </button>
                          )}
                          {isAdmin(role) && (
                            <>
                              <button className="btn-icon text-danger" title="Hapus" onClick={() => handleDelete(ticket)}>
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mobile-only mobile-card-list">
                {filteredTickets.map(ticket => (
                  <div key={ticket.id} className="mobile-card">
                    <div className="mobile-card-header" onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}>
                      <div>
                        <div className="mobile-card-title">{ticket.customer_name}</div>
                        <div className="mobile-card-subtitle">#{ticket.ticket_number} - {ticket.village}</div>
                      </div>
                      <div>
                        {ticket.status === 'close' ? (
                          <span className="badge badge-success"><CheckCircle size={10} /> Close</span>
                        ) : ticket.status === 'pending' ? (
                          <span className="badge" style={{ background: 'rgba(255,170,0,0.15)', color: '#ffaa00', border: '1px solid rgba(255,170,0,0.3)' }}><Clock size={10} /> Pending</span>
                        ) : (
                          <span className="badge badge-warning"><AlertCircle size={10} /> Aktif</span>
                        )}
                      </div>
                    </div>
                    {expandedId === ticket.id && (
                      <div className="mobile-card-body">
                        <div className="mobile-info-row"><span className="mobile-info-label">Tanggal</span><span className="mobile-info-value">{format(new Date(ticket.date_input), 'dd MMM yyyy', { locale: id })}</span></div>
                        <div className="mobile-info-row"><span className="mobile-info-label">ID Pelanggan</span><span className="mobile-info-value">{ticket.customer_id}</span></div>
                        
                        {ticket.phone_number && (
                          <div className="mobile-info-row">
                            <span className="mobile-info-label">WhatsApp</span>
                            <span className="mobile-info-value">
                              <a href={`https://wa.me/${ticket.phone_number.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-success" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                <MessageCircle size={14} /> Hubungi
                              </a>
                            </span>
                          </div>
                        )}
                        
                        {ticket.sharelok && (
                          <div className="mobile-info-row">
                            <span className="mobile-info-label">Maps</span>
                            <span className="mobile-info-value">
                              <a href={ticket.sharelok} target="_blank" rel="noreferrer" className="text-accent" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                <MapPin size={14} /> Buka Maps
                              </a>
                            </span>
                          </div>
                        )}

                        <div className="mobile-info-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                          <span className="mobile-info-label">Keluhan:</span>
                          <span className="mobile-info-value" style={{ textAlign: 'left', maxWidth: '100%', marginTop: '4px' }}>{ticket.complaint}</span>
                        </div>
                        
                        {ticket.note && (
                          <div className="mobile-info-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                            <span className="mobile-info-label">Note:</span>
                            <span className="mobile-info-value" style={{ textAlign: 'left', maxWidth: '100%', marginTop: '4px' }}>{ticket.note}</span>
                          </div>
                        )}

                        <div className="mobile-info-row"><span className="mobile-info-label">Teknisi</span><span className="mobile-info-value">{getTechNames(ticket.technicians)}</span></div>

                        <div className="mobile-card-actions">
                          {ticket.status === 'aktif' && (
                            <button className="btn btn-secondary btn-sm text-success" onClick={() => handleOpenAction(ticket)}>
                              <CheckCircle size={14} /> Update Status
                            </button>
                          )}
                          {isAdmin(role) && (
                            <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDelete(ticket)}>
                              <Trash2 size={14} /> Hapus
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <Wrench size={48} />
              <h3>Tidak Ada Data</h3>
              <p>Belum ada data maintenance atau tidak cocok dengan filter.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Input Paste WA */}
      {isAddModalOpen && (
        <div className="modal-overlay">
          <div className="modal modal-xl">
            <div className="modal-header">
              <h3>Input Tiket dari WhatsApp</h3>
              <button className="btn-icon" onClick={() => setIsAddModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-4">
                <label className="form-label">Paste pesan WhatsApp di sini (bisa banyak sekaligus)</label>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', padding: '10px', background: 'var(--bg-hover)', borderRadius: '6px' }}>
                  <strong>Contoh Format:</strong><br/>
                  1.Desa Bangsa<br/>
                  Nama : Wasito<br/>
                  Alamat : RT 004 RW 001 Desa Bangsa Kecamatan Kebasen<br/>
                  ID Pelanggan : 816806946@bms.wifian.net.id<br/>
                  No Hp : +6281327419114<br/>
                  Keluhan : Loss Merah<br/>
                  Sharelok : https://maps.app.goo.gl/mqVmn9tvgrUSZiBd9?g_st<br/>
                  Note : Info By Pak Joko
                </div>
                <textarea 
                  className="form-input" 
                  rows={8} 
                  value={waText}
                  onChange={handleWaTextChange}
                  placeholder="Paste teks WA di sini..."
                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '13px' }}
                />
              </div>

              {parsedTickets.length > 0 && (
                <div>
                  {/* === PILIH TEKNISI SEKALI UNTUK SEMUA TIKET === */}
                  <div style={{ background: 'var(--bg-hover)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <Wrench size={15} style={{ color: 'var(--accent)' }} />
                      <span className="font-semibold" style={{ fontSize: '14px' }}>Teknisi Hari Ini</span>
                      <span className="text-secondary" style={{ fontSize: '12px' }}>— pilihan ini berlaku untuk semua {parsedTickets.length} tiket</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {technicians.map(tech => (
                        <button
                          key={tech.id}
                          type="button"
                          onClick={() => handleGlobalTechnicianChange(tech.id)}
                          className={`badge ${globalTechnicians.includes(tech.id) ? 'badge-accent' : 'badge-muted'}`}
                          style={{ border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: '13px' }}
                        >
                          {globalTechnicians.includes(tech.id) ? '✓ ' : ''}{tech.full_name}
                        </button>
                      ))}
                    </div>
                    {globalTechnicians.length === 0 && (
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px', marginBottom: 0 }}>
                        ⚠️ Belum ada teknisi dipilih. Tiket akan disimpan tanpa teknisi.
                      </p>
                    )}
                  </div>

                  <h4 className="mb-4 font-semibold text-accent">Preview Hasil Parsing ({parsedTickets.length} Tiket)</h4>
                  <div className="table-container" style={{ maxHeight: '260px' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>No</th>
                          <th>Desa</th>
                          <th>Nama / ID Pelanggan</th>
                          <th>Keluhan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedTickets.map((t) => (
                          <tr key={t._id}>
                            <td className="font-bold">#{t.ticket_number}</td>
                            <td>{t.village}</td>
                            <td>
                              <div>{t.customer_name}</div>
                              <div className="text-secondary" style={{ fontSize: '11px' }}>{t.customer_id}</div>
                            </td>
                            <td>{t.complaint}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>Batal</button>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveParsed}
                disabled={parsedTickets.length === 0}
              >
                Simpan {parsedTickets.length} Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === CUSTOM ACTION MODAL === */}
      {actionModal.open && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal" style={{ maxWidth: '420px', width: '90%' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                <CheckCircle size={18} style={{ color: 'var(--accent)' }} />
                Update Status Tiket
              </h3>
              <button className="btn-icon" onClick={() => setActionModal({ open: false, ticket: null, type: 'close', note: '' })}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Info Tiket */}
              <div style={{ background: 'var(--bg-hover)', borderRadius: '10px', padding: '12px 14px', borderLeft: '3px solid var(--accent)' }}>
                <div className="font-semibold">{actionModal.ticket?.customer_name}</div>
                <div className="text-secondary" style={{ fontSize: '12px', marginTop: '2px' }}>
                  Tiket #{actionModal.ticket?.ticket_number} &nbsp;·&nbsp; {actionModal.ticket?.village}
                </div>
                {actionModal.ticket?.complaint && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Keluhan: {actionModal.ticket.complaint}</div>
                )}
              </div>

              {/* Pilih Status */}
              <div>
                <label className="form-label" style={{ marginBottom: '10px' }}>Pilih Aksi</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setActionModal(m => ({ ...m, type: 'pending' }))}
                    style={{
                      flex: 1, padding: '14px 10px', borderRadius: '12px', border: '2px solid',
                      borderColor: actionModal.type === 'pending' ? '#ffaa00' : 'var(--border-color)',
                      background: actionModal.type === 'pending' ? 'rgba(255,170,0,0.1)' : 'transparent',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Clock size={22} style={{ color: '#ffaa00' }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffaa00' }}>Pending</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>Ditunda sementara</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionModal(m => ({ ...m, type: 'close' }))}
                    style={{
                      flex: 1, padding: '14px 10px', borderRadius: '12px', border: '2px solid',
                      borderColor: actionModal.type === 'close' ? 'var(--success)' : 'var(--border-color)',
                      background: actionModal.type === 'close' ? 'rgba(0,200,83,0.1)' : 'transparent',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <CheckCircle size={22} style={{ color: 'var(--success)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--success)' }}>Selesai</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>Tiket ditutup</span>
                  </button>
                </div>
              </div>

              {/* Catatan */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  {actionModal.type === 'pending' ? 'Alasan Pending' : 'Catatan Penyelesaian'}
                  <span className="text-secondary" style={{ fontSize: '11px', fontWeight: 400, marginLeft: '6px' }}>(opsional)</span>
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={actionModal.note}
                  onChange={e => setActionModal(m => ({ ...m, note: e.target.value }))}
                  placeholder={actionModal.type === 'pending'
                    ? 'Contoh: Menunggu spare part, customer tidak di rumah...'
                    : 'Contoh: Sudah diperbaiki, sinyal normal kembali...'}
                  style={{ resize: 'none' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setActionModal({ open: false, ticket: null, type: 'close', note: '' })}>Batal</button>
              <button
                className="btn"
                style={{
                  background: actionModal.type === 'close' ? 'var(--success)' : '#ffaa00',
                  color: '#fff', display: 'flex', alignItems: 'center', gap: '6px'
                }}
                onClick={handleConfirmAction}
              >
                {actionModal.type === 'close'
                  ? <><CheckCircle size={15} /> Selesaikan Tiket</>
                  : <><Clock size={15} /> Tandai Pending</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

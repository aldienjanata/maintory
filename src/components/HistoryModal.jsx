import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, History, ArrowDown, ArrowUp, RefreshCw } from 'lucide-react'

export default function HistoryModal({ isOpen, onClose, item, data, loading, title, unit = '' }) {
  const [filterMonth, setFilterMonth] = useState('all')
  const [page, setPage] = useState(1)
  const perPage = 10

  // Derive unique months from data for the filter
  const months = useMemo(() => {
    const m = new Set()
    data.forEach(d => {
      if (d.date && d.date.length >= 7) {
        m.add(d.date.substring(0, 7)) // yyyy-mm
      }
    })
    return Array.from(m).sort().reverse()
  }, [data])

  const filteredData = useMemo(() => {
    if (filterMonth === 'all') return data
    return data.filter(d => d.date && d.date.startsWith(filterMonth))
  }, [data, filterMonth])

  const paginatedData = useMemo(() => {
    return filteredData.slice((page - 1) * perPage, page * perPage)
  }, [filteredData, page, perPage])

  const totalPages = Math.ceil(filteredData.length / perPage)

  // Compute total masuk/keluar summary
  const summary = useMemo(() => {
    let totalIn = 0, totalOut = 0
    filteredData.forEach(r => {
      const q = Number(r.qty) || 0
      if (r.type === 'in') totalIn += q
      else if (r.type === 'out') totalOut += q
    })
    return { totalIn, totalOut }
  }, [filteredData])

  if (!isOpen || !item) return null

  const getIcon = (type) => {
    if (type === 'in') return <ArrowDown size={14} style={{ color: 'var(--accent)' }} />
    if (type === 'out') return <ArrowDown size={14} style={{ color: 'var(--danger)', transform: 'rotate(180deg)' }} />
    if (type === 'pending') return <RefreshCw size={14} style={{ color: 'var(--warning)' }} />
    return null
  }

  return createPortal(
    <div className="modal-overlay">
      <div className="modal modal-lg" style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        
        {/* Filter & Summary Bar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Filter Bulan:</span>
            <select 
              value={filterMonth} 
              onChange={e => { setFilterMonth(e.target.value); setPage(1) }}
              style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }}
            >
              <option value="all">Semua Bulan</option>
              {months.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          {!loading && data.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', fontSize: '12px' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                ↓ Masuk: {summary.totalIn} {unit}
              </span>
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                ↑ Keluar: {summary.totalOut} {unit}
              </span>
            </div>
          )}
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '16px' }}>
          {loading ? (
            <div className="flex-center" style={{ height: '120px' }}><div className="spinner" /></div>
          ) : filteredData.length === 0 ? (
            <div className="empty-state"><History size={32} /><p>Belum ada riwayat transaksi</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {paginatedData.map((r, i) => {
                const isIn = r.type === 'in'
                const isPending = r.type === 'pending'
                const dotColor = isIn ? 'var(--accent)' : isPending ? 'var(--warning)' : 'var(--danger)'
                const bgColor = isIn ? 'var(--accent-dim)' : isPending ? 'rgba(255,180,0,0.08)' : 'var(--bg-primary)'
                const borderColor = isIn ? 'var(--accent)' : isPending ? 'var(--warning)' : 'var(--border)'
                const qtySign = isIn ? '+' : isPending ? '~' : '-'
                const qty = Number(r.qty) || 0

                return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: '5px' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Date & Action */}
                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span>{r.date}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>—</span>
                      <span>{r.action}</span>
                    </div>

                    {/* Qty */}
                    {qty > 0 && (
                      <div style={{ fontSize: '12px', fontWeight: 700, color: dotColor, marginBottom: '4px' }}>
                        {qtySign}{qty} {unit}
                      </div>
                    )}

                    {/* Work type */}
                    {r.workType && (
                      <div className="text-secondary" style={{ fontSize: '12px', marginBottom: '2px' }}>
                        🔧 Jenis Pekerjaan: <strong>{r.workType}</strong>
                      </div>
                    )}

                    {/* Technician names */}
                    {r.technicianNames && (
                      <div className="text-secondary" style={{ fontSize: '12px', marginBottom: '2px' }}>
                        👷 Teknisi: <strong>{r.technicianNames}</strong>
                      </div>
                    )}

                    {/* Note / location */}
                    {r.note && (
                      <div className="text-secondary" style={{ fontSize: '12px', marginBottom: '2px', lineHeight: '1.5' }}>
                        📝 {r.note}
                      </div>
                    )}

                    {/* User who recorded it */}
                    {r.user && (
                      <div className="text-secondary" style={{ fontSize: '11px', marginTop: '2px', opacity: 0.7 }}>
                        Dicatat oleh: {r.user}
                      </div>
                    )}
                  </div>

                  {/* Badge qty on the right */}
                  {qty > 0 && (
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: dotColor,
                      color: isIn ? '#000' : '#fff',
                      flexShrink: 0,
                      whiteSpace: 'nowrap'
                    }}>
                      {qtySign}{qty} {unit}
                    </span>
                  )}
                </div>
              )})}
            </div>
          )}
        </div>
        
        {!loading && filteredData.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Hal {page} dari {totalPages || 1} ({filteredData.length} data)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn btn-secondary btn-sm" 
                disabled={page === 1} 
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Sebelumnya
              </button>
              <button 
                className="btn btn-secondary btn-sm" 
                disabled={page >= totalPages} 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

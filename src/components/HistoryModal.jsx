import { useState, useMemo } from 'react'
import { X, History } from 'lucide-react'

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

  if (!isOpen || !item) return null

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '12px', alignItems: 'center' }}>
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

        <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '16px' }}>
          {loading ? (
            <div className="flex-center" style={{ height: '120px' }}><div className="spinner" /></div>
          ) : filteredData.length === 0 ? (
            <div className="empty-state"><History size={32} /><p>Belum ada riwayat transaksi</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {paginatedData.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: r.type === 'in' ? 'var(--accent-dim)' : 'var(--bg-primary)', border: `1px solid ${r.type === 'in' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.type === 'in' ? 'var(--accent)' : 'var(--warning)', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{r.date} — {r.action}</div>
                    
                    {r.type === 'in' ? (
                      <>
                        <div className="text-secondary" style={{ fontSize: '12px' }}>{r.note || '-'}</div>
                        {r.user && <div className="text-secondary" style={{ fontSize: '11px', marginTop: '2px' }}>oleh {r.user}</div>}
                      </>
                    ) : (
                      <>
                        {r.workType && <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>Pekerjaan: {r.workType}</div>}
                        <div className="text-secondary" style={{ fontSize: '12px' }}>Lokasi: {r.note || '-'}</div>
                        {r.technicianNames && <div className="text-secondary" style={{ fontSize: '11px', marginTop: '2px' }}>Teknisi: {r.technicianNames}</div>}
                      </>
                    )}
                  </div>
                  <span className={`badge ${r.type === 'in' ? 'badge-accent' : 'badge-warning'}`}>
                    {r.type === 'in' ? '+' : '-'}{r.qty} {unit}
                  </span>
                </div>
              ))}
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
    </div>
  )
}

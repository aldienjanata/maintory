import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, setPage, perPage, setPerPage, totalItems }) {
  const totalPages = Math.ceil(totalItems / perPage)
  if (totalItems === 0) return null

  const start = (page - 1) * perPage + 1
  const end = Math.min(page * perPage, totalItems)

  const handlePrev = () => setPage(p => Math.max(1, p - 1))
  const handleNext = () => setPage(p => Math.min(totalPages, p + 1))

  // Calculate sliding window of pages (max 5 buttons visible)
  let startPage = Math.max(1, page - 2)
  let endPage = Math.min(totalPages, startPage + 4)
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4)
  }

  const pages = []
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i)
  }

  return (
    <div className="pagination-wrapper" style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', /* Center alignment by default */
      flexWrap: 'wrap', 
      gap: '16px', 
      padding: '16px 0 4px', 
      marginTop: '12px', 
      borderTop: '1px solid var(--border)' 
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Showing {start}–{end} of {totalItems} entries
        </span>
        <select 
          value={perPage} 
          onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }} 
          style={{ 
            padding: '3px 8px', 
            borderRadius: '6px', 
            background: 'var(--bg-card)', 
            border: '1px solid var(--border)', 
            color: 'var(--text-primary)', 
            fontSize: '13px', 
            cursor: 'pointer' 
          }}
        >
          {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / hal</option>)}
        </select>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            className="btn-icon" 
            onClick={handlePrev} 
            disabled={page === 1} 
            style={{ padding: '4px 6px', borderRadius: '6px' }}
          >
            <ChevronLeft size={16} />
          </button>
          
          {startPage > 1 && (
            <>
              <button className="btn-icon" onClick={() => setPage(1)} style={{ padding: '4px 10px', borderRadius: '6px' }}>1</button>
              {startPage > 2 && <span style={{ color: 'var(--text-muted)', padding: '0 4px' }}>...</span>}
            </>
          )}

          {pages.map(i => (
            <button 
              key={i} 
              className={`btn-icon ${page === i ? 'active' : ''}`} 
              onClick={() => setPage(i)} 
              style={{ 
                padding: '4px 10px', 
                borderRadius: '6px', 
                background: page === i ? 'var(--accent-dim)' : 'transparent', 
                color: page === i ? 'var(--accent)' : 'inherit',
                fontWeight: page === i ? '600' : 'normal'
              }}
            >
              {i}
            </button>
          ))}

          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && <span style={{ color: 'var(--text-muted)', padding: '0 4px' }}>...</span>}
              <button className="btn-icon" onClick={() => setPage(totalPages)} style={{ padding: '4px 10px', borderRadius: '6px' }}>{totalPages}</button>
            </>
          )}

          <button 
            className="btn-icon" 
            onClick={handleNext} 
            disabled={page === totalPages} 
            style={{ padding: '4px 6px', borderRadius: '6px' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

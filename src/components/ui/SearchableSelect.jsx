import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Plus, Search } from 'lucide-react'

/**
 * SearchableSelect - Combobox yang:
 * 1. Menampilkan dropdown dengan opsi yang ada
 * 2. Bisa difilter/dicari
 * 3. Bisa menambah nilai baru yang belum ada di daftar
 */
export default function SearchableSelect({
  value = '',
  onChange,
  options = [],        // string[]
  placeholder = 'Pilih atau ketik...',
  label,
  required = false,
  disabled = false,
  allowCreate = true,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return options
    return options.filter(o => o.toLowerCase().includes(q))
  }, [options, query])

  const showCreate = allowCreate && query.trim() && !options.some(o => o.toLowerCase() === query.toLowerCase().trim())

  const handleSelect = (val) => {
    onChange(val)
    setOpen(false)
    setQuery('')
  }

  const handleCreate = () => {
    const newVal = query.trim()
    if (newVal) handleSelect(newVal)
  }

  const handleInputClick = () => {
    if (!disabled) {
      setOpen(true)
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered.length > 0) handleSelect(filtered[0])
      else if (showCreate) handleCreate()
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {label && (
        <label className="form-label">
          {label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}
        </label>
      )}

      {/* Display box */}
      <div
        onClick={handleInputClick}
        style={{
          display: 'flex', alignItems: 'center',
          background: 'var(--input-bg, rgba(255,255,255,0.05))',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-md, 8px)',
          padding: '8px 12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          gap: '6px',
          transition: 'border-color 0.2s',
        }}
      >
        {open ? (
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--text-primary)', fontSize: '13px',
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span style={{
            flex: 1, fontSize: '13px',
            color: value ? 'var(--text-primary)' : 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {value || placeholder}
          </span>
        )}
        <ChevronDown size={14} style={{
          color: 'var(--text-muted)', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.2s',
        }} />
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--card-bg, #1e2130)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md, 8px)', zIndex: 9999,
          maxHeight: '220px', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          {filtered.length === 0 && !showCreate && (
            <div style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Tidak ada hasil
            </div>
          )}

          {filtered.map(opt => (
            <div
              key={opt}
              onMouseDown={() => handleSelect(opt)}
              style={{
                padding: '9px 12px', fontSize: '13px', cursor: 'pointer',
                color: opt === value ? 'var(--accent)' : 'var(--text-primary)',
                background: opt === value ? 'rgba(var(--accent-rgb,59,130,246),0.08)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = opt === value ? 'rgba(var(--accent-rgb,59,130,246),0.08)' : 'transparent'}
            >
              {opt}
            </div>
          ))}

          {showCreate && (
            <div
              onMouseDown={handleCreate}
              style={{
                padding: '9px 12px', fontSize: '13px', cursor: 'pointer',
                color: 'var(--success, #22c55e)',
                display: 'flex', alignItems: 'center', gap: '6px',
                borderTop: filtered.length > 0 ? '1px solid var(--border)' : 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Plus size={13} />
              Tambah "<strong>{query.trim()}</strong>"
            </div>
          )}
        </div>
      )}
    </div>
  )
}

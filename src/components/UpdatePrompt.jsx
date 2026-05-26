import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Cek update setiap 60 detik
      r && setInterval(() => r.update(), 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      background: 'linear-gradient(135deg, #1c2230, #21262d)',
      border: '1px solid var(--accent)',
      borderRadius: '14px',
      padding: '14px 20px',
      boxShadow: '0 8px 32px rgba(0,212,255,0.25)',
      color: 'var(--text-primary)',
      fontSize: '14px',
      maxWidth: '340px',
      width: 'calc(100vw - 48px)',
      animation: 'slideUp 0.3s ease',
    }}>
      <RefreshCw size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <span style={{ flex: 1, lineHeight: 1.4 }}>
        Ada <strong style={{ color: 'var(--accent)' }}>versi baru</strong>! Perbarui agar aplikasi berjalan lancar.
      </span>
      <button
        onClick={() => {
          updateServiceWorker(true).then(() => {
            // Force hard reload
            window.location.href = window.location.href
            window.location.reload(true)
          })
        }}
        style={{
          background: 'var(--accent)',
          color: '#0d1117',
          border: 'none',
          borderRadius: '8px',
          padding: '8px 14px',
          fontWeight: 700,
          fontSize: '13px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Perbarui
      </button>
    </div>
  )
}

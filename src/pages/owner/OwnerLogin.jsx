import { useState } from 'react'
import { useOwnerAuth } from '../../contexts/OwnerAuthContext'
import { Shield, Lock, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

export default function OwnerLogin() {
  const { ownerLogin } = useOwnerAuth()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attempts, setAttempts] = useState(0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (attempts >= 5) {
      toast.error('Terlalu banyak percobaan. Refresh halaman untuk mencoba lagi.')
      return
    }
    setIsSubmitting(true)
    await new Promise(r => setTimeout(r, 600)) // delay anti-brute
    const success = ownerLogin(password)
    if (success) {
      toast.success('Selamat datang, Owner!')
    } else {
      setAttempts(a => a + 1)
      toast.error(`Password salah. Percobaan ${attempts + 1}/5`)
      setPassword('')
    }
    setIsSubmitting(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #040812 0%, #0a1628 50%, #040812 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Animated background grid */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: `linear-gradient(rgba(0,163,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,163,255,0.03) 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
      }} />

      <div style={{
        width: '100%', maxWidth: '380px', padding: '0 20px',
        position: 'relative', zIndex: 1,
      }}>
        {/* Card */}
        <div style={{
          background: 'rgba(13, 17, 23, 0.9)',
          border: '1px solid rgba(0,163,255,0.2)',
          borderRadius: '16px',
          padding: '40px 32px',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,163,255,0.1), 0 20px 60px rgba(0,0,0,0.5)',
        }}>
          {/* Top accent line */}
          <div style={{
            position: 'absolute', top: 0, left: '15%', right: '15%',
            height: '2px',
            background: 'linear-gradient(90deg, transparent, #00a3ff, transparent)',
            borderRadius: '2px',
          }} />

          {/* Icon */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(0,163,255,0.1)',
              border: '1px solid rgba(0,163,255,0.3)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '16px',
            }}>
              <Shield size={28} color="#00a3ff" />
            </div>
            <h1 style={{
              color: '#e6edf3', fontSize: '20px', fontWeight: 700,
              margin: '0 0 4px',
            }}>Owner Control Panel</h1>
            <p style={{ color: '#6e7681', fontSize: '13px', margin: 0 }}>
              Akses terbatas — Maintory
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block', color: '#8b949e',
                fontSize: '12px', fontWeight: 600,
                marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                Owner Password
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '12px', top: '50%',
                  transform: 'translateY(-50%)', color: '#6e7681',
                }}>
                  <Lock size={16} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Masukkan owner password"
                  disabled={isSubmitting || attempts >= 5}
                  autoFocus
                  style={{
                    width: '100%', padding: '12px 44px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', color: '#e6edf3',
                    fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(0,163,255,0.5)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    color: '#6e7681', cursor: 'pointer', padding: 0,
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !password || attempts >= 5}
              style={{
                width: '100%', padding: '13px',
                background: attempts >= 5
                  ? 'rgba(255,50,50,0.15)'
                  : 'linear-gradient(135deg, #00a3ff, #0077cc)',
                border: 'none', borderRadius: '8px',
                color: '#fff', fontSize: '14px', fontWeight: 700,
                cursor: isSubmitting || !password || attempts >= 5 ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.7 : 1,
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              {isSubmitting ? (
                <>
                  <div style={{
                    width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  Memverifikasi...
                </>
              ) : attempts >= 5 ? (
                '🔒 Akses Diblokir'
              ) : (
                <>
                  <Shield size={16} />
                  Masuk ke Panel
                </>
              )}
            </button>
          </form>

          <p style={{
            textAlign: 'center', color: '#3d444d',
            fontSize: '11px', marginTop: '20px', marginBottom: 0,
          }}>
            URL ini bersifat rahasia. Jangan dibagikan.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: #3d444d; }
      `}</style>
    </div>
  )
}

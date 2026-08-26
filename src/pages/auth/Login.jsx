import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Lock, User, LogIn } from 'lucide-react'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { login, user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) navigate('/')
    const savedUsername = localStorage.getItem('maintory-saved-user')
    const savedPassword = localStorage.getItem('maintory-saved-pass')
    if (savedUsername && savedPassword) {
      setUsername(savedUsername)
      setPassword(savedPassword)
      setRememberMe(true)
    } else if (savedUsername) {
      setUsername(savedUsername)
      setRememberMe(true)
    }
  }, [user, navigate])

  const logSecurityEvent = async (username, status) => {
    try {
      const { supabase } = await import('../../lib/supabase')
      const ua = navigator.userAgent
      // Simple device detection
      const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua)
      const browser = /Chrome/i.test(ua) ? 'Chrome' : /Firefox/i.test(ua) ? 'Firefox' : /Safari/i.test(ua) ? 'Safari' : 'Other'
      const os = /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Mac/i.test(ua) ? 'macOS' : 'Linux'
      const deviceInfo = `${browser} on ${os} (${isMobile ? 'Mobile' : 'Desktop'})`

      await supabase.from('owner_security_logs').insert({
        username,
        status,
        ip_address: null, // Will be 'N/A' without edge function
        user_agent: ua,
        device_info: deviceInfo,
      })
    } catch (err) {
      // Silently fail - don't block login if logging fails
      console.warn('Security log failed:', err.message)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !password) {
      toast.error('Username dan password wajib diisi')
      return
    }
    setIsSubmitting(true)
    try {
      await login(username, password)
      if (rememberMe) {
        localStorage.setItem('maintory-saved-user', username)
        localStorage.setItem('maintory-saved-pass', password)
      } else {
        localStorage.removeItem('maintory-saved-user')
        localStorage.removeItem('maintory-saved-pass')
      }
      await logSecurityEvent(username, 'success')
      toast.success('Login berhasil')
      navigate('/')
    } catch (err) {
      await logSecurityEvent(username, 'failed')
      toast.error(err.message || 'Gagal login, periksa username dan password')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      {/* Dot grid background */}
      <div className="login-bg-grid" />

      {/* Login Card */}
      <div className="login-card">
        {/* Top accent line */}
        <div className="login-card-accent" />

        {/* Logo area */}
        <div className="login-logo-wrap">
          <div className="login-logo-icon" style={{ background: 'transparent', boxShadow: 'none', padding: '0' }}>
            <img src="/logo.png" alt="Maintory" style={{ width: '80px', height: '80px', objectFit: 'contain', borderRadius: '0', display: 'block', filter: 'drop-shadow(0 4px 12px rgba(0, 163, 255, 0.45))' }} />
          </div>
          <div>
            <h1 className="login-title">Maintory</h1>
            <p className="login-subtitle">Sistem Manajemen Dan Infra ISP</p>
          </div>
        </div>

        <div className="login-divider" />

        <p className="login-welcome">Silakan masuk untuk melanjutkan</p>

        <form onSubmit={handleSubmit} className="login-form">
          {/* Username */}
          <div className="login-field">
            <label className="login-label">Username</label>
            <div className="login-input-wrap">
              <span className="login-input-icon"><User size={16} /></span>
              <input
                type="text"
                className="login-input"
                placeholder="Masukkan username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                autoComplete="username"
              />
            </div>
          </div>

          {/* Password */}
          <div className="login-field">
            <label className="login-label">Password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon"><Lock size={16} /></span>
              <input
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                placeholder="Masukkan password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-eye-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Remember */}
          <label className="login-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={isSubmitting}
            />
            <span>Ingat Saya</span>
          </label>

          {/* Submit */}
          <button
            type="submit"
            className="login-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px', borderTopColor: '#000' }} />
            ) : (
              <>
                <LogIn size={18} />
                Masuk
              </>
            )}
          </button>
        </form>

        <p className="login-footer">Cabang Banyumas &bull; &copy; 2026 Maintory</p>
        <p className="login-footer-credit">Crafted by <span>Aldi</span></p>
      </div>
    </div>
  )
}

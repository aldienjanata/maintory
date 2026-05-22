import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Lock, User } from 'lucide-react'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const { login, user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      navigate('/')
    }
    // Load saved credentials
    const savedUsername = localStorage.getItem('maintory-saved-user')
    if (savedUsername) {
      setUsername(savedUsername)
      setRememberMe(true)
    }
  }, [user, navigate])

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
      } else {
        localStorage.removeItem('maintory-saved-user')
      }
      
      toast.success('Login berhasil')
      navigate('/')
    } catch (err) {
      toast.error(err.message || 'Gagal login, periksa username dan password')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="loading-screen">
      <div className="login-bg"></div>
      
      <div className="login-content">
        <div className="mascot-container">
          <div className="mascot-glow"></div>
          <img src="/mascot.png" alt="Maintory Mascot" className="mascot-img" />
        </div>
        
        <div className="card" style={{ width: '100%', maxWidth: '400px', margin: '0 20px', padding: '40px 30px', position: 'relative', zIndex: 10, background: 'rgba(30, 35, 45, 0.7)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
          
          <div className="flex-center" style={{ flexDirection: 'column', marginBottom: '30px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px', textAlign: 'center' }}>
              Welcome to <span style={{ color: 'var(--accent)' }}>Maintory</span>
            </h1>
            <p className="text-secondary" style={{ fontSize: '14px' }}>
              Cabang Banyumas
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div className="form-group">
              <label className="form-label">Username</label>
              <div className="form-input-icon">
                <span className="icon"><User size={18} /></span>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Masukkan username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isSubmitting}
                  style={{ background: 'rgba(0,0,0,0.2)' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="form-input-icon input-with-btn">
                <span className="icon"><Lock size={18} /></span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Masukkan password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  style={{ background: 'rgba(0,0,0,0.2)' }}
                />
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
              <input 
                type="checkbox" 
                id="remember" 
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isSubmitting}
                style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
              />
              <label htmlFor="remember" className="text-secondary" style={{ fontSize: '13.5px', cursor: 'pointer' }}>
                Ingat Saya
              </label>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary flex-center mt-2" 
              style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: 'bold', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0, 240, 255, 0.3)' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px', borderTopColor: '#000' }}></span>
              ) : 'Log In System'}
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}

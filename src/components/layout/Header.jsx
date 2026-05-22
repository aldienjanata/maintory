import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { Menu, Sun, Moon, LogOut } from 'lucide-react'

export default function Header({ onMenuClick }) {
  const { isDark, toggleTheme } = useTheme()
  const { profile, logout } = useAuth()
  
  // Get branch name from somewhere (could be context or setting)
  // For now we hardcode the default, ideally fetched from app_settings
  const branchName = 'Cabang Banyumas'

  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })

  return (
    <header className="header">
      <button 
        className="btn-icon d-md-none mobile-menu-btn" 
        onClick={onMenuClick}
      >
        <Menu size={20} />
      </button>

      <div className="header-title">
        <h2 style={{ fontSize: '16px', margin: 0 }}>Dashboard</h2>
        <p style={{ margin: 0 }}>{branchName}</p>
      </div>

      <div className="header-actions">
        <div className="header-datetime" style={{ display: window.innerWidth > 768 ? 'block' : 'none' }}>
          <div className="font-semibold">{dateStr}</div>
        </div>

        <button 
          className="btn-icon" 
          onClick={toggleTheme} 
          title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button 
          className="btn-icon text-danger" 
          onClick={logout} 
          title="Logout"
          style={{ border: 'none' }}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}

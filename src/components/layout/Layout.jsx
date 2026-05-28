import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const [isNavigating, setIsNavigating] = useState(false)
  
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen)
  
  useEffect(() => {
    setIsNavigating(true)
    const t = setTimeout(() => setIsNavigating(false), 600)
    return () => clearTimeout(t)
  }, [location.pathname])

  // Close sidebar when window resizes to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && sidebarOpen) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [sidebarOpen])

  return (
    <div className="app-layout">
      {isNavigating && <div className="page-progress-bar" />}
      
      {/* Mobile Overlay */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="main-content">
        <Header onMenuClick={toggleSidebar} />
        <main className="page-content" key={location.pathname}>
          <div className="page-transition-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

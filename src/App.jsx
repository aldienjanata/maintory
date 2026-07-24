import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/layout/Layout'

// Pages
import Login from './pages/auth/Login'
import Dashboard from './pages/dashboard/Dashboard'
import Maintenance from './pages/maintenance/Maintenance'
import StokGudang from './pages/inventory/StokGudang'
import SerialNumber from './pages/inventory/SerialNumber'
import Dropcore from './pages/inventory/Dropcore'
import BonBarang from './pages/dispatch/BonBarang'
import Pengeluaran from './pages/pengeluaran/Pengeluaran'
import Dismantle from './pages/dismantle/Dismantle'
import OntReplacement from './pages/ont/OntReplacement'
import ActivityLogs from './pages/activity/ActivityLogs'
import Settings from './pages/settings/Settings'
import LaporanPemasangan from './pages/laporan/LaporanPemasangan'

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()
  const [showRetry, setShowRetry] = useState(false)

  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => setShowRetry(true), 8000)
      return () => clearTimeout(t)
    } else {
      setShowRetry(false)
    }
  }, [loading])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p className="text-secondary mt-2">Memuat sesi...</p>
        {showRetry && (
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '10px' }}>
              Koneksi lambat atau sesi bermasalah.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'var(--accent)', color: '#0d1117',
                border: 'none', borderRadius: '8px',
                padding: '10px 24px', fontWeight: 700,
                fontSize: '14px', cursor: 'pointer',
              }}
            >
              🔄 Muat Ulang
            </button>
          </div>
        )}
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="maintenance" element={<Maintenance />} />
          <Route path="inventory/stok" element={<StokGudang />} />
          <Route path="inventory/sn" element={<SerialNumber />} />
          <Route path="inventory/dropcore" element={<Dropcore />} />
          <Route path="bon-barang" element={<BonBarang />} />
          <Route path="pengeluaran" element={<Pengeluaran />} />
          <Route path="dismantle" element={<Dismantle />} />
          <Route path="ont" element={<OntReplacement />} />
          <Route path="logs" element={<ActivityLogs />} />
          <Route path="settings" element={<Settings />} />
          <Route path="laporan-pemasangan" element={<LaporanPemasangan />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App

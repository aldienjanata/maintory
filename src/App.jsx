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
import Pengeluaran from './pages/pengeluaran/Pengeluaran'
import Dismantle from './pages/dismantle/Dismantle'
import OntReplacement from './pages/ont/OntReplacement'
import ActivityLogs from './pages/logs/ActivityLogs'
import Settings from './pages/settings/Settings'

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p className="text-secondary mt-2">Memuat sesi...</p>
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
          <Route path="pengeluaran" element={<Pengeluaran />} />
          <Route path="dismantle" element={<Dismantle />} />
          <Route path="ont" element={<OntReplacement />} />
          <Route path="logs" element={<ActivityLogs />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App

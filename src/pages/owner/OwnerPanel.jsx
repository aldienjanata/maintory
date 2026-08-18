import { useState } from 'react'
import { useOwnerAuth } from '../../contexts/OwnerAuthContext'
import WebMonitor from './tabs/WebMonitor'
import SecurityMonitor from './tabs/SecurityMonitor'
import DesignManager from './tabs/DesignManager'
import { Monitor, Shield, Palette, LogOut, Activity } from 'lucide-react'

const TABS = [
  { id: 'monitor', label: 'Web Monitor', icon: <Monitor size={16} /> },
  { id: 'security', label: 'Security', icon: <Shield size={16} /> },
  { id: 'design', label: 'Design & Tema', icon: <Palette size={16} /> },
]

export default function OwnerPanel() {
  const { ownerLogout } = useOwnerAuth()
  const [activeTab, setActiveTab] = useState('monitor')

  return (
    <div style={{
      minHeight: '100vh',
      background: '#040812',
      fontFamily: 'Inter, sans-serif',
      color: '#e6edf3',
    }}>
      {/* Top bar */}
      <div style={{
        height: '56px',
        background: 'rgba(13,17,23,0.95)',
        borderBottom: '1px solid rgba(0,163,255,0.15)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: '16px',
        position: 'sticky', top: 0, zIndex: 100,
        backdropFilter: 'blur(12px)',
      }}>
        {/* Logo area */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '24px' }}>
          <div style={{
            width: '32px', height: '32px',
            background: 'linear-gradient(135deg, #00a3ff20, #00a3ff40)',
            border: '1px solid rgba(0,163,255,0.3)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Activity size={16} color="#00a3ff" />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#e6edf3', lineHeight: 1 }}>Owner Panel</div>
            <div style={{ fontSize: '10px', color: '#6e7681', lineHeight: 1, marginTop: '2px' }}>Maintory Control Center</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '7px 16px',
                background: activeTab === tab.id ? 'rgba(0,163,255,0.12)' : 'transparent',
                border: `1px solid ${activeTab === tab.id ? 'rgba(0,163,255,0.3)' : 'transparent'}`,
                borderRadius: '7px',
                color: activeTab === tab.id ? '#00a3ff' : '#8b949e',
                fontSize: '13px', fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                transition: 'all 0.2s',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Logout */}
        <button
          onClick={ownerLogout}
          style={{
            padding: '7px 14px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '7px',
            color: '#ef4444', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <LogOut size={14} />
          Keluar
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '28px 28px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Page title */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#e6edf3', margin: '0 0 4px' }}>
            {TABS.find(t => t.id === activeTab)?.label}
          </h1>
          <p style={{ color: '#6e7681', fontSize: '13px', margin: 0 }}>
            {activeTab === 'monitor' && 'Statistik real-time dan aktivitas semua user'}
            {activeTab === 'security' && 'Log keamanan, percobaan login, dan deteksi ancaman'}
            {activeTab === 'design' && 'Atur desain, tema, font, dan warna untuk semua user secara realtime'}
          </p>
        </div>

        {/* Tab content */}
        {activeTab === 'monitor' && <WebMonitor />}
        {activeTab === 'security' && <SecurityMonitor />}
        {activeTab === 'design' && <DesignManager />}
      </div>
    </div>
  )
}

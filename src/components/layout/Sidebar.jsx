import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/permissions'
import { 
  LayoutDashboard, 
  Wrench, 
  Package, 
  Box, 
  Hash,
  Cable,
  Truck,
  ArrowDownToLine,
  RefreshCcw,
  History,
  Settings,
  ClipboardList,
  FileText,
  Image,
  Antenna,
  RefreshCw,
  ScanLine,
  Map,
  Server,
  ChevronDown,
  ChevronRight
} from 'lucide-react'

export default function Sidebar({ isOpen, onClose }) {
  const { profile } = useAuth()
  const role = profile?.role || 'teknisi' // fallback

  const navItems = [
    { label: 'Dashboard', path: '/', icon: <LayoutDashboard />, section: 'MAIN MENU', allowedRoles: ['superadmin', 'admin', 'teknisi'] },
    { label: 'Maintenance', path: '/maintenance', icon: <Wrench />, section: 'MAIN MENU', allowedRoles: ['superadmin', 'admin', 'teknisi'] },
    
    // Inventory section - combined in UI or separated
    { label: 'Stok Gudang', path: '/inventory/stok', icon: <Package />, section: 'INVENTORY', allowedRoles: ['superadmin', 'admin', 'teknisi', 'backbone'] },
    { label: 'Serial Number', path: '/inventory/sn', icon: <Hash />, section: 'INVENTORY', allowedRoles: ['superadmin', 'admin', 'teknisi'] },
    { label: 'Dropcore', path: '/inventory/dropcore', icon: <Cable />, section: 'INVENTORY', allowedRoles: ['superadmin', 'admin', 'teknisi', 'backbone'] },
    { label: 'Kabel ADSS', path: '/inventory/adss', icon: <Cable />, section: 'INVENTORY', allowedRoles: ['superadmin', 'admin', 'teknisi', 'backbone'] },
    
    { label: 'Bon Barang', path: '/bon-barang', icon: <ClipboardList />, section: 'OPERATIONS', allowedRoles: ['superadmin', 'admin', 'teknisi', 'backbone'] },
    { label: 'Pengeluaran', path: '/pengeluaran', icon: <Truck />, section: 'OPERATIONS', allowedRoles: ['superadmin', 'admin', 'teknisi'] },
    { label: 'Dismantle', path: '/dismantle', icon: <ArrowDownToLine />, section: 'OPERATIONS', allowedRoles: ['superadmin', 'admin', 'teknisi'] },
    { label: 'Pergantian ONT', path: '/ont', icon: <RefreshCcw />, section: 'OPERATIONS', allowedRoles: ['superadmin', 'admin', 'teknisi'] },
    { label: 'Laporan Pemasangan', path: '/laporan-pemasangan', icon: <FileText />, section: 'OPERATIONS', allowedRoles: ['superadmin', 'admin', 'teknisi'] },
    { label: 'Generate Banner', path: '/banner-maintenance', icon: <Image />, section: 'OPERATIONS', allowedRoles: ['superadmin', 'admin'] },
    { label: 'Scan Barcode', path: '/scanner', icon: <ScanLine />, section: 'OPERATIONS', allowedRoles: ['superadmin', 'admin', 'teknisi'] },
    
    { label: 'Peta Jaringan', path: '/jaringan/peta', icon: <Map />, section: 'JARINGAN FIBER OPTIK', allowedRoles: ['superadmin', 'admin', 'teknisi', 'backbone'] },
    { label: 'Data Tiang', path: '/jaringan/tiang', icon: <img src="/icon_tiang.png" alt="tiang" style={{ width: '18px', height: '18px', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.8 }} />, section: 'JARINGAN FIBER OPTIK', allowedRoles: ['superadmin', 'admin', 'teknisi', 'backbone'] },
    { label: 'Data ODP & ODC', path: '/jaringan/odp-odc', icon: <img src="/icon_odp.png" alt="odp/odc" style={{ width: '18px', height: '18px', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.8 }} />, section: 'JARINGAN FIBER OPTIK', allowedRoles: ['superadmin', 'admin', 'teknisi', 'backbone'] },
    { label: 'Coilan', path: '/jaringan/coilan', icon: <img src="/icon_coilan.png" alt="coilan" style={{ width: '18px', height: '18px', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.8 }} />, section: 'JARINGAN FIBER OPTIK', allowedRoles: ['superadmin', 'admin', 'teknisi', 'backbone'] },
    { label: 'Kaset FO', path: '/jaringan/kaset-fo', icon: <img src="/icon_kaset_fo.png" alt="kaset fo" style={{ width: '18px', height: '18px', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.8 }} />, section: 'JARINGAN FIBER OPTIK', allowedRoles: ['superadmin', 'admin', 'teknisi', 'backbone'] },
    { label: 'Server', path: '/jaringan/server', icon: <Server size={18} />, section: 'JARINGAN FIBER OPTIK', allowedRoles: ['superadmin', 'admin', 'teknisi', 'backbone'] },
    { label: 'Closure', path: '/jaringan/closure', icon: <img src="/icon_closure.png" alt="closure" style={{ width: '18px', height: '18px', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.8 }} />, section: 'JARINGAN FIBER OPTIK', allowedRoles: ['superadmin', 'admin', 'teknisi', 'backbone'] },
    { label: 'Jalur FO', path: '/jaringan/jalur-fo', icon: <Cable size={18} />, section: 'JARINGAN FIBER OPTIK', allowedRoles: ['superadmin', 'admin', 'teknisi', 'backbone'] },
    { label: 'Konversi Data Jaringan FO', path: '/jaringan/konversi', icon: <RefreshCw />, section: 'JARINGAN FIBER OPTIK', allowedRoles: ['superadmin', 'admin', 'teknisi', 'backbone'] },
    
    { label: 'Log Aktivitas', path: '/logs', icon: <History />, section: 'SYSTEM', allowedRoles: ['superadmin', 'admin', 'teknisi'] },
    { label: 'Pengaturan', path: '/settings', icon: <Settings />, section: 'SYSTEM', allowedRoles: ['superadmin', 'admin', 'teknisi'] },
  ]

  // Filter based on basic permissions logic (visibility)
  // Usually, all can see the menu but actions inside are restricted
  // Exception: Maybe some things are completely hidden from Teknisi, but based on docs, Teknisi can View almost everything.
  // Superadmin/Admin see all.

  // Retrieve initial state from localStorage if available, otherwise default to MAIN MENU open
  const [openSections, setOpenSections] = useState(() => {
    const saved = localStorage.getItem('sidebar_open_sections');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return {
      'MAIN MENU': true,
      'INVENTORY': false,
      'OPERATIONS': false,
      'JARINGAN FIBER OPTIK': false,
      'SYSTEM': false
    };
  });

  const toggleSection = (sectionName) => {
    setOpenSections(prev => {
      const newState = { ...prev, [sectionName]: !prev[sectionName] };
      localStorage.setItem('sidebar_open_sections', JSON.stringify(newState));
      return newState;
    });
  };

  const renderNavSection = (sectionName) => {
    const items = navItems.filter(item => item.section === sectionName && (!item.allowedRoles || item.allowedRoles.includes(role)))
    if (items.length === 0) return null
    
    const isOpen = openSections[sectionName];

    return (
      <div key={sectionName}>
        <div 
          className="nav-section-label" 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => toggleSection(sectionName)}
        >
          {sectionName}
          {isOpen ? <ChevronDown size={14} style={{ opacity: 0.5 }} /> : <ChevronRight size={14} style={{ opacity: 0.5 }} />}
        </div>
        {isOpen && items.map(item => (
          <NavLink 
            key={item.path} 
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={onClose}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    )
  }

  const [branchName, setBranchName] = useState('Cabang Banyumas')

  useEffect(() => {
    // Fetch branch name from settings
    import('../../lib/supabase').then(({ supabase }) => {
      supabase.from('app_settings').select('branch_name').single()
        .then(({ data }) => {
          if (data?.branch_name) setBranchName(data.branch_name)
        })
    })
  }, [])

  return (
    <aside className={`sidebar ${isOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-logo">
        <img src="/logo.png" alt="Maintory Logo" />
        <div className="sidebar-logo-text">
          <h1>Maintory</h1>
          <span>{branchName}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {renderNavSection('MAIN MENU')}
        {renderNavSection('INVENTORY')}
        {renderNavSection('OPERATIONS')}
        {renderNavSection('JARINGAN FIBER OPTIK')}
        {renderNavSection('SYSTEM')}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-avatar">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.full_name} />
          ) : (
            profile?.full_name?.charAt(0)?.toUpperCase() || 'U'
          )}
        </div>
        <div className="sidebar-user-info">
          <div className="name">{profile?.full_name || 'User'}</div>
          <div className="role text-accent">{role}</div>
        </div>
      </div>
    </aside>
  )
}

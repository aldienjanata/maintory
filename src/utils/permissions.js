// Role-based access control utilities

export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  TEKNISI: 'teknisi',
}

export const can = (role, action) => {
  const permissions = {
    // Maintenance
    'maintenance.input': ['superadmin', 'admin'],
    'maintenance.edit': ['superadmin', 'admin'],
    'maintenance.delete': ['superadmin', 'admin'],
    'maintenance.view': ['superadmin', 'admin', 'teknisi'],
    'maintenance.close': ['superadmin', 'admin', 'teknisi'],
    'maintenance.export': ['superadmin', 'admin'],

    // Inventory - Stok Gudang
    'inventory.stok.view': ['superadmin', 'admin', 'teknisi'],
    'inventory.stok.manage': ['superadmin'],
    'inventory.stok.export': ['superadmin', 'admin'],
    'inventory.stok.import': ['superadmin'],

    // Inventory - Serial Number
    'inventory.sn.view': ['superadmin', 'admin', 'teknisi'],
    'inventory.sn.add': ['superadmin', 'admin'],
    'inventory.sn.edit': ['superadmin', 'admin'],
    'inventory.sn.delete': ['superadmin'],
    'inventory.sn.import': ['superadmin', 'admin'],
    'inventory.sn.export': ['superadmin', 'admin'],

    // Inventory - Dropcore
    'inventory.dropcore.view': ['superadmin', 'admin', 'teknisi'],
    'inventory.dropcore.add': ['superadmin', 'admin', 'teknisi'],
    'inventory.dropcore.edit': ['superadmin', 'admin'],
    'inventory.dropcore.delete': ['superadmin', 'admin'],

    // Pengeluaran
    'pengeluaran.jadwal.create': ['superadmin', 'admin'],
    'pengeluaran.jadwal.edit': ['superadmin', 'admin'],
    'pengeluaran.jadwal.delete': ['superadmin', 'admin'],
    'pengeluaran.input': ['superadmin', 'admin', 'teknisi'],
    'pengeluaran.edit': ['superadmin', 'admin'],
    'pengeluaran.delete': ['superadmin'],
    'pengeluaran.view': ['superadmin', 'admin', 'teknisi'],
    'pengeluaran.export': ['superadmin', 'admin'],

    // Dismantle
    'dismantle.input': ['superadmin', 'admin'],
    'dismantle.edit': ['superadmin', 'admin'],
    'dismantle.delete': ['superadmin', 'admin'],
    'dismantle.view': ['superadmin', 'admin', 'teknisi'],
    'dismantle.close': ['superadmin', 'admin', 'teknisi'],
    'dismantle.import': ['superadmin', 'admin'],
    'dismantle.export': ['superadmin', 'admin'],

    // ONT Replacement
    'ont.input': ['superadmin', 'admin', 'teknisi'],
    'ont.edit': ['superadmin', 'admin'],
    'ont.delete': ['superadmin', 'admin'],
    'ont.view': ['superadmin', 'admin', 'teknisi'],

    // Log Aktivitas
    'log.view.all': ['superadmin', 'admin'],
    'log.view.own': ['superadmin', 'admin', 'teknisi'],
    'log.delete': ['superadmin'],
    'log.export': ['superadmin', 'admin'],

    // Settings
    'settings.password': ['superadmin', 'admin', 'teknisi'],
    'settings.avatar': ['superadmin', 'admin', 'teknisi'],
    'settings.branch': ['superadmin'],
    'settings.users': ['superadmin'],
    'settings.notif': ['superadmin', 'admin', 'teknisi'],
  }

  return permissions[action]?.includes(role) ?? false
}

export const isAdmin = (role) => ['superadmin', 'admin'].includes(role)
export const isSuperadmin = (role) => role === 'superadmin'
export const isTeknisi = (role) => role === 'teknisi'

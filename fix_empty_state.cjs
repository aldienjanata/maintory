const fs = require('fs');
const path = require('path');

const files = [
    'src/pages/activity/ActivityLogs.jsx',
    'src/pages/dismantle/Dismantle.jsx',
    'src/pages/dispatch/BonBarang.jsx',
    'src/pages/jaringan/DataClosure.jsx',
    'src/pages/jaringan/DataCoilan.jsx',
    'src/pages/jaringan/DataKasetFo.jsx',
    'src/pages/jaringan/DataOdpOdc.jsx',
    'src/pages/jaringan/DataServer.jsx',
    'src/pages/jaringan/DataTiang.jsx',
    'src/pages/maintenance/Maintenance.jsx',
    'src/pages/owner/tabs/SecurityMonitor.jsx',
    'src/pages/settings/Settings.jsx'
];

for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // 1. Fix Empty State height
    // Find the array name used for checking empty state, usually filtered.length === 0 or items.length === 0
    let match = content.match(/!\w+\s*&&\s*(\w+)\.length === 0/);
    if (!match) match = content.match(/(\w+)\.length === 0 \? \(/);
    
    let arrayName = match ? match[1] : 'filtered';
    let loadingVar = 'loading';
    if (content.includes('isLoading')) loadingVar = 'isLoading';

    // Replace card div
    content = content.replace(/<div className="card" style={{ overflow: 'hidden' }}>/, 
        `<div className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: (!${loadingVar} && ${arrayName}.length === 0) ? 'calc(100vh - 280px)' : 'auto' }}>`);

    // Replace padding empty state to flex centered
    content = content.replace(/<div style={{ padding: '40px', textAlign: 'center', color: 'var\(--text-secondary\)' }}>(Tidak ada data[^<]*)</g, 
        `<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', color: 'var(--text-secondary)' }}>$1<`);
    
    content = content.replace(/<div style={{ padding: '40px', textAlign: 'center', color: 'var\(--text-secondary\)' }}>(Belum ada data[^<]*)</g, 
        `<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', color: 'var(--text-secondary)' }}>$1<`);

    if (content !== original) {
        fs.writeFileSync(file, content);
        console.log('Fixed empty state in ' + file);
    }
}

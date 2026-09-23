const fs = require('fs');

const files = [
    'src/pages/activity/ActivityLogs.jsx',
    'src/pages/dismantle/Dismantle.jsx',
    'src/pages/dispatch/BonBarang.jsx',
    'src/pages/maintenance/Maintenance.jsx',
    'src/pages/owner/tabs/SecurityMonitor.jsx',
    'src/pages/settings/Settings.jsx'
];

for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Add minHeight to empty-state divs
    content = content.replace(/className="empty-state"/g, 'className="empty-state" style={{ minHeight: \'calc(100vh - 280px)\', display: \'flex\', flexDirection: \'column\', justifyContent: \'center\' }}');

    if (content !== original) {
        fs.writeFileSync(file, content);
        console.log('Fixed empty state in ' + file);
    }
}

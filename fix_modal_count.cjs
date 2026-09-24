const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

const oldModalSection = `              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Dari Tanggal Pertama Scan</label>
                    <input type="date" className="form-input" value={bulkEditDateFrom} onChange={e => setBulkEditDateFrom(e.target.value)} style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Sampai Tanggal</label>
                    <input type="date" className="form-input" value={bulkEditDateTo} onChange={e => setBulkEditDateTo(e.target.value)} style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }} />
                  </div>
                </div>
              )}`;

const newModalSection = `              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Dari Tanggal Pertama Scan</label>
                      <input type="date" className="form-input" value={bulkEditDateFrom} onChange={e => setBulkEditDateFrom(e.target.value)} style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Sampai Tanggal</label>
                      <input type="date" className="form-input" value={bulkEditDateTo} onChange={e => setBulkEditDateTo(e.target.value)} style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }} />
                    </div>
                  </div>
                  {bulkEditDateFrom && (
                    <div style={{ padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <span>Terdapat <strong style={{ color: 'var(--accent)' }}>{scans.filter(s => s.first_scan >= bulkEditDateFrom + 'T00:00:00' && (!bulkEditDateTo || s.first_scan <= bulkEditDateTo + 'T23:59:59')).length}</strong> data pada rentang tanggal tersebut yang akan diupdate.</span>
                    </div>
                  )}
                </div>
              )}`;

if (content.includes(oldModalSection)) {
  content = content.replace(oldModalSection, newModalSection);
  console.log("Replaced using exact match");
} else {
  const oldModalSectionLF = oldModalSection.replace(/\r\n/g, '\n');
  if (content.includes(oldModalSectionLF)) {
    content = content.replace(oldModalSectionLF, newModalSection.replace(/\r\n/g, '\n'));
    console.log("Replaced using LF match");
  } else {
    console.log("Not found!");
  }
}

// Also update the 'Data Dipilih' to say "Terdapat X data"
const oldSelected = `<span><strong style={{ color: 'var(--accent)' }}>{selected.size}</strong> data akan diupdate catatannya.</span>}`;
const newSelected = `<span>Terdapat <strong style={{ color: 'var(--accent)' }}>{selected.size}</strong> data yang dipilih dan akan diupdate.</span>}`;
content = content.replace(oldSelected, newSelected);

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);

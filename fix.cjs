const fs = require('fs');
const lines = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8').split('\n');

const newLines = `                    {editingCamScanId === item.id ? (
                      <div style={{ display: 'flex', width: '100%', gap: '8px', alignItems: 'center' }}>
                        <input
                          autoFocus
                          value={editingCamScanValue}
                          onChange={e => setEditingCamScanValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSaveCamEdit(item)}
                          style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--accent)', background: 'transparent', color: '#fff', fontSize: '13px', fontFamily: 'monospace', minWidth: 0 }}
                        />
                        <button onClick={() => handleSaveCamEdit(item)} style={{ background: 'var(--accent)', border: 'none', color: '#000', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', flexShrink: 0 }}><Check size={14} /></button>
                        <button onClick={() => setEditingCamScanId(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', flexShrink: 0 }}><X size={14} /></button>
                      </div>
                    ) : (
                      <>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                          {item.status === 'saving' && <Loader size={14} className="spinner" style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                          {item.status === 'success' && <Check size={14} style={{ color: '#22c55e', flexShrink: 0 }} />}
                          {item.status === 'error' && <AlertTriangle size={14} style={{ color: '#f87171', flexShrink: 0 }} />}
                          <div style={{ color: item.status === 'error' ? '#f87171' : '#fff', fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.barcode}</div>
                        </div>
                        {item.status !== 'saving' && (
                          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                            <button onClick={() => { setEditingCamScanId(item.id); setEditingCamScanValue(item.barcode); }} style={{ background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Edit2 size={15} />
                            </button>
                            <button onClick={() => handleDeleteCamScan(item.barcode)} style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </>
                    )}`.split('\n');

lines.splice(920, 11, ...newLines);
fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', lines.join('\n'));
console.log('Replaced by line number');

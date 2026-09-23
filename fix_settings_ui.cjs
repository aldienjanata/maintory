const fs = require('fs');
let file = 'src/pages/settings/Settings.jsx';
let content = fs.readFileSync(file, 'utf8');

let ui = `
                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', flexWrap: 'wrap', gap: '8px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Menampilkan {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, users.length)}–{Math.min(currentPage * ITEMS_PER_PAGE, users.length)} dari {users.length} data
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>‹ Prev</button>
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        const start = Math.max(1, currentPage - 2)
                        const page = start + i
                        if (page > totalPages) return null
                        return (
                          <button key={page} className={\`btn btn-sm \${currentPage === page ? 'btn-primary' : 'btn-secondary'}\`} onClick={() => setCurrentPage(page)}>{page}</button>
                        )
                      })}
                      <button className="btn btn-secondary btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next ›</button>
                    </div>
                  </div>
                )}
`;

content = content.replace(/<\/div>\s*<\/>\s*\)\s*}\s*<\/div>\s*<\/div>/, `</div>\n              </>\n            )}\n${ui}\n          </div>\n        </div>`);

fs.writeFileSync(file, content);
console.log('Appended UI to Settings.jsx');

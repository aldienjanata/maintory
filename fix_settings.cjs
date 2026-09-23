const fs = require('fs');
let file = 'src/pages/settings/Settings.jsx';
let content = fs.readFileSync(file, 'utf8');

// Add state
if (!content.includes('ITEMS_PER_PAGE = 20')) {
    content = content.replace(/(const \[loading, setLoading\] = useState\(true\))/, `$1\n  const ITEMS_PER_PAGE = 20\n  const [currentPage, setCurrentPage] = useState(1)`);
}

// Add computed
if (!content.includes('const paginated = users.slice')) {
    content = content.replace(/(return \()/, `const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE)\n  const paginated = users.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)\n\n  $1`);
}

content = content.replace(/users\.map/g, 'paginated.map');

// Add UI
if (!content.includes('Menampilkan {Math.min')) {
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
    // Insert after mobile-card-list
    content = content.replace(/(<\/div>\s*<\/div>\s*<\/div>\s*)}/, `</div>\n${ui}\n          </div>\n          </div>\n        )}`);
}

fs.writeFileSync(file, content);
console.log('Fixed Settings.jsx');

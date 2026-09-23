const fs = require('fs');

function addPagination(file, arrayName) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Check if already has pagination
    if (content.includes('ITEMS_PER_PAGE')) {
        console.log(file + ' already has pagination state.');
        // Let's remove the incomplete one in SecurityMonitor
        if (file.includes('SecurityMonitor')) {
             content = content.replace(/const ITEMS_PER_PAGE = 20\s*const \[currentPage, setCurrentPage\] = useState\(1\)/, '');
             content = content.replace(/const totalPages = Math\.ceil\(logs\.length \/ ITEMS_PER_PAGE\)\s*const paginated = logs\.slice\(\(currentPage - 1\) \* ITEMS_PER_PAGE, currentPage \* ITEMS_PER_PAGE\)/, '');
        } else {
             return; // Leave others alone
        }
    }

    // Add state imports if needed, assuming useState is there
    // Add constants
    content = content.replace(/(const \[loading, setLoading\] = useState\(.*?\))/, `$1\n  const ITEMS_PER_PAGE = 20\n  const [currentPage, setCurrentPage] = useState(1)`);
    
    // Add computed paginated
    // Usually right before return
    content = content.replace(/(return \()/, `const totalPages = Math.ceil(${arrayName}.length / ITEMS_PER_PAGE)\n  const paginated = ${arrayName}.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)\n\n  $1`);

    // Change map
    content = content.replace(new RegExp(`${arrayName}\\.map\\(`, 'g'), `paginated.map(`);

    // Add UI after table
    let ui = `
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', flexWrap: 'wrap', gap: '8px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Menampilkan {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, ${arrayName}.length)}–{Math.min(currentPage * ITEMS_PER_PAGE, ${arrayName}.length)} dari {${arrayName}.length} data
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
    // Find the end of table
    content = content.replace(/<\/table>\s*<\/div>\s*<\/div>/, `</table>\n          </div>\n${ui}\n        </div>`);
    // Fallback if structure is slightly different
    if (content === original) {
        content = content.replace(/<\/table>\s*<\/div>\s*\)\s*}/, `</table>\n          </div>\n${ui}\n        )}`);
    }
    // Specific for SecurityMonitor which uses </table>\n      </div>
    if (file.includes('SecurityMonitor')) {
        content = content.replace(/<\/table>\s*<\/div>\s*<\/div>/, `</table>\n          </div>\n${ui}\n      </div>`);
    }

    if (content !== original) {
        fs.writeFileSync(file, content);
        console.log('Added pagination to ' + file);
    } else {
        console.log('Failed to add pagination UI for ' + file);
    }
}

addPagination('src/pages/maintenance/Maintenance.jsx', 'filtered');
addPagination('src/pages/owner/tabs/SecurityMonitor.jsx', 'logs');
addPagination('src/pages/settings/Settings.jsx', 'filteredUsers');


const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// 1. Add states
const statesSearch = "const [filterLastTo, setFilterLastTo] = useState('')";
const statesReplace = "const [filterLastTo, setFilterLastTo] = useState('')\n  const [kondisiFilter, setKondisiFilter] = useState('all')\n  const [scannerFilter, setScannerFilter] = useState('all')";
content = content.replace(statesSearch, statesReplace);

// 2. Update hasFilter
const hasFilterSearch = "const hasFilter = searchTerm || categoryFilter !== 'all' || filterFirstFrom || filterFirstTo || filterLastFrom || filterLastTo";
const hasFilterReplace = "const hasFilter = searchTerm || categoryFilter !== 'all' || filterFirstFrom || filterFirstTo || filterLastFrom || filterLastTo || kondisiFilter !== 'all' || scannerFilter !== 'all'";
content = content.replace(hasFilterSearch, hasFilterReplace);

// 3. Update resetFilters
const resetFiltersSearch = "const resetFilters = () => { setSearchTerm(''); setCategoryFilter('all'); setFilterFirstFrom(''); setFilterFirstTo(''); setFilterLastFrom(''); setFilterLastTo(''); setCurrentPage(1) }";
const resetFiltersReplace = "const resetFilters = () => { setSearchTerm(''); setCategoryFilter('all'); setFilterFirstFrom(''); setFilterFirstTo(''); setFilterLastFrom(''); setFilterLastTo(''); setKondisiFilter('all'); setScannerFilter('all'); setCurrentPage(1) }";
content = content.replace(resetFiltersSearch, resetFiltersReplace);

// 4. Update pagination useEffect
const pageEffectSearch = "useEffect(() => { setCurrentPage(1) }, [searchTerm, categoryFilter, filterFirstFrom, filterFirstTo, filterLastFrom, filterLastTo, PAGE_SIZE])";
const pageEffectReplace = "useEffect(() => { setCurrentPage(1) }, [searchTerm, categoryFilter, filterFirstFrom, filterFirstTo, filterLastFrom, filterLastTo, kondisiFilter, scannerFilter, PAGE_SIZE])";
content = content.replace(pageEffectSearch, pageEffectReplace);

// 5. Update filtering logic
const filterLogicSearch = "if (filterLastTo && s.last_scan > filterLastTo + 'T23:59:59') return false\r\n    return true";
const filterLogicReplace = "if (filterLastTo && s.last_scan > filterLastTo + 'T23:59:59') return false\n    if (kondisiFilter !== 'all' && s.ont_kondisi !== kondisiFilter) return false\n    if (scannerFilter !== 'all' && (s.updated_by || s.scanned_by) !== scannerFilter) return false\n    return true";
content = content.replace(filterLogicSearch, filterLogicReplace);
if (content.indexOf(filterLogicReplace) === -1) {
    // Try LF if CRLF failed
    const filterLogicSearchLF = "if (filterLastTo && s.last_scan > filterLastTo + 'T23:59:59') return false\n    return true";
    content = content.replace(filterLogicSearchLF, filterLogicReplace);
}

// 6. Update UI
const uiSearch = `              <div style={{ marginTop: '10px', padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'end' }}>
                <div><label style={{fontSize:'11px', color:'var(--text-muted)', display:'block', marginBottom:'4px'}}>Kategori</label><select className="form-input" style={{width:'100%', padding:'6px 10px', fontSize:'13px'}} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="all">Semua</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label style={{fontSize:'11px', color:'var(--text-muted)', display:'block', marginBottom:'4px'}}>Tgl Pertama (Dari)</label><input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: '13px', width: '100%' }} value={filterFirstFrom} onChange={e => setFilterFirstFrom(e.target.value)} /></div>
                <div><label style={{fontSize:'11px', color:'var(--text-muted)', display:'block', marginBottom:'4px'}}>Tgl Pertama (Sampai)</label><input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: '13px', width: '100%' }} value={filterFirstTo} onChange={e => setFilterFirstTo(e.target.value)} /></div>
              </div>`;
const uiReplace = `              <div style={{ marginTop: '10px', padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'end' }}>
                <div><label style={{fontSize:'11px', color:'var(--text-muted)', display:'block', marginBottom:'4px'}}>Kategori</label><select className="form-input" style={{width:'100%', padding:'6px 10px', fontSize:'13px'}} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="all">Semua</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label style={{fontSize:'11px', color:'var(--text-muted)', display:'block', marginBottom:'4px'}}>Kondisi (ONT)</label><select className="form-input" style={{width:'100%', padding:'6px 10px', fontSize:'13px'}} value={kondisiFilter} onChange={e => setKondisiFilter(e.target.value)}><option value="all">Semua</option><option value="Aman">Aman</option><option value="Rusak">Rusak</option></select></div>
                <div><label style={{fontSize:'11px', color:'var(--text-muted)', display:'block', marginBottom:'4px'}}>Scan Oleh</label><select className="form-input" style={{width:'100%', padding:'6px 10px', fontSize:'13px'}} value={scannerFilter} onChange={e => setScannerFilter(e.target.value)}><option value="all">Semua Akun</option>{Object.entries(users).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
                <div><label style={{fontSize:'11px', color:'var(--text-muted)', display:'block', marginBottom:'4px'}}>Tgl Pertama (Dari)</label><input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: '13px', width: '100%' }} value={filterFirstFrom} onChange={e => setFilterFirstFrom(e.target.value)} /></div>
                <div><label style={{fontSize:'11px', color:'var(--text-muted)', display:'block', marginBottom:'4px'}}>Tgl Pertama (Sampai)</label><input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: '13px', width: '100%' }} value={filterFirstTo} onChange={e => setFilterFirstTo(e.target.value)} /></div>
              </div>`;

// Replace using normal LF if exact string match fails
let finalContent = content;
if (finalContent.includes(uiSearch)) {
  finalContent = finalContent.replace(uiSearch, uiReplace);
} else {
  // Regex approach for UI block since indentation/line endings might differ
  const regexUi = /<div style=\{\{ marginTop: '10px', padding: '12px'.*?<\/div>\r?\n\s*<\/div>/s;
  finalContent = finalContent.replace(regexUi, uiReplace);
}

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', finalContent);
console.log('Filters updated!');

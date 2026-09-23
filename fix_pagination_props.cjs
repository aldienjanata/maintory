const fs = require('fs');

const files = [
    'src/pages/jaringan/DataJalurFo.jsx',
    'src/pages/jaringan/DataClosure.jsx',
    'src/pages/jaringan/DataCoilan.jsx',
    'src/pages/jaringan/DataKasetFo.jsx',
    'src/pages/jaringan/DataServer.jsx',
];

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let orig = content;
    
    // Fix the wrong Pagination props pattern
    // Pattern: <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    content = content.replace(
        /<Pagination page=\{page\} totalPages=\{totalPages\} onPageChange=\{setPage\} \/>/g,
        '<Pagination page={page} setPage={setPage} perPage={perPage} setPerPage={setPerPage} totalItems={filtered.length} />'
    );
    
    // Also remove the {totalPages > 1 && ( wrapper since Pagination handles its own visibility
    content = content.replace(
        /\{totalPages > 1 && \(\s*<Pagination page=\{page\} setPage=\{setPage\} perPage=\{perPage\} setPerPage=\{setPerPage\} totalItems=\{filtered\.length\} \/>\s*\)\}/g,
        '<Pagination page={page} setPage={setPage} perPage={perPage} setPerPage={setPerPage} totalItems={filtered.length} />'
    );
    
    if (content !== orig) {
        fs.writeFileSync(file, content);
        console.log('Fixed Pagination props in ' + file);
    } else {
        console.log('No change in ' + file);
    }
}

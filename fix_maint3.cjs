const fs = require('fs');
let file = 'src/pages/maintenance/Maintenance.jsx';
let content = fs.readFileSync(file, 'utf8');

// Insert totalPages and paginated just before const handleExport
if (!content.includes('const paginated = filteredTickets.slice')) {
    content = content.replace(
        '  const handleExport = async (range) => {',
        '  const totalPages = Math.ceil(filteredTickets.length / ITEMS_PER_PAGE)\n  const paginated = filteredTickets.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)\n\n  const handleExport = async (range) => {'
    );
    console.log('Added paginated properly.');
} else {
    console.log('Already has paginated.');
}

fs.writeFileSync(file, content);

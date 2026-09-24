const fs = require('fs');
let file = 'src/pages/maintenance/Maintenance.jsx';
let content = fs.readFileSync(file, 'utf8');

// Remove the misplaced lines from inside useEffect
content = content.replace(
    "    const totalPages = Math.ceil(filteredTickets.length / ITEMS_PER_PAGE)\n  const paginated = filteredTickets.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)\n\n  return () => {",
    "    return () => {"
);

// Check result
const hasInsideEffect = content.includes("const totalPages = Math.ceil(filteredTickets.length / ITEMS_PER_PAGE)\n  const paginated");
console.log('Still has misplaced code:', hasInsideEffect);

// Now insert after filteredTickets definition (after the .sort() closing paren)
// Find filteredTickets end and add paginated/totalPages after
if (!content.includes('const totalPages = Math.ceil(filteredTickets.length / ITEMS_PER_PAGE)')) {
    content = content.replace(
        '// --- EXPORT ---',
        'const totalPages = Math.ceil(filteredTickets.length / ITEMS_PER_PAGE)\n  const paginated = filteredTickets.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)\n\n  // --- EXPORT ---'
    );
    console.log('Added paginated after filteredTickets');
}

fs.writeFileSync(file, content);
console.log('Done.');

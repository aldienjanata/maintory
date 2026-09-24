const fs = require('fs');
let file = 'src/components/common/Pagination.jsx';
let content = fs.readFileSync(file, 'utf8');

// The active page button inline style is:
// style={{ padding: '4px 10px', borderRadius: '6px', background: page === i ? 'var(--accent-dim)' : 'transparent', color: page === i ? 'var(--accent)' : 'inherit', fontWeight: page === i ? '600' : 'normal' }}
// We will replace `padding: '4px 10px'` with `minWidth: '28px', height: '28px', padding: '0 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'`

content = content.replace(
    "padding: '4px 10px'",
    "minWidth: '28px', height: '28px', padding: '0 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'"
);

// We should also replace the `...` span spacing if any
// Also the `1` and `totalPages` buttons if they are hardcoded
content = content.replace(
    /style=\{\{\s*padding: '4px 10px',\s*borderRadius: '6px'\s*\}\}/g,
    "style={{ minWidth: '28px', height: '28px', padding: '0 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}"
);

// Also the prev/next buttons have `padding: '4px 6px'`
content = content.replace(
    /style=\{\{\s*padding: '4px 6px',\s*borderRadius: '6px'\s*\}\}/g,
    "style={{ width: '28px', height: '28px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}"
);

fs.writeFileSync(file, content);
console.log('Fixed Pagination UI styling');

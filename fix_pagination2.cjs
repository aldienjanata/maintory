const fs = require('fs');
let file = 'src/components/common/Pagination.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    /padding:\s*'4px 10px'/g,
    "minWidth: '28px', height: '28px', padding: '0 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'"
);

fs.writeFileSync(file, content);
console.log('Fixed Pagination loop');

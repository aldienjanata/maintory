const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// The replacement script left an extra "return false }" inside the block before `} else {`
content = content.replace(
  /return false \}\r?\n    \} else \{/,
  "if (error) { toast.error('Gagal: ' + error.message); return false }\n    } else {"
);

content = content.replace(
  /return false \}\r?\n    \}\r?\n    return false/,
  "if (error) { toast.error('Gagal: ' + error.message); return false }\n    }\n    return false"
);

fs.writeFileSync('src/pages/scanner/BarcodeScanner.jsx', content);
console.log('Syntax error fixed.');

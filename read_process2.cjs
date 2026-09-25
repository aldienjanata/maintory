const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');
let idx = content.indexOf('const { data: existing, error: checkErr } = await supabase.from(\'barcode_scans\').select(\'id\').eq(\'barcode\', barcode).maybeSingle()');
let start = Math.max(0, idx - 100);
console.log(content.substring(start, idx + 2000));

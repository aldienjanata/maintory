const fs = require('fs');
let content = fs.readFileSync('src/pages/scanner/BarcodeScanner.jsx', 'utf8');

// Find exact edit button pattern
let editIdx = content.indexOf("scanner.edit') && <button className=\"btn-icon\" onClick={() => handleEdit(s)");
let start = Math.max(0, editIdx - 20);
console.log("Edit button context:", JSON.stringify(content.substring(start, editIdx + 200)));

// Find exact delete single pattern
let delIdx = content.indexOf("Hapus Data', `Hapus");
let delStart = Math.max(0, delIdx - 50);
console.log("\nDelete single context:", JSON.stringify(content.substring(delStart, delIdx + 300)));

// Find export buf pattern
let bufIdx = content.indexOf("const buf = await wb.xlsx.writeBuffer()");
let bufStart = Math.max(0, bufIdx - 100);
console.log("\nExport buf context:", JSON.stringify(content.substring(bufStart, bufIdx + 50)));

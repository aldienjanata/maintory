const fs = require('fs');
const tiang = fs.readFileSync('public/icon_tiang.png', 'base64');
const odp = fs.readFileSync('public/icon_odp.png', 'base64');
const odc = fs.readFileSync('public/icon_odc.png', 'base64');
const js = `export const TIANG_B64 = "data:image/png;base64,${tiang}";\nexport const ODP_B64 = "data:image/png;base64,${odp}";\nexport const ODC_B64 = "data:image/png;base64,${odc}";\n`;
fs.writeFileSync('src/pages/jaringan/iconsBase64.js', js);
console.log('Done');

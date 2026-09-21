const fs = require('fs');

const files = [
  'src/pages/jaringan/DataOdpOdc.jsx',
  'src/pages/jaringan/DataTiang.jsx',
  'src/pages/jaringan/DataCoilan.jsx',
  'src/pages/jaringan/DataKasetFo.jsx',
  'src/pages/jaringan/DataServer.jsx',
  'src/pages/jaringan/DataClosure.jsx',
  'src/pages/jaringan/DataJalurFo.jsx',
];

const OLD_SITES_3 = [
  "{ value: 'banyumas', label: 'Banyumas' },",
  "  { value: 'cilacap', label: 'Cilacap' },",
  "  { value: 'cilacap_herman', label: 'Cilacap (Herman)' },",
  "]"
].join('\n');

const NEW_SITES = [
  "{ value: 'banyumas', label: 'Site Banyumas' },",
  "  { value: 'cilacap', label: 'Site Cilacap' },",
  "  { value: 'cilacap_herman', label: 'Site Cilacap-Herman' },",
  "  { value: 'rowokele', label: 'Site Rowokele' },",
  "  { value: 'kebumen', label: 'Site Kebumen' },",
  "]"
].join('\n');

const OLD_CODE = "const SITE_CODE = { banyumas: 'BMS', cilacap: 'CLP', cilacap_herman: 'CLH' }";
const NEW_CODE = "const SITE_CODE = { banyumas: 'BMS', cilacap: 'CLP', cilacap_herman: 'CLH', rowokele: 'RWK', kebumen: 'KBM' }";

files.forEach(path => {
  let code = fs.readFileSync(path, 'utf8');
  const before = code;
  code = code.replace(OLD_SITES_3, NEW_SITES);
  code = code.replace(OLD_CODE, NEW_CODE);
  if (code === before) {
    console.log('WARN no change:', path);
    // Try to detect current SITES format
    const m = code.match(/const SITES = \[([\s\S]*?)\]/);
    if (m) console.log('  Current SITES block:', m[0].substring(0, 200));
  } else {
    fs.writeFileSync(path, code);
    console.log('Updated:', path);
  }
});

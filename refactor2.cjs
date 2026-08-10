
const fs = require('fs');
let code = fs.readFileSync('src/pages/jaringan/DataOdpOdc.jsx', 'utf8');

// Fix unquoted ODP/ODC if any
code = code.replace(/value: ODP/g, alue: 'ODP');
code = code.replace(/value: ODC/g, alue: 'ODC');
code = code.replace(/type: ODP/g, 	ype: 'ODP');

// Add new fields to EMPTY_FORM
code = code.replace(/type: 'ODP',/g, 	ype: 'ODP', pole_id: '', olt: '', divisi: '',);

// Change DEFAULT_FORMAT
code = code.replace(/const DEFAULT_FORMAT = 'NAT\/{SITE_CODE}\/POLE\/{DESA}\/{NO}'/, const DEFAULT_FORMAT = 'NAT/{SITE_CODE}/{DESA}/{TYPE} {NO}');

fs.writeFileSync('src/pages/jaringan/DataOdpOdc.jsx', code);


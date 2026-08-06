const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('src/assets/desa_pip.geojson', 'utf8'));
console.log('Fields:', Object.keys(raw.features[0].properties));
console.log('Sample:', raw.features[0].properties);

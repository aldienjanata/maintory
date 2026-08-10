
const fs = require('fs');
let code = fs.readFileSync('src/pages/jaringan/DataTiang.jsx', 'utf8');
code = code.replace(/DataTiang/g, 'DataOdpOdc');
code = code.replace(/network_poles/g, 'network_odp_odc');
code = code.replace(/pole_id/g, 'device_id');
code = code.replace(/generatePoleId/g, 'generateDeviceId');
code = code.replace(/Data Tiang/g, 'Data ODP & ODC');
code = code.replace(/'tiang_7m'/g, 'ODP');
code = code.replace(/'tiang_9m'/g, 'ODC');
code = code.replace(/Tiang 7 m/g, 'ODP');
code = code.replace(/Tiang 9 m/g, 'ODC');
code = code.replace(/pole_type/g, 'type');
code = code.replace(/icon_tiang\.png/g, 'icon_odp.png');
fs.writeFileSync('src/pages/jaringan/DataOdpOdc.jsx', code);


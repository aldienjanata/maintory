const fs = require('fs');

const replaceInsertWithUpsert = (file, tableName, idCol) => {
  let code = fs.readFileSync(file, 'utf8');
  
  const lines = code.split('\n');
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`from('${tableName}').insert`) && lines[i].includes('error } = await supabase')) {
       if (lines[i].includes('insert(payloads)')) {
         lines[i] = lines[i].replace('insert(payloads)', `upsert(payloads, { onConflict: '${idCol}' })`);
         changed = true;
       } else if (lines[i].includes('insert(chunk)')) {
         lines[i] = lines[i].replace('insert(chunk)', `upsert(chunk, { onConflict: '${idCol}' })`);
         changed = true;
       }
    }
  }
  if (changed) {
    fs.writeFileSync(file, lines.join('\n'));
    console.log('Fixed', file);
  }
}

replaceInsertWithUpsert('src/pages/jaringan/DataOdpOdc.jsx', 'network_odp_odc', 'device_id');
replaceInsertWithUpsert('src/pages/jaringan/DataCoilan.jsx', 'network_coilan', 'coilan_id');
replaceInsertWithUpsert('src/pages/jaringan/DataKasetFo.jsx', 'network_kaset_fo', 'kaset_id');
replaceInsertWithUpsert('src/pages/jaringan/DataServer.jsx', 'network_server', 'server_id');
replaceInsertWithUpsert('src/pages/jaringan/DataClosure.jsx', 'network_closure', 'closure_id');

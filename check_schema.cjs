require('dotenv').config();
const https = require('https');
const url = process.env.VITE_SUPABASE_URL + '/rest/v1/?apikey=' + process.env.VITE_SUPABASE_ANON_KEY;
https.get(url, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const spec = JSON.parse(body);
    const def = spec.definitions.network_poles;
    console.log(Object.keys(def.properties));
  });
});

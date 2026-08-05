const https = require('https');
https.get('https://maintory.vercel.app/jaringan/tiang', res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const match = body.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if(match) {
      https.get('https://maintory.vercel.app' + match[1], res2 => {
        let js = '';
        res2.on('data', chunk => js += chunk);
        res2.on('end', () => {
          console.log('Old string found:', js.includes('kemungkinan karena RLS'));
          console.log('New string found:', js.includes('Ulangi Hapus Semua'));
        });
      });
    } else {
        console.log('JS not found');
    }
  });
});

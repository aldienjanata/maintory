const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
  page.on('requestfailed', request =>
    console.error('REQUEST FAILED:', request.url(), request.failure().errorText)
  );

  console.log('Navigating to local dev server...');
  await page.goto('http://localhost:5173/jaringan/tiang', { waitUntil: 'networkidle2' });
  
  await browser.close();
})();

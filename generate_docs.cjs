const fs = require('fs');
const marked = require('marked');
const HTMLtoDOCX = require('html-to-docx');
const puppeteer = require('puppeteer');
const path = require('path');

const mdFile = 'C:\\Users\\acer\\.gemini\\antigravity\\brain\\9b3f5fa0-ea23-4a7b-a8ae-817e81d5bde3\\DOKUMENTASI_SISTEM_MAINTORY.md';
const docxFile = 'C:\\Users\\acer\\Downloads\\DOKUMENTASI_SISTEM_MAINTORY.docx';
const pdfFile = 'C:\\Users\\acer\\Downloads\\DOKUMENTASI_SISTEM_MAINTORY.pdf';

const mdContent = fs.readFileSync(mdFile, 'utf8');
const htmlContent = marked.parse(mdContent);

const htmlWrapper = `<!DOCTYPE html>
<html>
<head>
<meta charset='utf-8'>
<style>
  body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; color: #333; }
  h1, h2, h3 { color: #111; }
  h1 { font-size: 24px; border-bottom: 2px solid #ccc; padding-bottom: 5px; }
  h2 { font-size: 20px; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 30px; }
  table { border-collapse: collapse; width: 100%; margin: 20px 0; }
  table, th, td { border: 1px solid #ddd; }
  th, td { padding: 12px; text-align: left; }
  th { background-color: #f4f4f4; }
  code { background-color: #f8f8f8; padding: 2px 5px; border-radius: 4px; font-family: monospace; }
  pre { background-color: #f8f8f8; padding: 15px; border-radius: 5px; overflow-x: auto; }
</style>
</head>
<body>
${htmlContent}
</body>
</html>`;

async function generate() {
  try {
    // Generate DOCX
    const docxBuffer = await HTMLtoDOCX(htmlWrapper, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    });
    fs.writeFileSync(docxFile, docxBuffer);
    console.log('DOCX generated successfully at', docxFile);
  } catch (e) {
    console.error('Failed DOCX:', e);
  }

  try {
    // Generate PDF
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setContent(htmlWrapper, { waitUntil: 'networkidle0' });
    await page.pdf({ path: pdfFile, format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } });
    await browser.close();
    console.log('PDF generated successfully at', pdfFile);
  } catch (e) {
    console.error('Failed PDF:', e);
  }
}

generate();

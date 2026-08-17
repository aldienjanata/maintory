const sharp = require('sharp');
const fs = require('fs');

async function generateIcons() {
  try {
    const inputPath = 'public/logo.png';
    
    const sizes = [
      { size: 192, name: 'pwa-192x192.png' },
      { size: 512, name: 'pwa-512x512.png' },
    ];

    for (const { size, name } of sizes) {
      await sharp(inputPath)
        .resize(size, size, { fit: 'contain', background: { r: 13, g: 17, b: 35, alpha: 255 } })
        .png()
        .toFile(`public/${name}`);
      console.log(`Generated public/${name}`);
    }

    console.log('All icons generated!');
  } catch (err) {
    console.error('Error:', err);
  }
}

generateIcons();

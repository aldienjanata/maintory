const sharp = require('sharp');
const fs = require('fs');

async function cropLogo() {
  try {
    const inputPath = 'public/logo.png';
    const outputPath = 'public/logo_cropped.png';
    
    // Trim the transparent/white padding automatically
    await sharp(inputPath)
      .trim() 
      .toFile(outputPath);
      
    // Overwrite the original
    fs.copyFileSync(outputPath, inputPath);
    fs.unlinkSync(outputPath);
    console.log('Logo cropped successfully!');
  } catch (err) {
    console.error('Error cropping logo:', err);
  }
}

cropLogo();

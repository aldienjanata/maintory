const sharp = require('sharp');
const fs = require('fs');

async function cropLogo() {
  try {
    const inputPath = 'public/logo.png';
    const outputPath = 'public/logo_cropped.png';
    
    // Step 1: Trim the transparent/dark padding automatically, save to temp file
    const tempPath = 'public/logo_temp.png';
    await sharp(inputPath).trim().toFile(tempPath);
    
    // Step 2: Get metadata of trimmed image
    const meta = await sharp(tempPath).metadata();
    const { width, height } = meta;
    
    // Step 3: Make it square by using the larger dimension, centered
    const size = Math.max(width, height);
    const left = Math.floor((size - width) / 2);
    const top = Math.floor((size - height) / 2);
    
    // Step 4: Extend canvas to be square with transparent padding
    await sharp(tempPath)
      .extend({
        top: top,
        bottom: size - height - top,
        left: left,
        right: size - width - left,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(outputPath);
      
    // Overwrite the original
    fs.copyFileSync(outputPath, inputPath);
    fs.unlinkSync(outputPath);
    fs.unlinkSync(tempPath);
    console.log(`Logo centered successfully! (${width}x${height} -> ${size}x${size})`);
  } catch (err) {
    console.error('Error processing logo:', err);
  }
}

cropLogo();

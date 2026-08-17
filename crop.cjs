const sharp = require('sharp');
const fs = require('fs');

async function centerLogo() {
  try {
    const inputPath = 'public/logo.png';
    const outputPath = 'public/logo_cropped.png';
    
    // Get raw pixel data
    const { data, info } = await sharp(inputPath)
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const { width, height, channels } = info;
    
    // Background color of the logo (dark navy: approximately r=13, g=17, b=35)
    // We'll detect non-background pixels to find true content bounds
    const BG_THRESHOLD = 60; // pixels darker than this on all channels are "background"
    
    let minX = width, maxX = 0, minY = height, maxY = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Check if pixel is significantly brighter than background (cyan content)
        const isBright = r > BG_THRESHOLD || g > BG_THRESHOLD || b > BG_THRESHOLD;
        // Also exclude very dark navy background specifically
        const isDarkNavy = r < 40 && g < 50 && b < 80;
        
        if (isBright && !isDarkNavy) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    console.log(`Content bounds: X(${minX}-${maxX}), Y(${minY}-${maxY})`);
    console.log(`Content size: ${maxX - minX}w x ${maxY - minY}h`);
    console.log(`Image center: ${width/2}, ${height/2}`);
    console.log(`Content center: ${(minX + maxX)/2}, ${(minY + maxY)/2}`);
    
    const contentWidth = maxX - minX + 1;
    const contentHeight = maxY - minY + 1;
    const padding = 60; // Add some padding around content
    const size = Math.max(contentWidth, contentHeight) + (padding * 2);
    
    // Extract just the content area
    await sharp(inputPath)
      .extract({
        left: minX,
        top: minY,
        width: contentWidth,
        height: contentHeight
      })
      .extend({
        top: Math.floor((size - contentHeight) / 2),
        bottom: Math.ceil((size - contentHeight) / 2),
        left: Math.floor((size - contentWidth) / 2),
        right: Math.ceil((size - contentWidth) / 2),
        background: { r: 13, g: 17, b: 35, alpha: 255 } // dark navy background
      })
      .png()
      .toFile(outputPath);
    
    fs.copyFileSync(outputPath, inputPath);
    fs.unlinkSync(outputPath);
    console.log(`Done! Logo recentered to ${size}x${size}`);
    
  } catch (err) {
    console.error('Error:', err);
  }
}

centerLogo();

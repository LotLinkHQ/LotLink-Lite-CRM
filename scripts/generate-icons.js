/**
 * Icon Generation Script for RV Sales CRM
 *
 * This script generates all required app icons at correct dimensions.
 *
 * Requirements:
 * - Node.js 18+
 * - sharp package: npm install sharp --save-dev
 *
 * Usage:
 * 1. Place your source icon (1024x1024 PNG) at: assets/icon-source.png
 * 2. Run: node scripts/generate-icons.js
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '../assets');
const SOURCE_ICON = path.join(ASSETS_DIR, 'icon-source.png');

const icons = [
  // App icon (iOS App Store requires 1024x1024)
  { name: 'icon.png', size: 1024, background: '#0B5E7E' },

  // Favicon for web
  { name: 'favicon.png', size: 48, background: '#0B5E7E' },

  // Android adaptive icon foreground (must have padding for safe zone)
  // The actual icon content should be within 66% of the total size (centered)
  { name: 'adaptive-icon.png', size: 1024, background: null, padding: 0.17 },

  // Splash screen (recommend 1284x2778 for modern phones)
  { name: 'splash.png', size: null, width: 1284, height: 2778, background: '#0B5E7E', logoSize: 400 },
];

async function generateIcons() {
  // Check if source icon exists
  if (!fs.existsSync(SOURCE_ICON)) {
    console.log('\n========================================');
    console.log('  ICON GENERATION SETUP');
    console.log('========================================\n');
    console.log('To generate properly sized icons:\n');
    console.log('1. Create a source icon at 1024x1024 pixels');
    console.log('2. Save it as: assets/icon-source.png');
    console.log('3. Run this script again\n');
    console.log('Your source icon should be:');
    console.log('  - 1024x1024 pixels');
    console.log('  - PNG format');
    console.log('  - Square with your logo centered');
    console.log('  - Transparent or solid background\n');
    console.log('========================================\n');

    // Create a placeholder instructions file
    const instructions = `
Icon Requirements for App Store Submission
==========================================

1. icon.png (1024x1024)
   - Used for iOS App Store and Android Play Store listings
   - Should have rounded corners (iOS adds them automatically)
   - No transparency allowed for iOS

2. adaptive-icon.png (1024x1024)
   - Android adaptive icon foreground layer
   - Logo should be centered in the middle 66% of the image
   - Use transparent background
   - The system will add the background color (#0B5E7E)

3. splash.png (1284x2778 recommended)
   - Shown while app loads
   - Logo should be centered
   - Use your brand color as background (#0B5E7E)

4. favicon.png (48x48)
   - Used for web browser tabs
   - Small and recognizable

Current Status:
- Your existing icons appear to be the same image
- For App Store, icon.png must be exactly 1024x1024
- Consider making splash.png different (larger canvas with smaller logo)

Quick Fix:
- Use an online tool like https://appicon.co to generate icons
- Or use Figma/Photoshop to create properly sized assets
`;

    fs.writeFileSync(path.join(ASSETS_DIR, 'ICON_REQUIREMENTS.txt'), instructions);
    console.log('Created: assets/ICON_REQUIREMENTS.txt\n');
    return;
  }

  console.log('Generating icons from source...\n');

  try {
    for (const icon of icons) {
      const outputPath = path.join(ASSETS_DIR, icon.name);

      if (icon.name === 'splash.png') {
        // Splash screen: large canvas with centered logo
        const logoBuffer = await sharp(SOURCE_ICON)
          .resize(icon.logoSize, icon.logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer();

        await sharp({
          create: {
            width: icon.width,
            height: icon.height,
            channels: 4,
            background: icon.background,
          }
        })
          .composite([{
            input: logoBuffer,
            gravity: 'center',
          }])
          .png()
          .toFile(outputPath);

        console.log(`✓ Generated ${icon.name} (${icon.width}x${icon.height})`);

      } else if (icon.padding) {
        // Adaptive icon with safe zone padding
        const innerSize = Math.floor(icon.size * (1 - icon.padding * 2));
        const padding = Math.floor(icon.size * icon.padding);

        const logoBuffer = await sharp(SOURCE_ICON)
          .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer();

        await sharp({
          create: {
            width: icon.size,
            height: icon.size,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent
          }
        })
          .composite([{
            input: logoBuffer,
            left: padding,
            top: padding,
          }])
          .png()
          .toFile(outputPath);

        console.log(`✓ Generated ${icon.name} (${icon.size}x${icon.size}) with safe zone`);

      } else {
        // Standard icon
        await sharp(SOURCE_ICON)
          .resize(icon.size, icon.size, { fit: 'contain', background: icon.background })
          .flatten({ background: icon.background })
          .png()
          .toFile(outputPath);

        console.log(`✓ Generated ${icon.name} (${icon.size}x${icon.size})`);
      }
    }

    console.log('\n✓ All icons generated successfully!\n');

  } catch (error) {
    console.error('Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();

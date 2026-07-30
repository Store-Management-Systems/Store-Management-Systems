const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

const dirsToCreate = [
  'assets/images',
  'assets/logos',
  'assets/icons',
  'assets/illustrations',
  'assets/backgrounds',
  'assets/fonts',
  'public/assets/images',
  'public/assets/logos',
  'public/assets/icons',
  'public/assets/illustrations',
  'public/assets/backgrounds',
  'public/assets/fonts'
];

dirsToCreate.forEach(dir => {
  const fullPath = path.join(rootDir, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Copy logo.png to assets/logos/logo.png and public/assets/logos/logo.png
const srcLogo = path.join(rootDir, 'logo.png');
const destLogo1 = path.join(rootDir, 'assets/logos/logo.png');
const destLogo2 = path.join(rootDir, 'public/assets/logos/logo.png');

if (fs.existsSync(srcLogo)) {
  fs.copyFileSync(srcLogo, destLogo1);
  fs.copyFileSync(srcLogo, destLogo2);
  console.log('Successfully copied logo.png to assets/logos/logo.png and public/assets/logos/logo.png');
} else {
  console.error('Source logo.png not found!');
}

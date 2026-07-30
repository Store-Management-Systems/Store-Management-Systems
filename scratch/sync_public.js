const fs = require('fs');
const path = require('path');

const filesToSync = [
  'index.html',
  'style.css',
  'script.js',
  'sw.js'
];

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(__dirname, '../public');

filesToSync.forEach(file => {
  const src = path.join(rootDir, file);
  const dest = path.join(publicDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Synced ${file} -> public/${file}`);
  }
});

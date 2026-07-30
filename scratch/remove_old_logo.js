const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const file1 = path.join(rootDir, 'logo.png');
const file2 = path.join(rootDir, 'public/logo.png');

if (fs.existsSync(file1)) {
  fs.unlinkSync(file1);
  console.log('Removed root logo.png');
}
if (fs.existsSync(file2)) {
  fs.unlinkSync(file2);
  console.log('Removed public/logo.png');
}

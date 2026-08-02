const { db } = require('../src/shared');
const bcrypt = require('bcryptjs');

async function resetPasswords() {
  console.log("Resetting passwords for admin and pkp to 'admin123'...");
  const hashed = bcrypt.hashSync('admin123', 10);

  // Update admin
  await db.prepare("UPDATE users SET password = ?, password_hash = ? WHERE username = 'admin'").run(hashed, hashed);

  // Update pkp
  await db.prepare("UPDATE users SET password = ?, password_hash = ? WHERE username = 'pkp'").run(hashed, hashed);

  console.log("✅ Successfully set password for 'admin' and 'pkp' to 'admin123'");
  process.exit(0);
}

resetPasswords();

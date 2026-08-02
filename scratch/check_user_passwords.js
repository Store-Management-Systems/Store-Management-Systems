const { db } = require('../src/shared');
const bcrypt = require('bcryptjs');

async function checkPasswords() {
  const users = await db.prepare("SELECT id, name, username, email, password, password_hash, status FROM users WHERE status = 'active'").all();
  console.log(`Checking ${users.length} active users:`);

  for (const u of users) {
    let matchesAdmin123 = false;
    try {
      matchesAdmin123 = bcrypt.compareSync('admin123', u.password || u.password_hash || '');
    } catch(e) {}
    console.log(`User: ${u.username} (${u.name}, ${u.email}) | Password matches 'admin123': ${matchesAdmin123} | Plain: ${u.password?.substring(0, 10)} | Hash: ${u.password_hash?.substring(0, 10)}`);
  }
  process.exit(0);
}

checkPasswords();

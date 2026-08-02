const { db } = require('../src/shared');

async function checkAllUsers() {
  const users = await db.prepare("SELECT id, name, username, email, role, status, shop_id FROM users").all();
  console.log(`Total users in DB: ${users.length}`);
  console.log("Users status breakdown:");
  const active = users.filter(u => u.status === 'active');
  const disabled = users.filter(u => u.status !== 'active');
  console.log(`Active users (${active.length}):`, active);
  console.log(`Disabled/inactive users (${disabled.length}):`, disabled.slice(0, 5));
  process.exit(0);
}

checkAllUsers();

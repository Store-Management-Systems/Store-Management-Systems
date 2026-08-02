const { db } = require('../src/shared');
const { initNeonDatabase } = require('../src/shared/database/pgInit');

async function inspectSuperAdmin() {
    if (process.env.DATABASE_URL) {
        await initNeonDatabase().catch(() => {});
    }

    console.log("==================================================");
    console.log("🔍 INSPECTING SUPER ADMIN ACCOUNTS IN DATABASE");
    console.log("==================================================\n");

    const adminUsers = await db.prepare(`SELECT id, name, username, email, role, status, password, password_hash FROM users WHERE LOWER(role) LIKE '%admin%' OR LOWER(username) LIKE '%admin%'`).all();

    console.log("Found Admin Users in DB:", adminUsers);

    console.log("\n==================================================");
}

inspectSuperAdmin().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});

const { db } = require('../src/shared');
const { initNeonDatabase } = require('../src/shared/database/pgInit');

async function inspectShops() {
    if (process.env.DATABASE_URL) {
        await initNeonDatabase().catch(() => {});
    }
    const shops = await db.prepare(`SELECT * FROM shops`).all();
    console.log("Shops in DB:", shops);
}

inspectShops().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});

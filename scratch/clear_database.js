const { db } = require('../src/shared');
const bcrypt = require('bcryptjs');

async function resetFullDatabase() {
    console.log("==================================================");
    console.log("🧹 STARTING COMPLETE DATABASE & USER RESET...");
    console.log("==================================================\n");

    try {
        // Wait for connection initialization
        await new Promise(r => setTimeout(r, 2500));

        // 1. Wipe all operational and entity tables in foreign-key safe order
        const tablesToWipe = [
            'bill_items',
            'bills',
            'purchase_items',
            'purchases',
            'ledgers',
            'payments',
            'stock_logs',
            'items',
            'people',
            'customers',
            'notifications',
            'approvals',
            'users',            // Delete users before shops/organizations!
            'shops',
            'organizations',
            'categories',
            'units',
            'settings',
            'platform_settings'
        ];

        for (const t of tablesToWipe) {
            try {
                await db.prepare(`DELETE FROM ${t}`).run();
                console.log(`  ✓ Cleared table: ${t}`);
            } catch (e) {
                console.warn(`  ⚠️ Could not wipe ${t}:`, e.message);
            }
        }

        // 2. Re-create default HQ Shop
        const hqShopId = 'shop_default_hq';
        await db.prepare(`
            INSERT INTO shops (id, name, shop_name, shop_code, currency, tax_rate, low_stock_alert, status, address, phone, gst)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            hqShopId,
            'Store Management Systems HQ',
            'Store Management Systems HQ',
            'HQ001',
            '₹',
            0,
            5,
            'active',
            'Platform HQ',
            '1800-SMS-SaaS',
            'GSTIN12345678'
        );
        console.log('\n  ✓ Provisioned Default HQ Shop:', hqShopId);

        // 3. Re-create Default Super Admin Account (admin / admin123)
        const adminId = 'usr_super_admin';
        const adminPassHash = bcrypt.hashSync('admin123', 10);
        const adminPermissions = JSON.stringify(['*']);

        await db.prepare(`
            INSERT INTO users (id, name, username, email, password, password_hash, role, shop_id, permissions, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            adminId,
            'Super Admin',
            'admin',
            'admin@storemanagementsystems.com',
            'admin123',
            adminPassHash,
            'Admin',
            hqShopId,
            adminPermissions,
            'active'
        );
        console.log('  ✓ Provisioned Default Super Admin Account: admin / admin123');

        // 4. Re-create default categories and units
        const defaultCats = ['General', 'Bakery', 'Beverages', 'Snacks', 'Others'];
        for (let i = 0; i < defaultCats.length; i++) {
            await db.prepare(`INSERT INTO categories (id, shop_id, name) VALUES (?, ?, ?)`).run(`cat_${i + 1}`, hqShopId, defaultCats[i]);
        }
        console.log('  ✓ Provisioned Default Categories:', defaultCats.join(', '));

        const defaultUnits = ['Pcs', 'Kg', 'Box', 'Ltr', 'Pack'];
        for (let i = 0; i < defaultUnits.length; i++) {
            await db.prepare(`INSERT INTO units (id, shop_id, name) VALUES (?, ?, ?)`).run(`unit_${i + 1}`, hqShopId, defaultUnits[i]);
        }
        console.log('  ✓ Provisioned Default Units:', defaultUnits.join(', '));

        // 5. Reset Platform Settings
        await db.prepare(`
            INSERT INTO platform_settings (id, platform_name, platform_logo, support_email, support_phone, default_currency, default_price_per_branch, session_timeout_minutes, auto_approval_hours, system_status, version)
            VALUES ('ps_global', 'STORE MANAGEMENT SYSTEMS', 'assets/logos/logo.png', 'support@storemanagementsystems.com', '+1-800-SMS-SaaS', '₹', 999, 15, 8, 'Operational', 'v2.5.0 SaaS Enterprise')
            ON CONFLICT (id) DO NOTHING
        `).run();
        console.log('  ✓ Provisioned Platform Settings (ps_global)');

        console.log("\n==================================================");
        console.log("🎉 DATABASE & USER RESET COMPLETE!");
        console.log("==================================================");

    } catch (err) {
        console.error("❌ Reset Failed:", err);
        process.exit(1);
    }
}

resetFullDatabase();

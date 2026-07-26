const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'database.db');
const db = new Database(dbPath);

// Enable WAL mode
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

function initDatabase() {
    // 1. Run schema SQL for tables
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schemaSql);

    // 2. Safe Schema Migration (Add missing columns to existing tables)
    const addColumn = (table, column, type) => {
        try {
            const columns = db.prepare(`PRAGMA table_info(${table})`).all();
            if (!columns.some(col => col.name === column)) {
                db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
            }
        } catch (e) {}
    };

    // Shops
    addColumn('shops', 'shop_name', 'TEXT DEFAULT "Main Shop"');
    addColumn('shops', 'shop_code', 'TEXT DEFAULT "HQ001"');
    addColumn('shops', 'owner_id', 'TEXT');
    addColumn('shops', 'address', 'TEXT');
    addColumn('shops', 'phone', 'TEXT');
    addColumn('shops', 'gst', 'TEXT');
    addColumn('shops', 'currency', 'TEXT DEFAULT "₹"');
    addColumn('shops', 'tax_rate', 'REAL DEFAULT 0');
    addColumn('shops', 'logo', 'TEXT');
    addColumn('shops', 'low_stock_alert', 'INTEGER DEFAULT 5');
    addColumn('shops', 'status', 'TEXT DEFAULT "active"');
    addColumn('shops', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
    addColumn('shops', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

    // Users
    addColumn('users', 'name', 'TEXT DEFAULT "User"');
    addColumn('users', 'email', 'TEXT');
    addColumn('users', 'password', 'TEXT');
    addColumn('users', 'role', 'TEXT DEFAULT "Staff"');
    addColumn('users', 'shop_id', 'TEXT DEFAULT "shop_default_hq"');
    addColumn('users', 'permissions', 'TEXT DEFAULT "[]"');
    addColumn('users', 'status', 'TEXT DEFAULT "active"');
    addColumn('users', 'phone', 'TEXT');
    addColumn('users', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
    addColumn('users', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

    // Items
    addColumn('items', 'shop_id', 'TEXT DEFAULT "shop_default_hq"');
    addColumn('items', 'buy_price', 'REAL DEFAULT 0');
    addColumn('items', 'selling_price', 'REAL DEFAULT 0');
    addColumn('items', 'stock', 'REAL DEFAULT 0');
    addColumn('items', 'status', 'TEXT DEFAULT "active"');
    addColumn('items', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
    addColumn('items', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

    // Bills
    addColumn('bills', 'shop_id', 'TEXT DEFAULT "shop_default_hq"');
    addColumn('bills', 'user_id', 'TEXT');
    addColumn('bills', 'bill_number', 'TEXT');
    addColumn('bills', 'customer_name', 'TEXT');
    addColumn('bills', 'customer_phone', 'TEXT');
    addColumn('bills', 'subtotal', 'REAL DEFAULT 0');
    addColumn('bills', 'tax', 'REAL DEFAULT 0');
    addColumn('bills', 'discount', 'REAL DEFAULT 0');
    addColumn('bills', 'total', 'REAL DEFAULT 0');
    addColumn('bills', 'payment_mode', 'TEXT DEFAULT "Cash"');
    addColumn('bills', 'status', 'TEXT DEFAULT "Completed"');
    addColumn('bills', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

    // Stock Logs
    addColumn('stock_logs', 'shop_id', 'TEXT DEFAULT "shop_default_hq"');
    addColumn('stock_logs', 'user_id', 'TEXT');
    addColumn('stock_logs', 'item_name', 'TEXT');
    addColumn('stock_logs', 'type', 'TEXT DEFAULT "in"');
    addColumn('stock_logs', 'quantity', 'REAL DEFAULT 0');
    addColumn('stock_logs', 'reason', 'TEXT');
    addColumn('stock_logs', 'supplier', 'TEXT');
    addColumn('stock_logs', 'notes', 'TEXT');
    addColumn('stock_logs', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

    // Customers
    addColumn('customers', 'shop_id', 'TEXT DEFAULT "shop_default_hq"');
    addColumn('customers', 'phone', 'TEXT');
    addColumn('customers', 'email', 'TEXT');
    addColumn('customers', 'address', 'TEXT');
    addColumn('customers', 'gst', 'TEXT');
    addColumn('customers', 'birthday', 'TEXT');
    addColumn('customers', 'notes', 'TEXT');
    addColumn('customers', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

    // Categories & Units
    addColumn('categories', 'shop_id', 'TEXT DEFAULT "shop_default_hq"');
    addColumn('units', 'shop_id', 'TEXT DEFAULT "shop_default_hq"');

    // Settings
    addColumn('settings', 'shop_id', 'TEXT DEFAULT "shop_default_hq"');
    addColumn('settings', 'shop_name', 'TEXT DEFAULT "Main Shop"');
    addColumn('settings', 'tagline', 'TEXT');
    addColumn('settings', 'address', 'TEXT');
    addColumn('settings', 'phone', 'TEXT');
    addColumn('settings', 'gst', 'TEXT');
    addColumn('settings', 'currency', 'TEXT DEFAULT "₹"');
    addColumn('settings', 'tax_rate', 'REAL DEFAULT 0');
    addColumn('settings', 'logo', 'TEXT');
    addColumn('settings', 'low_stock_alert', 'INTEGER DEFAULT 5');
    addColumn('settings', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

    // Handle backwards compatibility for old table column names
    try {
        const shopCols = db.prepare(`PRAGMA table_info(shops)`).all();
        if (shopCols.some(col => col.name === 'name') && !shopCols.some(col => col.name === 'shop_name')) {
            addColumn('shops', 'shop_name', 'TEXT');
            db.exec(`UPDATE shops SET shop_name = name WHERE shop_name IS NULL OR shop_name = 'Main Shop'`);
        }
        const itemCols = db.prepare(`PRAGMA table_info(items)`).all();
        if (itemCols.some(col => col.name === 'price')) {
            db.exec(`UPDATE items SET selling_price = price WHERE selling_price = 0 AND price IS NOT NULL`);
        }
        if (itemCols.some(col => col.name === 'qty')) {
            db.exec(`UPDATE items SET stock = qty WHERE stock = 0 AND qty IS NOT NULL`);
        }
        const billCols = db.prepare(`PRAGMA table_info(bills)`).all();
        if (billCols.some(col => col.name === 'bill_no')) {
            db.exec(`UPDATE bills SET bill_number = 'BT-' || printf('%06d', bill_no) WHERE bill_number IS NULL AND bill_no IS NOT NULL`);
        }
        const logCols = db.prepare(`PRAGMA table_info(stock_logs)`).all();
        if (logCols.some(col => col.name === 'qty') && !logCols.some(col => col.name === 'quantity')) {
            db.exec(`UPDATE stock_logs SET quantity = qty WHERE quantity = 0 AND qty IS NOT NULL`);
        }

        // Fix user status if null
        db.exec(`UPDATE users SET status = 'active' WHERE status IS NULL`);
        db.exec(`UPDATE users SET shop_id = 'shop_default_hq' WHERE shop_id IS NULL OR shop_id = ''`);
    } catch (e) {}

    // 3. Create Indexes after columns exist
    try {
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_items_shop ON items(shop_id);
            CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
            CREATE INDEX IF NOT EXISTS idx_bills_shop ON bills(shop_id);
            CREATE INDEX IF NOT EXISTS idx_bills_created ON bills(created_at);
            CREATE INDEX IF NOT EXISTS idx_stock_logs_shop ON stock_logs(shop_id);
            CREATE INDEX IF NOT EXISTS idx_customers_shop ON customers(shop_id);
        `);
    } catch (e) {}

    // 4. Seed Default Shop
    const defaultShop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get('shop_default_hq');
    if (!defaultShop) {
        const shopCols = db.prepare(`PRAGMA table_info(shops)`).all();
        if (shopCols.some(col => col.name === 'name')) {
            db.prepare(`
                INSERT INTO shops (id, name, shop_name, shop_code, owner_id, address, phone, gst, currency, tax_rate, low_stock_alert, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'shop_default_hq',
                'Main Headquarters',
                'Main Headquarters',
                'HQ001',
                'usr_super_admin',
                '123 Central Business Ave',
                '9876543210',
                'GSTIN12345678',
                '₹',
                0,
                5,
                'active'
            );
        } else {
            db.prepare(`
                INSERT INTO shops (id, shop_name, shop_code, owner_id, address, phone, gst, currency, tax_rate, low_stock_alert, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'shop_default_hq',
                'Main Headquarters',
                'HQ001',
                'usr_super_admin',
                '123 Central Business Ave',
                '9876543210',
                'GSTIN12345678',
                '₹',
                0,
                5,
                'active'
            );
        }
    }

    // 5. Seed Default Admin User
    const allPermissions = [
        'Dashboard', 'Inventory', 'Billing', 'Reports', 'Customers',
        'Stock In', 'Stock Out', 'Delete Item', 'Edit Item', 'Create Item',
        'Discount', 'Print Bill', 'Export Excel', 'Settings', 'Users',
        'Shops', 'Financial Reports', 'Categories', 'Units', 'Purchase Price',
        'Selling Price', 'History'
    ];

    const adminUser = db.prepare(`SELECT * FROM users WHERE username = ?`).get('admin');
    const hashedPassword = bcrypt.hashSync('admin123', 10);

    if (!adminUser) {
        db.prepare(`
            INSERT INTO users (id, name, username, email, password, role, shop_id, permissions, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'usr_super_admin',
            'Super Admin',
            'admin',
            'admin@shop.com',
            hashedPassword,
            'Admin',
            'shop_default_hq',
            JSON.stringify(allPermissions),
            'active'
        );
        console.log('✅ Created Default Admin Account: Username=admin | Password=admin123');
    } else if (!adminUser.password || !adminUser.password.startsWith('$2')) {
        db.prepare(`UPDATE users SET password = ?, role = 'Admin', status = 'active', permissions = ? WHERE username = ?`)
            .run(hashedPassword, JSON.stringify(allPermissions), 'admin');
        console.log('✅ Updated Default Admin Password & Permissions: Username=admin | Password=admin123');
    }

    // 6. Seed Default Categories
    const defaultCategories = ['General', 'Bakery', 'Beverages', 'Snacks', 'Dairy', 'Others'];
    const checkCat = db.prepare(`SELECT COUNT(*) as count FROM categories WHERE shop_id = ?`);
    if (checkCat.get('shop_default_hq').count === 0) {
        const insertCat = db.prepare(`INSERT INTO categories (id, shop_id, name) VALUES (?, ?, ?)`);
        defaultCategories.forEach((cat, idx) => {
            insertCat.run(`cat_${idx + 1}`, 'shop_default_hq', cat);
        });
    }

    // 7. Seed Default Units
    const defaultUnits = ['Pcs', 'Kg', 'Grams', 'Ltr', 'Ml', 'Box', 'Pack'];
    const checkUnit = db.prepare(`SELECT COUNT(*) as count FROM units WHERE shop_id = ?`);
    if (checkUnit.get('shop_default_hq').count === 0) {
        const insertUnit = db.prepare(`INSERT INTO units (id, shop_id, name) VALUES (?, ?, ?)`);
        defaultUnits.forEach((unit, idx) => {
            insertUnit.run(`unit_${idx + 1}`, 'shop_default_hq', unit);
        });
    }

    // 8. Seed Default Settings
    const defaultSettings = db.prepare(`SELECT * FROM settings WHERE shop_id = ?`).get('shop_default_hq');
    if (!defaultSettings) {
        db.prepare(`
            INSERT INTO settings (id, shop_id, shop_name, tagline, address, phone, gst, currency, tax_rate, low_stock_alert)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'set_default_hq',
            'shop_default_hq',
            'Main Headquarters',
            'Quality & Service First',
            '123 Central Business Ave',
            '9876543210',
            'GSTIN12345678',
            '₹',
            0,
            5
        );
    }

    db.pragma('foreign_keys = ON');
}

initDatabase();

module.exports = db;

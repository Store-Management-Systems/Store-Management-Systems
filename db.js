const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const fs = require('fs');

const db = new sqlite3.Database('./shop_data.db', (err) => {
    if (err) console.error('Database connection error:', err.message);
    else console.log('Connected to SQLite database.');
});

// Utility for safe schema migration
const addColumnIfNotExists = (table, column, definition) => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
        if (err) return;
        const exists = rows.some(r => r.name === column);
        if (!exists) {
            db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
    });
};

db.serialize(async () => {
    // 1. Core Tables
    db.run(`CREATE TABLE IF NOT EXISTS shops (
        id TEXT PRIMARY KEY, shop_name TEXT, shop_code TEXT UNIQUE, owner_id TEXT, 
        address TEXT, phone TEXT, gst TEXT, currency TEXT DEFAULT '₹', tax_rate REAL DEFAULT 0, 
        logo TEXT, status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT, username TEXT UNIQUE, email TEXT, password TEXT, 
        role TEXT, shop_id TEXT, permissions TEXT, status TEXT DEFAULT 'active', 
        phone TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Existing Data Migration & Enhancements
    db.run(`CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY, name TEXT, category TEXT, unit TEXT, buy_price REAL, 
        price REAL, qty REAL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    addColumnIfNotExists('items', 'shop_id', 'TEXT');
    addColumnIfNotExists('items', 'status', 'TEXT DEFAULT "active"');

    db.run(`CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY, bill_no INTEGER, customer_name TEXT, customer_phone TEXT, 
        subtotal REAL, tax REAL, total REAL, tax_rate REAL, date DATETIME
    )`);
    addColumnIfNotExists('bills', 'shop_id', 'TEXT');
    addColumnIfNotExists('bills', 'user_id', 'TEXT');

    db.run(`CREATE TABLE IF NOT EXISTS bill_items (
        id TEXT PRIMARY KEY, bill_id TEXT, item_id TEXT, name TEXT, 
        qty REAL, price REAL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY, shop_id TEXT, name TEXT, phone TEXT, email TEXT, 
        address TEXT, gst TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY, shop_id TEXT, user_id TEXT, action TEXT, 
        details TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, shop_id TEXT, message TEXT, type TEXT, 
        is_read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create Default Super Admin & Main Shop if fresh DB
    db.get("SELECT * FROM users WHERE role = 'Admin'", async (err, row) => {
        if (!row) {
            const adminId = 'USR_' + Date.now();
            const shopId = 'SHP_' + Date.now();
            const hashedPwd = await bcrypt.hash('admin123', 10);
            const allPerms = JSON.stringify(['Dashboard','Inventory','Billing','Reports','Customers','Stock In','Stock Out','Delete Item','Edit Item','Create Item','Settings','Users','Shops']);
            
            db.run(`INSERT INTO shops (id, shop_name, shop_code, currency) VALUES (?, ?, ?, ?)`, 
                [shopId, 'Main Headquarters', 'HQ01', '₹']);
                
            db.run(`INSERT INTO users (id, name, username, password, role, shop_id, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [adminId, 'Super Admin', 'admin', hashedPwd, 'Admin', shopId, allPerms]);
                
            console.log("Default Admin created. Username: admin | Password: admin123");
        }
    });
});

module.exports = db;
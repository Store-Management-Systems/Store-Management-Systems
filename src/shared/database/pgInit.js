const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_X23EGjmybNrO@ep-old-waterfall-ay86a9u4-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

let initPromise = null;

async function initNeonDatabase() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        console.log('🚀 Initializing Neon PostgreSQL Database Schemas...');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

        // 1. DDL Statements
        await client.query(`
            CREATE TABLE IF NOT EXISTS shops (
                id VARCHAR(50) PRIMARY KEY,
                shop_name VARCHAR(150) NOT NULL,
                name VARCHAR(150),
                shop_code VARCHAR(50) UNIQUE NOT NULL,
                owner_id VARCHAR(50),
                address TEXT,
                phone VARCHAR(50),
                gst VARCHAR(50),
                currency VARCHAR(10) DEFAULT '₹',
                tax_rate NUMERIC DEFAULT 0,
                logo TEXT,
                low_stock_alert INT DEFAULT 5,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                username VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(150),
                password TEXT NOT NULL,
                password_hash TEXT,
                role VARCHAR(50) DEFAULT 'Staff',
                shop_id VARCHAR(50) REFERENCES shops(id),
                permissions TEXT DEFAULT '[]',
                status VARCHAR(20) DEFAULT 'active',
                phone VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS categories (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS units (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                name VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS items (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                name VARCHAR(150) NOT NULL,
                category VARCHAR(100) DEFAULT 'General',
                unit VARCHAR(50) DEFAULT 'Pcs',
                buy_price NUMERIC DEFAULT 0,
                selling_price NUMERIC DEFAULT 0,
                price NUMERIC DEFAULT 0,
                stock NUMERIC DEFAULT 0,
                qty NUMERIC DEFAULT 0,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Unified People Table (Customer B2C, Party B2B, Supplier)
            CREATE TABLE IF NOT EXISTS people (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                category VARCHAR(30) NOT NULL DEFAULT 'Customer',
                name VARCHAR(150) NOT NULL,
                business_name VARCHAR(150),
                mobile VARCHAR(50),
                alt_mobile VARCHAR(50),
                email VARCHAR(150),
                gstin VARCHAR(50),
                pan VARCHAR(50),
                address TEXT,
                city VARCHAR(100),
                state VARCHAR(100),
                pincode VARCHAR(20),
                opening_balance NUMERIC DEFAULT 0,
                credit_limit NUMERIC DEFAULT 0,
                payment_terms VARCHAR(50) DEFAULT 'Net 30',
                birthday DATE,
                anniversary DATE,
                loyalty_points INT DEFAULT 0,
                status VARCHAR(20) DEFAULT 'Active',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS customers (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                name VARCHAR(150) NOT NULL,
                phone VARCHAR(50),
                email VARCHAR(150),
                address TEXT,
                gst VARCHAR(50),
                birthday DATE,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- B2B Supplier Purchases Header
            CREATE TABLE IF NOT EXISTS purchases (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                supplier_id VARCHAR(50) REFERENCES people(id),
                user_id VARCHAR(50),
                purchase_number VARCHAR(50) NOT NULL,
                supplier_invoice_no VARCHAR(100),
                subtotal NUMERIC DEFAULT 0,
                tax NUMERIC DEFAULT 0,
                discount NUMERIC DEFAULT 0,
                total NUMERIC DEFAULT 0,
                paid_amount NUMERIC DEFAULT 0,
                due_amount NUMERIC DEFAULT 0,
                payment_status VARCHAR(30) DEFAULT 'Unpaid',
                payment_mode VARCHAR(50) DEFAULT 'Bank Transfer',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS purchase_items (
                id VARCHAR(50) PRIMARY KEY,
                purchase_id VARCHAR(50) REFERENCES purchases(id) ON DELETE CASCADE,
                item_id VARCHAR(50),
                item_name VARCHAR(150) NOT NULL,
                buy_price NUMERIC DEFAULT 0,
                qty NUMERIC DEFAULT 0,
                total NUMERIC DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS bills (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                user_id VARCHAR(50),
                person_id VARCHAR(50),
                bill_number VARCHAR(50) NOT NULL,
                customer_name VARCHAR(150),
                customer_phone VARCHAR(50),
                subtotal NUMERIC DEFAULT 0,
                tax NUMERIC DEFAULT 0,
                discount NUMERIC DEFAULT 0,
                total NUMERIC DEFAULT 0,
                paid_amount NUMERIC DEFAULT 0,
                due_amount NUMERIC DEFAULT 0,
                payment_status VARCHAR(30) DEFAULT 'Paid',
                payment_mode VARCHAR(50) DEFAULT 'Cash',
                status VARCHAR(20) DEFAULT 'Completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS bill_items (
                id VARCHAR(50) PRIMARY KEY,
                bill_id VARCHAR(50) REFERENCES bills(id) ON DELETE CASCADE,
                item_id VARCHAR(50),
                item_name VARCHAR(150) NOT NULL,
                price NUMERIC DEFAULT 0,
                qty NUMERIC DEFAULT 0,
                total NUMERIC DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS payments (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                person_id VARCHAR(50) REFERENCES people(id) ON DELETE CASCADE,
                user_id VARCHAR(50),
                type VARCHAR(20) NOT NULL,
                payment_mode VARCHAR(50) DEFAULT 'Cash',
                amount NUMERIC DEFAULT 0,
                reference_no VARCHAR(100),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ledgers (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                person_id VARCHAR(50) REFERENCES people(id) ON DELETE CASCADE,
                entry_type VARCHAR(50) NOT NULL,
                reference_id VARCHAR(50),
                debit NUMERIC DEFAULT 0,
                credit NUMERIC DEFAULT 0,
                running_balance NUMERIC DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS stock_logs (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                user_id VARCHAR(50),
                item_id VARCHAR(50),
                item_name VARCHAR(150) NOT NULL,
                type VARCHAR(20) NOT NULL,
                quantity NUMERIC DEFAULT 0,
                qty NUMERIC DEFAULT 0,
                reason VARCHAR(100),
                supplier VARCHAR(150),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS settings (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50) UNIQUE REFERENCES shops(id) ON DELETE CASCADE,
                shop_name VARCHAR(150) NOT NULL,
                tagline TEXT,
                address TEXT,
                phone VARCHAR(50),
                gst VARCHAR(50),
                currency VARCHAR(10) DEFAULT '₹',
                tax_rate NUMERIC DEFAULT 0,
                logo TEXT,
                low_stock_alert INT DEFAULT 5,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50),
                user_id VARCHAR(50),
                action VARCHAR(100) NOT NULL,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50),
                title VARCHAR(150) NOT NULL,
                message TEXT,
                type VARCHAR(50) DEFAULT 'info',
                is_read INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS approvals (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50),
                requester_id VARCHAR(50) NOT NULL,
                requester_name VARCHAR(150),
                type VARCHAR(50) NOT NULL,
                entity_id VARCHAR(50),
                title VARCHAR(255) NOT NULL,
                payload TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                auto_approve_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS organizations (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                code VARCHAR(50) UNIQUE NOT NULL,
                owner_id VARCHAR(50),
                owner_name VARCHAR(150),
                email VARCHAR(150),
                phone VARCHAR(50),
                status VARCHAR(20) DEFAULT 'active',
                subscription_plan VARCHAR(50) DEFAULT 'Standard',
                subscription_status VARCHAR(50) DEFAULT 'Active',
                subscription_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                subscription_expiry TIMESTAMP,
                price_per_branch NUMERIC DEFAULT 999,
                active_branch_count INT DEFAULT 0,
                subscription_amount NUMERIC DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS platform_settings (
                id VARCHAR(50) PRIMARY KEY,
                platform_name VARCHAR(150) DEFAULT 'STORE MANAGEMENT SYSTEMS',
                platform_logo TEXT DEFAULT 'assets/logos/logo.png',
                support_email VARCHAR(150) DEFAULT 'support@storemanagementsystems.com',
                support_phone VARCHAR(50) DEFAULT '+1-800-SMS-SaaS',
                default_currency VARCHAR(10) DEFAULT '₹',
                default_price_per_branch NUMERIC DEFAULT 999,
                session_timeout_minutes INT DEFAULT 15,
                auto_approval_hours INT DEFAULT 8,
                system_status VARCHAR(50) DEFAULT 'Operational',
                version VARCHAR(50) DEFAULT 'v2.5.0 SaaS Enterprise',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            INSERT INTO platform_settings (id, platform_name, platform_logo, support_email, support_phone, default_currency, default_price_per_branch, session_timeout_minutes, auto_approval_hours, system_status, version)
            VALUES ('ps_global', 'STORE MANAGEMENT SYSTEMS', 'assets/logos/logo.png', 'support@storemanagementsystems.com', '+1-800-SMS-SaaS', '₹', 999, 15, 8, 'Operational', 'v2.5.0 SaaS Enterprise')
            ON CONFLICT (id) DO NOTHING;
        `);

        // Safely alter existing tables for schema upgrades
        await client.query(`
            ALTER TABLE bills ADD COLUMN IF NOT EXISTS person_id VARCHAR(50);
            ALTER TABLE bills ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
            ALTER TABLE bills ADD COLUMN IF NOT EXISTS due_amount NUMERIC DEFAULT 0;
            ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'Paid';
            ALTER TABLE bills ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(50);
            ALTER TABLE bills ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
            ALTER TABLE bills ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
            ALTER TABLE bills ADD COLUMN IF NOT EXISTS remarks TEXT;

            ALTER TABLE shops ADD COLUMN IF NOT EXISTS organization_id VARCHAR(50);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id VARCHAR(50);
            ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_id VARCHAR(50);
            ALTER TABLE shops ADD COLUMN IF NOT EXISTS fssai VARCHAR(50);
            ALTER TABLE shops ADD COLUMN IF NOT EXISTS email VARCHAR(150);
            ALTER TABLE shops ADD COLUMN IF NOT EXISTS opening_date DATE;
            ALTER TABLE shops ADD COLUMN IF NOT EXISTS manager VARCHAR(150);

            ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'Standard';
            ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'Active';
            ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_expiry TIMESTAMP;
            ALTER TABLE organizations ADD COLUMN IF NOT EXISTS price_per_branch NUMERIC DEFAULT 999;
            ALTER TABLE organizations ADD COLUMN IF NOT EXISTS active_branch_count INT DEFAULT 0;
            ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_amount NUMERIC DEFAULT 0;
            ALTER TABLE organizations ADD COLUMN IF NOT EXISTS branding_config TEXT;
            ALTER TABLE shops ADD COLUMN IF NOT EXISTS branding_config TEXT;

            ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_modes_split TEXT;
            ALTER TABLE bills ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS photo TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_joining DATE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS salary NUMERIC DEFAULT 0;

            UPDATE shops SET logo = 'assets/logos/logo.png' WHERE logo IS NULL OR logo = '' OR logo = 'logo.png';
            UPDATE settings SET logo = 'assets/logos/logo.png' WHERE logo IS NULL OR logo = '' OR logo = 'logo.png';
        `);

        // 2. Indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pg_items_shop ON items(shop_id);
            CREATE INDEX IF NOT EXISTS idx_pg_bills_shop ON bills(shop_id);
            CREATE INDEX IF NOT EXISTS idx_pg_bills_person ON bills(person_id);
            CREATE INDEX IF NOT EXISTS idx_pg_bills_created ON bills(created_at);
            CREATE INDEX IF NOT EXISTS idx_pg_people_shop_cat ON people(shop_id, category);
            CREATE INDEX IF NOT EXISTS idx_pg_payments_person ON payments(person_id);
            CREATE INDEX IF NOT EXISTS idx_pg_ledgers_person ON ledgers(person_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_pg_purchases_supplier ON purchases(supplier_id);
        `);

        // 3. Seed Default Shop
        const shopCheck = await client.query('SELECT id FROM shops WHERE id = $1', ['shop_default_hq']);
        if (shopCheck.rowCount === 0) {
            await client.query(`
                INSERT INTO shops (id, name, shop_name, shop_code, owner_id, address, phone, gst, currency, tax_rate, low_stock_alert, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, ['shop_default_hq', 'Main Headquarters', 'Main Headquarters', 'HQ001', 'usr_super_admin', '123 Central Business Ave', '9876543210', 'GSTIN12345678', '₹', 0, 5, 'active']);
            console.log('✅ Seeded Main Headquarters Shop in Neon DB');
        }

        // 4. Seed Super Admin User
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        const allPermissions = JSON.stringify([
            'Dashboard', 'Inventory', 'Billing', 'Reports', 'Customers',
            'Stock In', 'Stock Out', 'Delete Item', 'Edit Item', 'Create Item',
            'Discount', 'Print Bill', 'Export Excel', 'Settings', 'Users',
            'Shops', 'Financial Reports', 'Categories', 'Units', 'Purchase Price',
            'Selling Price', 'History', 'Parties', 'Suppliers', 'Ledgers', 'Payments', 'Purchases'
        ]);

        const adminCheck = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
        if (adminCheck.rowCount === 0) {
            await client.query(`
                INSERT INTO users (id, name, username, email, password, password_hash, role, shop_id, permissions, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, ['usr_super_admin', 'Super Admin', 'admin', 'admin@shop.com', hashedPassword, hashedPassword, 'Admin', 'shop_default_hq', allPermissions, 'active']);
            console.log('✅ Seeded Super Admin Account (admin / admin123) in Neon DB');
        } else {
            await client.query(`
                UPDATE users SET password = $1, password_hash = $2, role = 'Admin', status = 'active', permissions = $3 WHERE username = 'admin'
            `, [hashedPassword, hashedPassword, allPermissions]);
            console.log('✅ Verified Super Admin Account (admin / admin123) in Neon DB');
        }

        // 5. Seed Default Categories & Units
        const defaultCats = ['General', 'Bakery', 'Beverages', 'Snacks', 'Dairy', 'Others'];
        for (let idx = 0; idx < defaultCats.length; idx++) {
            await client.query(`
                INSERT INTO categories (id, shop_id, name) VALUES ($1, $2, $3)
                ON CONFLICT (id) DO NOTHING
            `, [`cat_${idx + 1}`, 'shop_default_hq', defaultCats[idx]]);
        }

        const defaultUnits = ['Pcs', 'Kg', 'Grams', 'Ltr', 'Ml', 'Box', 'Pack'];
        for (let idx = 0; idx < defaultUnits.length; idx++) {
            await client.query(`
                INSERT INTO units (id, shop_id, name) VALUES ($1, $2, $3)
                ON CONFLICT (id) DO NOTHING
            `, [`unit_${idx + 1}`, 'shop_default_hq', defaultUnits[idx]]);
        }

        // 6. Seed Default Settings
        await client.query(`
            INSERT INTO settings (id, shop_id, shop_name, tagline, address, phone, gst, currency, tax_rate, low_stock_alert)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (shop_id) DO NOTHING
        `, ['set_default_hq', 'shop_default_hq', 'Main Headquarters', 'Quality & Service First', '123 Central Business Ave', '9876543210', 'GSTIN12345678', '₹', 0, 5]);

        await client.query('COMMIT');
        console.log('✨ Neon PostgreSQL Database Ready and Fully Provisioned with B2B/B2C Schemas!');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('❌ Failed to initialize Neon DB:', err);
        initPromise = null;
        throw err;
    } finally {
        client.release();
    }
    })();
    return initPromise;
}

module.exports = { pool, initNeonDatabase };

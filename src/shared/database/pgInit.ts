const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pgPool: any = null;

export const getPgPool = () => {
    if (!pgPool && process.env.DATABASE_URL) {
        pgPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        });
    }
    return pgPool;
};

export const initNeonDatabase = async () => {
    if (!process.env.DATABASE_URL) return null;

    const pool = getPgPool();
    const client = await pool.connect();

    try {
        console.log("🌐 DATABASE_URL detected! Connecting to Neon PostgreSQL...");
        console.log("🚀 Initializing Neon PostgreSQL Database Schemas & PL/pgSQL Stored Procedures...");

        await client.query('BEGIN');

        // 1. Core Tables DDL
        await client.query(`
            CREATE TABLE IF NOT EXISTS platform_settings (
                id VARCHAR(50) PRIMARY KEY,
                platform_name VARCHAR(150) DEFAULT 'STORE MANAGEMENT SYSTEMS',
                platform_logo TEXT DEFAULT 'assets/logos/logo.png',
                company_name TEXT DEFAULT 'STORE MANAGEMENT SYSTEMS',
                legal_name TEXT DEFAULT 'Store Management Systems Pvt. Ltd.',
                gstin VARCHAR(50) DEFAULT '22AAAAA0000A1Z5',
                pan VARCHAR(50) DEFAULT 'ABCDE1234F',
                cin VARCHAR(50) DEFAULT 'U72900DL2024PTC123456',
                registered_address TEXT DEFAULT 'Suite 500, Tech Park Plaza',
                city VARCHAR(100) DEFAULT 'New Delhi',
                state VARCHAR(100) DEFAULT 'Delhi',
                country VARCHAR(100) DEFAULT 'India',
                pincode VARCHAR(20) DEFAULT '110001',
                website VARCHAR(150) DEFAULT 'https://storemanagementsystems.com',
                company_email VARCHAR(150) DEFAULT 'contact@storemanagementsystems.com',
                company_phone VARCHAR(50) DEFAULT '+91-9876543210',
                billing_company_name VARCHAR(150) DEFAULT 'Store Management Systems SaaS Billing',
                billing_legal_name VARCHAR(150) DEFAULT 'Store Management Systems Pvt. Ltd.',
                billing_gstin VARCHAR(50) DEFAULT '22AAAAA0000A1Z5',
                billing_pan VARCHAR(50) DEFAULT 'ABCDE1234F',
                invoice_prefix VARCHAR(20) DEFAULT 'SMS-INV-',
                billing_address TEXT DEFAULT 'Suite 500, Tech Park Plaza, Barakhamba Road',
                billing_city VARCHAR(100) DEFAULT 'New Delhi',
                billing_state VARCHAR(100) DEFAULT 'Delhi',
                billing_country VARCHAR(100) DEFAULT 'India',
                billing_pincode VARCHAR(20) DEFAULT '110001',
                billing_email VARCHAR(150) DEFAULT 'billing@storemanagementsystems.com',
                billing_phone VARCHAR(50) DEFAULT '+91-9876543210',
                bank_name VARCHAR(150) DEFAULT 'HDFC Bank Ltd',
                account_holder VARCHAR(150) DEFAULT 'Store Management Systems Pvt. Ltd.',
                account_number VARCHAR(50) DEFAULT '50200012345678',
                ifsc_code VARCHAR(30) DEFAULT 'HDFC0001234',
                bank_branch VARCHAR(100) DEFAULT 'Connaught Place Branch, New Delhi',
                upi_id VARCHAR(100) DEFAULT 'sms@hdfcbank',
                payment_terms TEXT DEFAULT 'Payment due within 7 days of invoice generation.',
                notes_terms TEXT DEFAULT 'Computer generated SaaS invoice. All disputes subject to Delhi jurisdiction.',
                signatory_name VARCHAR(150) DEFAULT 'Rahul Sharma',
                signatory_designation VARCHAR(100) DEFAULT 'Director & Head of SaaS Operations',
                signature_logo TEXT,
                seal_logo TEXT,
                support_email VARCHAR(150) DEFAULT 'support@storemanagementsystems.com',
                support_phone VARCHAR(50) DEFAULT '+1-800-SMS-SaaS',
                whatsapp_number VARCHAR(50) DEFAULT '+91-9876543210',
                customer_care_number VARCHAR(50) DEFAULT '1800-123-4567',
                tech_support_number VARCHAR(50) DEFAULT '+91-9876543211',
                sales_email VARCHAR(150) DEFAULT 'sales@storemanagementsystems.com',
                sales_phone VARCHAR(50) DEFAULT '+91-9876543212',
                business_hours VARCHAR(100) DEFAULT 'Mon - Sat: 9:00 AM - 8:00 PM IST',
                dark_logo TEXT DEFAULT 'assets/logos/logo.png',
                light_logo TEXT DEFAULT 'assets/logos/logo.png',
                favicon TEXT DEFAULT 'assets/logos/logo.png',
                app_icon TEXT DEFAULT 'assets/logos/logo.png',
                primary_color VARCHAR(30) DEFAULT '#1E1E1E',
                secondary_color VARCHAR(30) DEFAULT '#6B7280',
                accent_color VARCHAR(30) DEFAULT '#3B82F6',
                default_currency VARCHAR(10) DEFAULT '₹',
                currency_symbol VARCHAR(10) DEFAULT '₹',
                date_format VARCHAR(30) DEFAULT 'DD/MM/YYYY',
                time_format VARCHAR(30) DEFAULT '12 Hours',
                time_zone VARCHAR(50) DEFAULT 'Asia/Kolkata',
                default_price_per_branch NUMERIC DEFAULT 999,
                session_timeout_minutes INT DEFAULT 15,
                password_min_length INT DEFAULT 6,
                max_login_attempts INT DEFAULT 5,
                force_password_change_default INT DEFAULT 0,
                system_status VARCHAR(50) DEFAULT 'Operational',
                version VARCHAR(50) DEFAULT 'v2.5.0 SaaS Enterprise',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS organizations (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                code VARCHAR(50) UNIQUE NOT NULL,
                owner_id VARCHAR(50),
                price_per_branch NUMERIC DEFAULT 999,
                subscription_plan VARCHAR(50) DEFAULT 'Standard Multi-Branch',
                subscription_status VARCHAR(50) DEFAULT 'Active',
                active_branch_count INT DEFAULT 1,
                subscription_amount NUMERIC DEFAULT 999,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS shops (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(150),
                shop_name VARCHAR(150) NOT NULL,
                shop_code VARCHAR(50) NOT NULL,
                organization_id VARCHAR(50) REFERENCES organizations(id) ON DELETE CASCADE,
                owner_id VARCHAR(50),
                address TEXT,
                phone VARCHAR(50),
                gst VARCHAR(50),
                currency VARCHAR(10) DEFAULT '₹',
                tax_rate NUMERIC DEFAULT 0,
                logo TEXT DEFAULT 'assets/logos/logo.png',
                low_stock_alert INT DEFAULT 5,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                username VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(150),
                password VARCHAR(255) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'Staff',
                shop_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                organization_id VARCHAR(50) REFERENCES organizations(id) ON DELETE SET NULL,
                permissions TEXT,
                status VARCHAR(50) DEFAULT 'active',
                phone VARCHAR(50),
                force_password_change INT DEFAULT 0,
                last_password_reset_at TIMESTAMP,
                last_password_reset_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS subscriptions (
                id VARCHAR(50) PRIMARY KEY,
                subscription_id VARCHAR(50) UNIQUE NOT NULL,
                organization_id VARCHAR(50) REFERENCES organizations(id) ON DELETE CASCADE,
                branch_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                plan_id VARCHAR(50) DEFAULT 'plan_monthly_std',
                plan_name VARCHAR(100) DEFAULT 'Monthly Standard Branch Plan',
                subscription_amount NUMERIC NOT NULL DEFAULT 999,
                payment_status VARCHAR(50) DEFAULT 'Unpaid',
                payment_mode VARCHAR(50) DEFAULT 'Cash',
                subscription_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                renewal_date TIMESTAMP,
                expiry_date TIMESTAMP,
                auto_renew_enabled INT DEFAULT 1,
                status VARCHAR(50) DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS items (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                organization_id VARCHAR(50) REFERENCES organizations(id) ON DELETE CASCADE,
                name VARCHAR(150) NOT NULL,
                category VARCHAR(100),
                price NUMERIC DEFAULT 0,
                purchase_price NUMERIC DEFAULT 0,
                selling_price NUMERIC DEFAULT 0,
                stock INT DEFAULT 0,
                unit VARCHAR(50) DEFAULT 'Pcs',
                barcode VARCHAR(100),
                min_stock_alert INT DEFAULT 5,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS bills (
                id VARCHAR(50) PRIMARY KEY,
                shop_id VARCHAR(50) REFERENCES shops(id) ON DELETE CASCADE,
                organization_id VARCHAR(50) REFERENCES organizations(id) ON DELETE CASCADE,
                bill_number VARCHAR(50) NOT NULL,
                customer_name VARCHAR(150),
                customer_phone VARCHAR(50),
                subtotal NUMERIC DEFAULT 0,
                tax_amount NUMERIC DEFAULT 0,
                discount_amount NUMERIC DEFAULT 0,
                discount_type VARCHAR(20) DEFAULT 'rupees',
                grand_total NUMERIC DEFAULT 0,
                payment_mode VARCHAR(50) DEFAULT 'Cash',
                paid_amount NUMERIC DEFAULT 0,
                status VARCHAR(50) DEFAULT 'completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS bill_items (
                id VARCHAR(50) PRIMARY KEY,
                bill_id VARCHAR(50) REFERENCES bills(id) ON DELETE CASCADE,
                item_id VARCHAR(50) REFERENCES items(id) ON DELETE SET NULL,
                item_name VARCHAR(150) NOT NULL,
                price NUMERIC NOT NULL,
                quantity INT NOT NULL,
                total NUMERIC NOT NULL,
                unit VARCHAR(50) DEFAULT 'Pcs'
            );
        `);

        // 2. PL/pgSQL Stored Procedures & Functions
        await client.query(`
            -- PL/pgSQL Function: Calculate Bill Totals
            CREATE OR REPLACE FUNCTION fn_calculate_bill_totals(
                p_subtotal NUMERIC,
                p_tax_rate NUMERIC,
                p_discount NUMERIC,
                p_discount_type TEXT
            ) RETURNS TABLE (
                tax_amount NUMERIC,
                discount_amount NUMERIC,
                grand_total NUMERIC
            ) LANGUAGE plpgsql AS $$
            DECLARE
                v_tax NUMERIC := 0;
                v_disc NUMERIC := 0;
                v_grand NUMERIC := 0;
            BEGIN
                IF p_discount_type = 'percent' THEN
                    v_disc := (p_subtotal * COALESCE(p_discount, 0)) / 100.0;
                ELSE
                    v_disc := COALESCE(p_discount, 0);
                END IF;

                v_tax := ((p_subtotal - v_disc) * COALESCE(p_tax_rate, 0)) / 100.0;
                v_grand := GREATEST(0, (p_subtotal - v_disc + v_tax));

                RETURN QUERY SELECT ROUND(v_tax, 2), ROUND(v_disc, 2), ROUND(v_grand, 2);
            END;
            $$;

            -- PL/pgSQL Trigger Function: Automatic Item Stock Deduction on Bill Creation
            CREATE OR REPLACE FUNCTION fn_update_item_stock_on_bill()
            RETURNS TRIGGER LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW.item_id IS NOT NULL THEN
                    UPDATE items
                    SET stock = GREATEST(0, stock - NEW.quantity),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = NEW.item_id;
                END IF;
                RETURN NEW;
            END;
            $$;

            DROP TRIGGER IF EXISTS trg_update_stock ON bill_items;
            CREATE TRIGGER trg_update_stock
            AFTER INSERT ON bill_items
            FOR EACH ROW
            EXECUTE FUNCTION fn_update_item_stock_on_bill();

            -- PL/pgSQL Stored Function: Extend Subscription & Update Renewal
            CREATE OR REPLACE FUNCTION fn_renew_subscription(
                p_subscription_id TEXT,
                p_days INT
            ) RETURNS TIMESTAMP LANGUAGE plpgsql AS $$
            DECLARE
                v_current_expiry TIMESTAMP;
                v_new_expiry TIMESTAMP;
            BEGIN
                SELECT expiry_date INTO v_current_expiry FROM subscriptions WHERE id = p_subscription_id;
                IF v_current_expiry IS NULL OR v_current_expiry < CURRENT_TIMESTAMP THEN
                    v_new_expiry := CURRENT_TIMESTAMP + (p_days || ' days')::INTERVAL;
                ELSE
                    v_new_expiry := v_current_expiry + (p_days || ' days')::INTERVAL;
                END IF;

                UPDATE subscriptions
                SET expiry_date = v_new_expiry,
                    renewal_date = CURRENT_TIMESTAMP,
                    payment_status = 'Paid',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = p_subscription_id;

                RETURN v_new_expiry;
            END;
            $$;
        `);

        // 3. Seed Default Platform Settings Row
        await client.query(`
            INSERT INTO platform_settings (id, platform_name, platform_logo, support_email, support_phone, default_currency, default_price_per_branch, session_timeout_minutes, system_status, version)
            VALUES ('ps_global', 'STORE MANAGEMENT SYSTEMS', 'assets/logos/logo.png', 'support@storemanagementsystems.com', '+1-800-SMS-SaaS', '₹', 999, 15, 'Operational', 'v2.5.0 SaaS Enterprise')
            ON CONFLICT (id) DO NOTHING;
        `);

        // 4. Seed Default Super Admin Account
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        await client.query(`
            INSERT INTO shops (id, name, shop_name, shop_code, owner_id, address, phone, gst, currency, tax_rate, low_stock_alert, status)
            VALUES ('shop_default_hq', 'Main Headquarters', 'Main Headquarters', 'HQ001', 'usr_super_admin', '123 Central Business Ave', '9876543210', 'GSTIN12345678', '₹', 0, 5, 'active')
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO users (id, name, username, email, password, password_hash, role, shop_id, permissions, status)
            VALUES ('usr_super_admin', 'Super Admin', 'admin', 'admin@shop.com', $1, $1, 'Admin', 'shop_default_hq', '["*"]', 'active')
            ON CONFLICT (id) DO NOTHING;
        `, [hashedPassword]);

        await client.query('COMMIT');
        console.log("✨ Neon PostgreSQL Database & PL/pgSQL Routines Successfully Provisioned!");
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error("❌ Neon Database DDL Error:", err.message);
        throw err;
    } finally {
        client.release();
    }
    return pool;
};

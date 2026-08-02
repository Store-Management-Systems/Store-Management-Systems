-- Shop Management System Database Schema

CREATE TABLE IF NOT EXISTS shops (
    id TEXT PRIMARY KEY,
    shop_name TEXT NOT NULL,
    shop_code TEXT UNIQUE NOT NULL,
    owner_id TEXT,
    address TEXT,
    phone TEXT,
    gst TEXT,
    currency TEXT DEFAULT '₹',
    tax_rate REAL DEFAULT 0,
    logo TEXT,
    low_stock_alert INTEGER DEFAULT 5,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    shop_id TEXT NOT NULL,
    permissions TEXT DEFAULT '[]',
    status TEXT DEFAULT 'active',
    phone TEXT,
    force_password_change INTEGER DEFAULT 0,
    last_password_reset_at DATETIME,
    last_password_reset_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    name TEXT NOT NULL,
    permissions TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    unit TEXT,
    buy_price REAL DEFAULT 0,
    selling_price REAL DEFAULT 0,
    stock REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    gst TEXT,
    birthday TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    user_id TEXT,
    bill_number TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    subtotal REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    total REAL DEFAULT 0,
    payment_mode TEXT DEFAULT 'Cash',
    status TEXT DEFAULT 'Completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bill_items (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_logs (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    user_id TEXT,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    type TEXT NOT NULL,
    quantity REAL NOT NULL,
    reason TEXT,
    supplier TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    shop_id TEXT UNIQUE NOT NULL,
    shop_name TEXT NOT NULL,
    tagline TEXT,
    address TEXT,
    phone TEXT,
    gst TEXT,
    currency TEXT DEFAULT '₹',
    tax_rate REAL DEFAULT 0,
    logo TEXT,
    low_stock_alert INTEGER DEFAULT 5,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    owner_id TEXT,
    owner_name TEXT,
    email TEXT,
    phone TEXT,
    status TEXT DEFAULT 'active',
    subscription_plan TEXT DEFAULT 'Standard',
    subscription_status TEXT DEFAULT 'Active',
    subscription_start DATETIME DEFAULT CURRENT_TIMESTAMP,
    subscription_expiry DATETIME,
    price_per_branch REAL DEFAULT 999,
    active_branch_count INTEGER DEFAULT 0,
    subscription_amount REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    subscription_id TEXT UNIQUE NOT NULL,
    organization_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    plan_id TEXT DEFAULT 'monthly',
    plan_name TEXT DEFAULT 'Monthly Plan',
    subscription_amount REAL DEFAULT 999,
    payment_status TEXT DEFAULT 'Unpaid',
    payment_mode TEXT DEFAULT 'Cash',
    subscription_start DATETIME DEFAULT CURRENT_TIMESTAMP,
    renewal_date DATETIME,
    expiry_date DATETIME,
    auto_renew_enabled INTEGER DEFAULT 1,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_settings (
    id TEXT PRIMARY KEY,
    platform_name TEXT DEFAULT 'STORE MANAGEMENT SYSTEMS',
    platform_logo TEXT DEFAULT 'assets/logos/logo.png',
    support_email TEXT DEFAULT 'support@storemanagementsystems.com',
    support_phone TEXT DEFAULT '+1-800-SMS-SaaS',
    default_currency TEXT DEFAULT '₹',
    default_price_per_branch REAL DEFAULT 999,
    session_timeout_minutes INTEGER DEFAULT 15,
    system_status TEXT DEFAULT 'Operational',
    version TEXT DEFAULT 'v2.5.0 SaaS Enterprise',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


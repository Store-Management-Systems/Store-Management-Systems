"use strict";
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const connectionString = process.env.DATABASE_URL;
let dbWrapper;
if (connectionString && connectionString.startsWith('postgres')) {
    console.log('🌐 DATABASE_URL detected! Connecting to Neon PostgreSQL...');
    const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });
    function translateSql(sql) {
        let index = 1;
        let translated = sql.replace(/\?/g, () => `$${index++}`);
        const pragmaMatch = translated.match(/PRAGMA\s+table_info\((\w+)\)/i);
        if (pragmaMatch) {
            const tableName = pragmaMatch[1];
            return {
                isPragma: true,
                sql: `SELECT column_name as name FROM information_schema.columns WHERE table_name = '${tableName}'`
            };
        }
        translated = translated
            .replace(/datetime\('now',\s*'-(\d+)\s*days'\)/gi, "CURRENT_TIMESTAMP - INTERVAL '$1 days'")
            .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
        return { isPragma: false, sql: translated };
    }
    function sanitizeParams(params) {
        const rawArgs = Array.isArray(params[0]) ? params[0] : params;
        return rawArgs.map(v => (v === undefined ? null : v));
    }
    dbWrapper = {
        isPg: true,
        prepare: function (sql) {
            return {
                get: async function (...params) {
                    const args = sanitizeParams(params);
                    const { isPragma, sql: translated } = translateSql(sql);
                    const res = await pool.query(translated, args);
                    if (isPragma)
                        return res.rows;
                    return res.rows[0];
                },
                all: async function (...params) {
                    const args = sanitizeParams(params);
                    const { isPragma, sql: translated } = translateSql(sql);
                    const res = await pool.query(translated, args);
                    return res.rows;
                },
                run: async function (...params) {
                    const args = sanitizeParams(params);
                    const { sql: translated } = translateSql(sql);
                    const res = await pool.query(translated, args);
                    return { changes: res.rowCount, lastInsertRowid: null };
                }
            };
        },
        transaction: function (fn) {
            return async function (...args) {
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    const res = await fn(...args);
                    await client.query('COMMIT');
                    return res;
                }
                catch (err) {
                    await client.query('ROLLBACK');
                    throw err;
                }
                finally {
                    client.release();
                }
            };
        },
        exec: async function (sql) {
            return await pool.query(sql);
        },
        pragma: function () {
            return [];
        }
    };
    // Auto-init Neon DB
    const { initNeonDatabase } = require('./pgInit');
    initNeonDatabase().catch(err => console.error('Neon DB init error:', err));
}
else {
    console.log('📁 Using local SQLite database (database.db)...');
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '..', '..', '..', 'database.db');
    const sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = OFF');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    sqliteDb.exec(schemaSql);
    const addColIfMissing = (table, col, typeDef) => {
        try {
            const info = sqliteDb.pragma(`table_info(${table})`);
            if (!info.some(c => c.name === col)) {
                sqliteDb.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef}`);
            }
        }
        catch (e) { }
    };
    addColIfMissing('bills', 'payment_modes_split', 'TEXT');
    addColIfMissing('bills', 'updated_at', 'DATETIME');
    addColIfMissing('bills', 'cancelled_by', 'TEXT');
    addColIfMissing('bills', 'cancellation_reason', 'TEXT');
    addColIfMissing('bills', 'cancelled_at', 'DATETIME');
    addColIfMissing('bills', 'remarks', 'TEXT');
    addColIfMissing('shops', 'organization_id', 'TEXT');
    addColIfMissing('shops', 'owner_id', 'TEXT');
    addColIfMissing('shops', 'fssai', 'TEXT');
    addColIfMissing('shops', 'email', 'TEXT');
    addColIfMissing('shops', 'opening_date', 'DATE');
    addColIfMissing('shops', 'manager', 'TEXT');
    addColIfMissing('users', 'organization_id', 'TEXT');
    addColIfMissing('users', 'photo', 'TEXT');
    addColIfMissing('users', 'date_of_joining', 'DATE');
    addColIfMissing('users', 'salary', 'REAL DEFAULT 0');
    addColIfMissing('users', 'force_password_change', 'INTEGER DEFAULT 0');
    addColIfMissing('users', 'last_password_reset_at', 'DATETIME');
    addColIfMissing('users', 'last_password_reset_by', 'TEXT');
    addColIfMissing('organizations', 'subscription_plan', "TEXT DEFAULT 'Standard'");
    addColIfMissing('organizations', 'subscription_status', "TEXT DEFAULT 'Active'");
    addColIfMissing('organizations', 'subscription_start', 'DATETIME');
    addColIfMissing('organizations', 'subscription_expiry', 'DATETIME');
    addColIfMissing('organizations', 'branding_config', 'TEXT');
    addColIfMissing('shops', 'branding_config', 'TEXT');
    addColIfMissing('organizations', 'price_per_branch', 'REAL DEFAULT 999');
    addColIfMissing('organizations', 'active_branch_count', 'INTEGER DEFAULT 0');
    addColIfMissing('organizations', 'subscription_amount', 'REAL DEFAULT 0');
    try {
        sqliteDb.exec(`DROP TABLE IF EXISTS approvals;`);
        sqliteDb.exec(`DROP TABLE IF EXISTS audit_logs;`);
    }
    catch (e) { }
    try {
        sqliteDb.exec(`
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

            INSERT OR IGNORE INTO platform_settings (id, platform_name, platform_logo, support_email, support_phone, default_currency, default_price_per_branch, session_timeout_minutes, system_status, version)
            VALUES ('ps_global', 'STORE MANAGEMENT SYSTEMS', 'assets/logos/logo.png', 'support@storemanagementsystems.com', '+1-800-SMS-SaaS', '₹', 999, 15, 'Operational', 'v2.5.0 SaaS Enterprise');
        `);
    }
    catch (e) { }
    sqliteDb.pragma('foreign_keys = ON');
    dbWrapper = {
        isPg: false,
        prepare: function (sql) {
            const stmt = sqliteDb.prepare(sql);
            return {
                get: async function (...params) {
                    const args = Array.isArray(params[0]) ? params[0] : params;
                    return stmt.get(...args);
                },
                all: async function (...params) {
                    const args = Array.isArray(params[0]) ? params[0] : params;
                    return stmt.all(...args);
                },
                run: async function (...params) {
                    const args = Array.isArray(params[0]) ? params[0] : params;
                    return stmt.run(...args);
                }
            };
        },
        transaction: function (fn) {
            const tx = sqliteDb.transaction(fn);
            return async function (...args) {
                return tx(...args);
            };
        },
        exec: function (sql) { return sqliteDb.exec(sql); },
        pragma: function (p) { return sqliteDb.pragma(p); }
    };
}
module.exports = dbWrapper;

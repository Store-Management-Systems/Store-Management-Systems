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
                    if (isPragma) return res.rows;
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
                } catch (err) {
                    await client.query('ROLLBACK');
                    throw err;
                } finally {
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

} else {
    console.log('📁 Using local SQLite database (database.db)...');
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '..', 'database.db');
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
        } catch (e) {}
    };

    addColIfMissing('bills', 'payment_modes_split', 'TEXT');
    addColIfMissing('bills', 'updated_at', 'DATETIME');
    addColIfMissing('bills', 'cancelled_by', 'TEXT');
    addColIfMissing('bills', 'cancellation_reason', 'TEXT');
    addColIfMissing('bills', 'cancelled_at', 'DATETIME');
    addColIfMissing('bills', 'remarks', 'TEXT');

    addColIfMissing('shops', 'fssai', 'TEXT');
    addColIfMissing('shops', 'email', 'TEXT');
    addColIfMissing('shops', 'opening_date', 'DATE');
    addColIfMissing('shops', 'manager', 'TEXT');

    addColIfMissing('users', 'photo', 'TEXT');
    addColIfMissing('users', 'date_of_joining', 'DATE');
    addColIfMissing('users', 'salary', 'REAL DEFAULT 0');

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

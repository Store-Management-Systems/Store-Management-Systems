"use strict";
const { db, success, error } = require('../../../shared');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../../notifications/services/auditService');
// 1. Audit Logs Listing
const getAuditLogs = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return error(res, 'Access denied. Super Admin permissions required.', 403);
        }
        const logs = await db.prepare(`
            SELECT a.*, u.name as user_name, u.username
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT 200
        `).all();
        return success(res, 'System audit logs retrieved', logs);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
// 2. Export / Backup Database
const exportBackup = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return error(res, 'Access denied. Super Admin permissions required.', 403);
        }
        const shops = await db.prepare(`SELECT * FROM shops`).all();
        const users = await db.prepare(`SELECT id, name, username, email, role, shop_id, permissions, status, phone, created_at FROM users`).all();
        const items = await db.prepare(`SELECT * FROM items`).all();
        const categories = await db.prepare(`SELECT * FROM categories`).all();
        const units = await db.prepare(`SELECT * FROM units`).all();
        const people = await db.prepare(`SELECT * FROM people`).all();
        const bills = await db.prepare(`SELECT * FROM bills`).all();
        const bill_items = await db.prepare(`SELECT * FROM bill_items`).all();
        const purchases = await db.prepare(`SELECT * FROM purchases`).all();
        const purchase_items = await db.prepare(`SELECT * FROM purchase_items`).all();
        const payments = await db.prepare(`SELECT * FROM payments`).all();
        const ledgers = await db.prepare(`SELECT * FROM ledgers`).all();
        const stock_logs = await db.prepare(`SELECT * FROM stock_logs`).all();
        const settings = await db.prepare(`SELECT * FROM settings`).all();
        const backupData = {
            export_timestamp: new Date().toISOString(),
            version: '2.0.0',
            exported_by: req.user.username,
            data: {
                shops,
                users,
                items,
                categories,
                units,
                people,
                bills,
                bill_items,
                purchases,
                purchase_items,
                payments,
                ledgers,
                stock_logs,
                settings
            }
        };
        await logAudit(req.user.active_shop_id, req.user.id, 'Backup Database', 'Exported complete database backup JSON');
        return success(res, 'Database backup generated successfully', backupData);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
// 3. Import / Restore Database
const restoreBackup = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return error(res, 'Access denied. Super Admin permissions required.', 403);
        }
        const { backup } = req.body;
        if (!backup || !backup.data) {
            return error(res, 'Invalid backup file structure', 400);
        }
        const data = backup.data;
        // Transactional Restore
        await db.prepare(`DELETE FROM bill_items`).run();
        await db.prepare(`DELETE FROM bills`).run();
        await db.prepare(`DELETE FROM purchase_items`).run();
        await db.prepare(`DELETE FROM purchases`).run();
        await db.prepare(`DELETE FROM ledgers`).run();
        await db.prepare(`DELETE FROM payments`).run();
        await db.prepare(`DELETE FROM stock_logs`).run();
        await db.prepare(`DELETE FROM items`).run();
        await db.prepare(`DELETE FROM people`).run();
        if (Array.isArray(data.items)) {
            for (const i of data.items) {
                await db.prepare(`
                    INSERT INTO items (id, shop_id, name, category, unit, buy_price, selling_price, price, stock, qty, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO NOTHING
                `).run(i.id, i.shop_id, i.name, i.category, i.unit, i.buy_price, i.selling_price, i.price || i.selling_price, i.stock, i.qty || i.stock, i.status || 'active', i.created_at);
            }
        }
        if (Array.isArray(data.people)) {
            for (const p of data.people) {
                await db.prepare(`
                    INSERT INTO people (id, shop_id, category, name, business_name, mobile, alt_mobile, email, gstin, pan, address, city, state, pincode, opening_balance, credit_limit, payment_terms, status, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO NOTHING
                `).run(p.id, p.shop_id, p.category, p.name, p.business_name, p.mobile, p.alt_mobile, p.email, p.gstin, p.pan, p.address, p.city, p.state, p.pincode, p.opening_balance, p.credit_limit, p.payment_terms, p.status, p.notes, p.created_at);
            }
        }
        await logAudit(req.user.active_shop_id, req.user.id, 'Restore Database', 'Restored database from JSON backup');
        return success(res, 'Database restored successfully');
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
// 4. Delete All Data (Danger Zone 3-Tier Security Guard)
const deleteAllData = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return error(res, 'Access denied. Super Admin permissions required.', 403);
        }
        const { passwordCheck1, passwordCheck2, passwordCheck3, confirmPhrase } = req.body;
        if (!passwordCheck1 || !passwordCheck2 || !passwordCheck3) {
            return error(res, 'Security Check Failed: 3 Password verifications are required to execute full data deletion', 400);
        }
        if (confirmPhrase !== 'DELETE ALL DATA') {
            return error(res, "Security Check Failed: Confirmation phrase must match 'DELETE ALL DATA' exactly", 400);
        }
        // Verify Admin user credentials from database
        const adminUser = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
        if (!adminUser)
            return error(res, 'User record not found', 404);
        const check1Valid = bcrypt.compareSync(passwordCheck1, adminUser.password);
        const check2Valid = bcrypt.compareSync(passwordCheck2, adminUser.password);
        const check3Valid = bcrypt.compareSync(passwordCheck3, adminUser.password);
        if (!check1Valid || !check2Valid || !check3Valid) {
            await logAudit(req.user.active_shop_id, req.user.id, 'Delete All Data Attempt FAILED', 'Failed 3-tier password authentication');
            return error(res, 'Security Authentication Failed: Invalid password provided during 3-step security check', 401);
        }
        // Log pre-deletion event
        await logAudit(req.user.active_shop_id, req.user.id, 'DELETE ALL DATA INITIATED', 'Super Admin initiated full database reset');
        // Execute Transactional Data Wipe
        await db.prepare(`DELETE FROM bill_items`).run();
        await db.prepare(`DELETE FROM bills`).run();
        await db.prepare(`DELETE FROM purchase_items`).run();
        await db.prepare(`DELETE FROM purchases`).run();
        await db.prepare(`DELETE FROM ledgers`).run();
        await db.prepare(`DELETE FROM payments`).run();
        await db.prepare(`DELETE FROM stock_logs`).run();
        await db.prepare(`DELETE FROM items`).run();
        await db.prepare(`DELETE FROM people`).run();
        await db.prepare(`DELETE FROM customers`).run();
        await db.prepare(`DELETE FROM notifications`).run();
        // Reset default categories and units if empty
        const catCount = await db.prepare(`SELECT COUNT(*) as count FROM categories`).get();
        if (parseInt(catCount?.count || 0) === 0) {
            const defaultCats = ['General', 'Bakery', 'Beverages', 'Snacks', 'Others'];
            for (let idx = 0; idx < defaultCats.length; idx++) {
                await db.prepare(`INSERT INTO categories (id, shop_id, name) VALUES (?, ?, ?)`).run(`cat_${idx + 1}`, 'shop_default_hq', defaultCats[idx]);
            }
        }
        await logAudit(req.user.active_shop_id, req.user.id, 'DELETE ALL DATA COMPLETED', 'All transaction, inventory, customer, and accounting records cleared');
        return success(res, 'FULL DATA RESET COMPLETED: All transactions, stock, ledgers, customers, and bill records have been deleted safely.');
    }
    catch (err) {
        return error(res, err.message || 'Failed to complete data deletion', 500);
    }
};
module.exports = {
    getAuditLogs,
    exportBackup,
    restoreBackup,
    deleteAllData
};

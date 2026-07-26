const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { success, error } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const getShops = async (req, res) => {
    try {
        let shops = [];
        if (req.user.role === 'Admin') {
            shops = await db.prepare(`SELECT * FROM shops WHERE status != 'deleted' ORDER BY created_at DESC`).all();
        } else {
            shops = await db.prepare(`SELECT * FROM shops WHERE id = ? AND status != 'deleted'`).all(req.user.shop_id);
        }
        return success(res, 'Shops retrieved', shops);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const getShopById = async (req, res) => {
    try {
        const { id } = req.params;
        const shop = await db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id);
        if (!shop) {
            return error(res, 'Shop not found', 404);
        }
        return success(res, 'Shop details retrieved', shop);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const createShop = async (req, res) => {
    const {
        shop_name,
        shop_code,
        address,
        phone,
        email,
        gst,
        fssai,
        manager,
        opening_date,
        currency = '₹',
        tax_rate = 0,
        logo = null,
        low_stock_alert = 5,
        owner_name,
        owner_username,
        owner_password
    } = req.body;

    if (!shop_name || !shop_code) {
        return error(res, 'Shop name and shop code are required', 400);
    }

    try {
        const existingCode = await db.prepare(`SELECT id FROM shops WHERE shop_code = ?`).get(shop_code);
        if (existingCode) {
            return error(res, 'Shop code already exists', 400);
        }

        const shopId = 'shp_' + uuidv4().substring(0, 8);
        let ownerId = null;

        if (owner_username) {
            const existingUser = await db.prepare(`SELECT id FROM users WHERE username = ?`).get(owner_username);
            if (existingUser) {
                return error(res, 'Owner username already exists', 400);
            }
            ownerId = 'usr_' + uuidv4().substring(0, 8);
        }

        await db.prepare(`
            INSERT INTO shops (
                id, name, shop_name, shop_code, owner_id, address, phone, email, gst, fssai, manager, opening_date,
                currency, tax_rate, logo, low_stock_alert, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            shopId, shop_name, shop_name, shop_code, ownerId, address || '', phone || '', email || null,
            gst || '', fssai || null, manager || null, opening_date || null, currency,
            parseFloat(tax_rate) || 0, logo, parseInt(low_stock_alert) || 5, 'active'
        );

        if (owner_username && owner_password) {
            const hashed = bcrypt.hashSync(owner_password, 10);
            const ownerPermissions = JSON.stringify([
                'Dashboard', 'Inventory', 'Billing', 'Reports', 'Customers',
                'Stock In', 'Stock Out', 'Delete Item', 'Edit Item', 'Create Item',
                'Discount', 'Print Bill', 'Export Excel', 'Settings', 'Users',
                'Financial Reports', 'Categories', 'Units', 'Purchase Price',
                'Selling Price', 'History', 'Parties', 'Suppliers', 'Ledgers', 'Payments', 'Purchases'
            ]);

            await db.prepare(`
                INSERT INTO users (id, name, username, password, password_hash, role, shop_id, permissions, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(ownerId, owner_name || `${shop_name} Owner`, owner_username, hashed, hashed, 'Owner', shopId, ownerPermissions, 'active');
        }

        await db.prepare(`
            INSERT INTO settings (id, shop_id, shop_name, tagline, address, phone, gst, currency, tax_rate, logo, low_stock_alert)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('set_' + uuidv4().substring(0, 8), shopId, shop_name, 'Quality & Excellence', address || '', phone || '', gst || '', currency, parseFloat(tax_rate) || 0, logo, parseInt(low_stock_alert) || 5);

        const defaultCats = ['General', 'Bakery', 'Beverages', 'Snacks', 'Others'];
        for (let idx = 0; idx < defaultCats.length; idx++) {
            await db.prepare(`INSERT INTO categories (id, shop_id, name) VALUES (?, ?, ?)`).run(`cat_${shopId}_${idx}`, shopId, defaultCats[idx]);
        }

        const defaultUnits = ['Pcs', 'Kg', 'Grams', 'Ltr', 'Box', 'Pack'];
        for (let idx = 0; idx < defaultUnits.length; idx++) {
            await db.prepare(`INSERT INTO units (id, shop_id, name) VALUES (?, ?, ?)`).run(`unit_${shopId}_${idx}`, shopId, defaultUnits[idx]);
        }

        await logAudit(shopId, req.user.id, 'Create Shop', `Created new shop branch '${shop_name}' (${shop_code})`);
        return success(res, 'Shop branch created successfully', { shop_id: shopId, owner_id: ownerId }, 201);
    } catch (err) {
        return error(res, err.message || 'Failed to create shop', 400);
    }
};

const updateShop = async (req, res) => {
    const { id } = req.params;
    const { shop_name, address, phone, email, gst, fssai, manager, opening_date, currency, tax_rate, logo, low_stock_alert, status } = req.body;

    try {
        const shop = await db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id);
        if (!shop) {
            return error(res, 'Shop not found', 404);
        }

        await db.prepare(`
            UPDATE shops SET
                shop_name = COALESCE(?, shop_name),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                email = COALESCE(?, email),
                gst = COALESCE(?, gst),
                fssai = COALESCE(?, fssai),
                manager = COALESCE(?, manager),
                opening_date = COALESCE(?, opening_date),
                currency = COALESCE(?, currency),
                tax_rate = COALESCE(?, tax_rate),
                logo = COALESCE(?, logo),
                low_stock_alert = COALESCE(?, low_stock_alert),
                status = COALESCE(?, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(shop_name, address, phone, email, gst, fssai, manager, opening_date, currency, tax_rate, logo, low_stock_alert, status, id);

        await db.prepare(`
            UPDATE settings SET
                shop_name = COALESCE(?, shop_name),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                gst = COALESCE(?, gst),
                currency = COALESCE(?, currency),
                tax_rate = COALESCE(?, tax_rate),
                logo = COALESCE(?, logo),
                low_stock_alert = COALESCE(?, low_stock_alert),
                updated_at = CURRENT_TIMESTAMP
            WHERE shop_id = ?
        `).run(shop_name, address, phone, gst, currency, tax_rate, logo, low_stock_alert, id);

        await logAudit(id, req.user.id, 'Update Shop', `Updated branch details for ${shop.shop_name}`);
        return success(res, 'Shop updated successfully');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const toggleShopStatus = async (req, res) => {
    const { id } = req.params;
    try {
        const shop = await db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id);
        if (!shop) {
            return error(res, 'Shop not found', 404);
        }

        const newStatus = shop.status === 'active' ? 'disabled' : 'active';
        await db.prepare(`UPDATE shops SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newStatus, id);

        await logAudit(id, req.user.id, 'Toggle Shop Status', `Shop ${shop.shop_name} set to ${newStatus}`);
        return success(res, `Shop is now ${newStatus}`);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const deleteShop = async (req, res) => {
    const { id } = req.params;
    if (id === 'shop_default_hq') {
        return error(res, 'Cannot delete default main headquarters shop branch', 400);
    }

    try {
        const shop = await db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id);
        if (!shop) {
            return error(res, 'Shop not found', 404);
        }

        // Check if active transactions exist for this branch
        const billCount = await db.prepare(`SELECT COUNT(*) as count FROM bills WHERE shop_id = ? AND status != 'Cancelled'`).get(id);
        if (parseInt(billCount?.count || 0) > 0) {
            return error(res, `Cannot delete branch '${shop.shop_name}' because it contains ${billCount.count} active sales transactions`, 400);
        }

        await db.prepare(`UPDATE shops SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
        await logAudit(id, req.user.id, 'Delete Shop', `Soft deleted shop branch ${shop.shop_name}`);
        return success(res, 'Shop branch deleted successfully');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

module.exports = {
    getShops,
    getShopById,
    createShop,
    updateShop,
    toggleShopStatus,
    deleteShop
};

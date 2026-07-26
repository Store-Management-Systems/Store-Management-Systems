const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { success, error } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const getShops = (req, res) => {
    let shops = [];
    if (req.user.role === 'Admin') {
        shops = db.prepare(`SELECT * FROM shops WHERE status != 'deleted' ORDER BY created_at DESC`).all();
    } else {
        shops = db.prepare(`SELECT * FROM shops WHERE id = ? AND status != 'deleted'`).all(req.user.shop_id);
    }
    return success(res, 'Shops retrieved', shops);
};

const getShopById = (req, res) => {
    const { id } = req.params;
    const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id);
    if (!shop) {
        return error(res, 'Shop not found', 404);
    }
    return success(res, 'Shop details retrieved', shop);
};

const createShop = (req, res) => {
    const {
        shop_name,
        shop_code,
        address,
        phone,
        gst,
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

    const existingCode = db.prepare(`SELECT id FROM shops WHERE shop_code = ?`).get(shop_code);
    if (existingCode) {
        return error(res, 'Shop code already exists', 400);
    }

    const shopId = 'shp_' + uuidv4().substring(0, 8);
    let ownerId = null;

    if (owner_username) {
        const existingUser = db.prepare(`SELECT id FROM users WHERE username = ?`).get(owner_username);
        if (existingUser) {
            return error(res, 'Owner username already exists', 400);
        }
        ownerId = 'usr_' + uuidv4().substring(0, 8);
    }

    // Transaction for Shop + Owner User + Default Settings
    const createTx = db.transaction(() => {
        // 1. Create Shop FIRST so foreign keys referencing shopId succeed
        const shopCols = db.prepare(`PRAGMA table_info(shops)`).all();
        if (shopCols.some(col => col.name === 'name')) {
            db.prepare(`
                INSERT INTO shops (id, name, shop_name, shop_code, owner_id, address, phone, gst, currency, tax_rate, logo, low_stock_alert, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                shopId,
                shop_name,
                shop_name,
                shop_code,
                ownerId,
                address || '',
                phone || '',
                gst || '',
                currency,
                parseFloat(tax_rate) || 0,
                logo,
                parseInt(low_stock_alert) || 5,
                'active'
            );
        } else {
            db.prepare(`
                INSERT INTO shops (id, shop_name, shop_code, owner_id, address, phone, gst, currency, tax_rate, logo, low_stock_alert, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                shopId,
                shop_name,
                shop_code,
                ownerId,
                address || '',
                phone || '',
                gst || '',
                currency,
                parseFloat(tax_rate) || 0,
                logo,
                parseInt(low_stock_alert) || 5,
                'active'
            );
        }

        // 2. Create Owner User SECOND
        if (owner_username && owner_password) {
            const hashed = bcrypt.hashSync(owner_password, 10);
            const ownerPermissions = [
                'Dashboard', 'Inventory', 'Billing', 'Reports', 'Customers',
                'Stock In', 'Stock Out', 'Delete Item', 'Edit Item', 'Create Item',
                'Discount', 'Print Bill', 'Export Excel', 'Settings', 'Users',
                'Financial Reports', 'Categories', 'Units', 'Purchase Price',
                'Selling Price', 'History'
            ];

            const userCols = db.prepare(`PRAGMA table_info(users)`).all();
            if (userCols.some(col => col.name === 'password_hash')) {
                db.prepare(`
                    INSERT INTO users (id, name, username, password, password_hash, role, shop_id, permissions, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    ownerId,
                    owner_name || `${shop_name} Owner`,
                    owner_username,
                    hashed,
                    hashed,
                    'Owner',
                    shopId,
                    JSON.stringify(ownerPermissions),
                    'active'
                );
            } else {
                db.prepare(`
                    INSERT INTO users (id, name, username, password, role, shop_id, permissions, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    ownerId,
                    owner_name || `${shop_name} Owner`,
                    owner_username,
                    hashed,
                    'Owner',
                    shopId,
                    JSON.stringify(ownerPermissions),
                    'active'
                );
            }
        }

        // 3. Create Default Shop Settings
        db.prepare(`
            INSERT INTO settings (id, shop_id, shop_name, tagline, address, phone, gst, currency, tax_rate, logo, low_stock_alert)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'set_' + uuidv4().substring(0, 8),
            shopId,
            shop_name,
            'Quality & Excellence',
            address || '',
            phone || '',
            gst || '',
            currency,
            parseFloat(tax_rate) || 0,
            logo,
            parseInt(low_stock_alert) || 5
        );

        // 4. Seed Default Categories and Units for new shop
        const defaultCats = ['General', 'Bakery', 'Beverages', 'Snacks', 'Others'];
        const insertCat = db.prepare(`INSERT INTO categories (id, shop_id, name) VALUES (?, ?, ?)`);
        defaultCats.forEach((c, idx) => insertCat.run(`cat_${shopId}_${idx}`, shopId, c));

        const defaultUnits = ['Pcs', 'Kg', 'Grams', 'Ltr', 'Box', 'Pack'];
        const insertUnit = db.prepare(`INSERT INTO units (id, shop_id, name) VALUES (?, ?, ?)`);
        defaultUnits.forEach((u, idx) => insertUnit.run(`unit_${shopId}_${idx}`, shopId, u));
    });

    try {
        createTx();
        logAudit(shopId, req.user.id, 'Create Shop', `Created new shop '${shop_name}' (${shop_code})`);
        return success(res, 'Shop created successfully', { shop_id: shopId, owner_id: ownerId }, 201);
    } catch (err) {
        return error(res, err.message || 'Failed to create shop', 400);
    }
};

const updateShop = (req, res) => {
    const { id } = req.params;
    const { shop_name, address, phone, gst, currency, tax_rate, logo, low_stock_alert, status } = req.body;

    const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id);
    if (!shop) {
        return error(res, 'Shop not found', 404);
    }

    const shopCols = db.prepare(`PRAGMA table_info(shops)`).all();
    const hasUpdatedAt = shopCols.some(col => col.name === 'updated_at');

    if (hasUpdatedAt) {
        db.prepare(`
            UPDATE shops SET
                shop_name = COALESCE(?, shop_name),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                gst = COALESCE(?, gst),
                currency = COALESCE(?, currency),
                tax_rate = COALESCE(?, tax_rate),
                logo = COALESCE(?, logo),
                low_stock_alert = COALESCE(?, low_stock_alert),
                status = COALESCE(?, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(shop_name, address, phone, gst, currency, tax_rate, logo, low_stock_alert, status, id);
    } else {
        db.prepare(`
            UPDATE shops SET
                shop_name = COALESCE(?, shop_name),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                gst = COALESCE(?, gst),
                currency = COALESCE(?, currency),
                tax_rate = COALESCE(?, tax_rate),
                logo = COALESCE(?, logo),
                low_stock_alert = COALESCE(?, low_stock_alert),
                status = COALESCE(?, status)
            WHERE id = ?
        `).run(shop_name, address, phone, gst, currency, tax_rate, logo, low_stock_alert, status, id);
    }

    // Keep settings in sync
    const settingCols = db.prepare(`PRAGMA table_info(settings)`).all();
    if (settingCols.some(col => col.name === 'updated_at')) {
        db.prepare(`
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
    } else {
        db.prepare(`
            UPDATE settings SET
                shop_name = COALESCE(?, shop_name),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                gst = COALESCE(?, gst),
                currency = COALESCE(?, currency),
                tax_rate = COALESCE(?, tax_rate),
                logo = COALESCE(?, logo),
                low_stock_alert = COALESCE(?, low_stock_alert)
            WHERE shop_id = ?
        `).run(shop_name, address, phone, gst, currency, tax_rate, logo, low_stock_alert, id);
    }

    logAudit(id, req.user.id, 'Update Shop', `Updated shop details for ${shop.shop_name}`);
    return success(res, 'Shop updated successfully');
};

const toggleShopStatus = (req, res) => {
    const { id } = req.params;
    const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id);
    if (!shop) {
        return error(res, 'Shop not found', 404);
    }

    const newStatus = shop.status === 'active' ? 'disabled' : 'active';
    const shopCols = db.prepare(`PRAGMA table_info(shops)`).all();
    if (shopCols.some(col => col.name === 'updated_at')) {
        db.prepare(`UPDATE shops SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newStatus, id);
    } else {
        db.prepare(`UPDATE shops SET status = ? WHERE id = ?`).run(newStatus, id);
    }

    logAudit(id, req.user.id, 'Toggle Shop Status', `Shop ${shop.shop_name} set to ${newStatus}`);
    return success(res, `Shop is now ${newStatus}`);
};

const deleteShop = (req, res) => {
    const { id } = req.params;
    if (id === 'shop_default_hq') {
        return error(res, 'Cannot delete default main headquarters shop', 400);
    }

    const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(id);
    if (!shop) {
        return error(res, 'Shop not found', 404);
    }

    const shopCols = db.prepare(`PRAGMA table_info(shops)`).all();
    if (shopCols.some(col => col.name === 'updated_at')) {
        db.prepare(`UPDATE shops SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    } else {
        db.prepare(`UPDATE shops SET status = 'deleted' WHERE id = ?`).run(id);
    }

    logAudit(id, req.user.id, 'Delete Shop', `Soft deleted shop ${shop.shop_name}`);
    return success(res, 'Shop deleted successfully');
};

module.exports = {
    getShops,
    getShopById,
    createShop,
    updateShop,
    toggleShopStatus,
    deleteShop
};

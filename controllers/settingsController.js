const db = require('../database/init');
const { success, error } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const getSettings = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;
        let settings = await db.prepare(`SELECT * FROM settings WHERE shop_id = ?`).get(targetShop);
        if (!settings) {
            const shop = await db.prepare(`SELECT * FROM shops WHERE id = ?`).get(targetShop);
            settings = {
                shop_id: targetShop,
                shop_name: shop ? (shop.shop_name || shop.name) : 'Main Shop',
                currency: shop ? shop.currency : '₹',
                tax_rate: shop ? shop.tax_rate : 0,
                low_stock_alert: shop ? shop.low_stock_alert : 5
            };
        }
        return success(res, 'Settings retrieved', settings);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const updateSettings = async (req, res) => {
    const { name, tagline, address, phone, gst, currency, taxRate, logo, lowStockAlert } = req.body;
    const targetShop = req.user.active_shop_id;

    try {
        await db.prepare(`
            UPDATE settings SET
                shop_name = COALESCE(?, shop_name),
                tagline = COALESCE(?, tagline),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                gst = COALESCE(?, gst),
                currency = COALESCE(?, currency),
                tax_rate = COALESCE(?, tax_rate),
                logo = COALESCE(?, logo),
                low_stock_alert = COALESCE(?, low_stock_alert),
                updated_at = CURRENT_TIMESTAMP
            WHERE shop_id = ?
        `).run(name, tagline, address, phone, gst, currency, taxRate, logo, lowStockAlert, targetShop);

        await db.prepare(`
            UPDATE shops SET
                shop_name = COALESCE(?, shop_name),
                name = COALESCE(?, name),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                gst = COALESCE(?, gst),
                currency = COALESCE(?, currency),
                tax_rate = COALESCE(?, tax_rate),
                logo = COALESCE(?, logo),
                low_stock_alert = COALESCE(?, low_stock_alert),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, name, address, phone, gst, currency, taxRate, logo, lowStockAlert, targetShop);

        await logAudit(targetShop, req.user.id, 'Update Settings', 'Updated shop settings and profile');
        return success(res, 'Settings updated successfully');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

module.exports = { getSettings, updateSettings };

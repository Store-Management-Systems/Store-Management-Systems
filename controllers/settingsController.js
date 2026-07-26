const db = require('../database/init');
const { success, error } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const getSettings = (req, res) => {
    const shopId = req.user.active_shop_id;

    let settings = db.prepare(`SELECT * FROM settings WHERE shop_id = ?`).get(shopId);

    if (!settings) {
        const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(shopId);
        if (shop) {
            db.prepare(`
                INSERT INTO settings (id, shop_id, shop_name, address, phone, gst, currency, tax_rate, logo, low_stock_alert)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run('set_' + shopId, shopId, shop.shop_name, shop.address, shop.phone, shop.gst, shop.currency, shop.tax_rate, shop.logo, shop.low_stock_alert);

            settings = db.prepare(`SELECT * FROM settings WHERE shop_id = ?`).get(shopId);
        }
    }

    if (!settings) {
        return error(res, 'Settings not found', 404);
    }

    return success(res, 'Settings retrieved', {
        name: settings.shop_name,
        tagline: settings.tagline || '',
        address: settings.address || '',
        phone: settings.phone || '',
        gst: settings.gst || '',
        currency: settings.currency || '₹',
        taxRate: settings.tax_rate || 0,
        logo: settings.logo || null,
        lowStockAlert: settings.low_stock_alert || 5
    });
};

const updateSettings = (req, res) => {
    const shopId = req.user.active_shop_id;
    const { name, shop_name, tagline, address, phone, gst, currency, taxRate, tax_rate, logo, lowStockAlert, low_stock_alert } = req.body;

    const finalName = name || shop_name;
    const finalTaxRate = taxRate !== undefined ? parseFloat(taxRate) : (tax_rate !== undefined ? parseFloat(tax_rate) : undefined);
    const finalLowStock = lowStockAlert !== undefined ? parseInt(lowStockAlert) : (low_stock_alert !== undefined ? parseInt(low_stock_alert) : undefined);

    db.transaction(() => {
        db.prepare(`
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
        `).run(
            finalName, tagline, address, phone, gst, currency, finalTaxRate, logo, finalLowStock, shopId
        );

        // Keep shops table in sync
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
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            finalName, address, phone, gst, currency, finalTaxRate, logo, finalLowStock, shopId
        );
    })();

    logAudit(shopId, req.user.id, 'Update Settings', 'Updated shop profile and settings');
    return success(res, 'Settings updated successfully');
};

module.exports = {
    getSettings,
    updateSettings
};

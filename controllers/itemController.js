const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const getItems = (req, res) => {
    const shopId = req.user.active_shop_id;
    const { search, category, low_stock, page = 1, limit = 100 } = req.query;

    let sql = `SELECT * FROM items WHERE shop_id = ? AND status = 'active'`;
    const params = [shopId];

    if (search) {
        sql += ` AND name LIKE ?`;
        params.push(`%${search}%`);
    }

    if (category && category !== 'All') {
        sql += ` AND category = ?`;
        params.push(category);
    }

    if (low_stock === 'true' || low_stock === '1') {
        const shop = db.prepare(`SELECT low_stock_alert FROM shops WHERE id = ?`).get(shopId);
        const threshold = shop ? shop.low_stock_alert : 5;
        sql += ` AND stock <= ?`;
        params.push(threshold);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const items = db.prepare(sql).all(...params);

    // Get count
    let countSql = `SELECT COUNT(*) as total FROM items WHERE shop_id = ? AND status = 'active'`;
    const countParams = [shopId];
    if (search) { countSql += ` AND name LIKE ?`; countParams.push(`%${search}%`); }
    if (category && category !== 'All') { countSql += ` AND category = ?`; countParams.push(category); }
    const totalCount = db.prepare(countSql).get(...countParams).total;

    return success(res, 'Items retrieved', items, 200, { total: totalCount, page: parseInt(page), limit: parseInt(limit) });
};

const getItemById = (req, res) => {
    const { id } = req.params;
    const shopId = req.user.active_shop_id;
    const item = db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ? AND status = 'active'`).get(id, shopId);

    if (!item) {
        return error(res, 'Item not found', 404);
    }

    return success(res, 'Item retrieved', item);
};

const createItem = (req, res) => {
    const shopId = req.user.active_shop_id;
    let { name, category = 'General', unit = 'Pcs', buy_price = 0, selling_price = 0, buyPrice, price, stock = 0, qty } = req.body;

    // Backwards compatibility for payload field names
    buy_price = parseFloat(buy_price !== undefined ? buy_price : (buyPrice || 0));
    selling_price = parseFloat(selling_price !== undefined ? selling_price : (price || 0));
    stock = parseFloat(stock !== undefined ? stock : (qty || 0));

    // Validation
    if (!name || name.trim() === '') {
        return error(res, 'Item name is required', 400);
    }
    if (name.length > 150) {
        return error(res, 'Item name cannot exceed 150 characters', 400);
    }
    if (isNaN(buy_price) || buy_price < 0) {
        return error(res, 'Buying price cannot be negative', 400);
    }
    if (isNaN(selling_price) || selling_price < 0) {
        return error(res, 'Selling price cannot be negative', 400);
    }
    if (isNaN(stock) || stock < 0) {
        return error(res, 'Stock cannot be negative', 400);
    }

    let warning = null;
    if (buy_price > selling_price) {
        warning = 'Warning: Buying price is greater than selling price';
    }

    const itemId = 'itm_' + uuidv4().substring(0, 8);

    db.transaction(() => {
        db.prepare(`
            INSERT INTO items (id, shop_id, name, category, unit, buy_price, selling_price, stock, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(itemId, shopId, name.trim(), category, unit, buy_price, selling_price, stock, 'active');

        // Log initial stock if stock > 0
        if (stock > 0) {
            db.prepare(`
                INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, reason, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run('stk_' + uuidv4().substring(0, 8), shopId, req.user.id, itemId, name.trim(), 'in', stock, 'Initial Stock', 'Added during item creation');
        }
    })();

    logAudit(shopId, req.user.id, 'Add Item', `Added item '${name}' with initial stock ${stock}`);

    return success(res, 'Item created successfully', {
        id: itemId,
        name: name.trim(),
        category,
        unit,
        buy_price,
        selling_price,
        stock,
        warning
    }, 201);
};

const updateItem = (req, res) => {
    const { id } = req.params;
    const shopId = req.user.active_shop_id;

    const existing = db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ?`).get(id, shopId);
    if (!existing) {
        return error(res, 'Item not found', 404);
    }

    let { name, category, unit, buy_price, selling_price, buyPrice, price, stock, qty } = req.body;

    name = name !== undefined ? name.trim() : existing.name;
    category = category !== undefined ? category : existing.category;
    unit = unit !== undefined ? unit : existing.unit;
    buy_price = parseFloat(buy_price !== undefined ? buy_price : (buyPrice !== undefined ? buyPrice : existing.buy_price));
    selling_price = parseFloat(selling_price !== undefined ? selling_price : (price !== undefined ? price : existing.selling_price));
    stock = parseFloat(stock !== undefined ? stock : (qty !== undefined ? qty : existing.stock));

    if (name.length > 150) return error(res, 'Item name cannot exceed 150 characters', 400);
    if (buy_price < 0) return error(res, 'Buying price cannot be negative', 400);
    if (selling_price < 0) return error(res, 'Selling price cannot be negative', 400);
    if (stock < 0) return error(res, 'Stock cannot be negative', 400);

    const oldStock = existing.stock;

    db.transaction(() => {
        db.prepare(`
            UPDATE items SET
                name = ?,
                category = ?,
                unit = ?,
                buy_price = ?,
                selling_price = ?,
                stock = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND shop_id = ?
        `).run(name, category, unit, buy_price, selling_price, stock, id, shopId);

        // Record stock adjustment log if stock was changed manually
        if (stock !== oldStock) {
            const diff = stock - oldStock;
            db.prepare(`
                INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, reason, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'stk_' + uuidv4().substring(0, 8),
                shopId,
                req.user.id,
                id,
                name,
                diff > 0 ? 'in' : 'out',
                Math.abs(diff),
                'Manual Adjustment',
                `Stock updated from ${oldStock} to ${stock}`
            );
        }
    })();

    logAudit(shopId, req.user.id, 'Edit Item', `Updated item '${name}'`);
    return success(res, 'Item updated successfully');
};

const deleteItem = (req, res) => {
    const { id } = req.params;
    const shopId = req.user.active_shop_id;

    const item = db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ?`).get(id, shopId);
    if (!item) {
        return error(res, 'Item not found', 404);
    }

    db.prepare(`UPDATE items SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?`).run(id, shopId);

    logAudit(shopId, req.user.id, 'Delete Item', `Deleted item '${item.name}'`);
    return success(res, 'Item deleted successfully');
};

module.exports = {
    getItems,
    getItemById,
    createItem,
    updateItem,
    deleteItem
};

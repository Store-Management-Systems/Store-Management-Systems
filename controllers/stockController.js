const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const stockIn = (req, res) => {
    const shopId = req.user.active_shop_id;
    const { itemId, item_id, quantity, qty, supplier, notes } = req.body;

    const targetId = itemId || item_id;
    const amount = parseFloat(quantity || qty);

    if (!targetId || isNaN(amount) || amount <= 0) {
        return error(res, 'Valid item ID and positive quantity are required', 400);
    }

    const item = db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ? AND status = 'active'`).get(targetId, shopId);
    if (!item) {
        return error(res, 'Item not found', 404);
    }

    db.transaction(() => {
        db.prepare(`UPDATE items SET stock = stock + ? WHERE id = ? AND shop_id = ?`).run(amount, targetId, shopId);

        db.prepare(`
            INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, supplier, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'stk_' + uuidv4().substring(0, 8),
            shopId,
            req.user.id,
            targetId,
            item.name,
            'in',
            amount,
            supplier || '',
            notes || ''
        );
    })();

    logAudit(shopId, req.user.id, 'Stock In', `Added ${amount} ${item.unit} to ${item.name}`);
    return success(res, `Successfully added ${amount} ${item.unit} to ${item.name}`);
};

const stockOut = (req, res) => {
    const shopId = req.user.active_shop_id;
    const { itemId, item_id, quantity, qty, reason = 'Sold', notes } = req.body;

    const targetId = itemId || item_id;
    const amount = parseFloat(quantity || qty);

    if (!targetId || isNaN(amount) || amount <= 0) {
        return error(res, 'Valid item ID and positive quantity are required', 400);
    }

    const item = db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ? AND status = 'active'`).get(targetId, shopId);
    if (!item) {
        return error(res, 'Item not found', 404);
    }

    if (item.stock < amount) {
        return error(res, `Insufficient stock! Only ${item.stock} ${item.unit} available in inventory`, 400);
    }

    db.transaction(() => {
        db.prepare(`UPDATE items SET stock = MAX(0, stock - ?) WHERE id = ? AND shop_id = ?`).run(amount, targetId, shopId);

        db.prepare(`
            INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, reason, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'stk_' + uuidv4().substring(0, 8),
            shopId,
            req.user.id,
            targetId,
            item.name,
            'out',
            amount,
            reason,
            notes || ''
        );
    })();

    logAudit(shopId, req.user.id, 'Stock Out', `Removed ${amount} ${item.unit} from ${item.name}`);
    return success(res, `Successfully removed ${amount} ${item.unit} from ${item.name}`);
};

const adjustStock = (req, res) => {
    const shopId = req.user.active_shop_id;
    const { itemId, item_id, newQuantity, new_quantity, reason = 'Manual Audit', notes } = req.body;

    const targetId = itemId || item_id;
    const targetQty = parseFloat(newQuantity !== undefined ? newQuantity : new_quantity);

    if (!targetId || isNaN(targetQty) || targetQty < 0) {
        return error(res, 'Valid item ID and non-negative quantity required', 400);
    }

    const item = db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ? AND status = 'active'`).get(targetId, shopId);
    if (!item) {
        return error(res, 'Item not found', 404);
    }

    const diff = targetQty - item.stock;

    db.transaction(() => {
        db.prepare(`UPDATE items SET stock = ? WHERE id = ? AND shop_id = ?`).run(targetQty, targetId, shopId);

        db.prepare(`
            INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, reason, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'stk_' + uuidv4().substring(0, 8),
            shopId,
            req.user.id,
            targetId,
            item.name,
            diff >= 0 ? 'in' : 'out',
            Math.abs(diff),
            reason,
            notes || `Adjusted stock from ${item.stock} to ${targetQty}`
        );
    })();

    logAudit(shopId, req.user.id, 'Stock Adjust', `Adjusted ${item.name} stock to ${targetQty}`);
    return success(res, `Stock adjusted to ${targetQty} ${item.unit}`);
};

const transferStock = (req, res) => {
    const sourceShopId = req.user.active_shop_id;
    const { itemId, item_id, targetShopId, target_shop_id, quantity, qty, notes } = req.body;

    const sourceItemId = itemId || item_id;
    const destShopId = targetShopId || target_shop_id;
    const amount = parseFloat(quantity || qty);

    if (!sourceItemId || !destShopId || isNaN(amount) || amount <= 0) {
        return error(res, 'Source item, target shop, and valid quantity required', 400);
    }

    if (sourceShopId === destShopId) {
        return error(res, 'Target shop must be different from source shop', 400);
    }

    const sourceItem = db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ? AND status = 'active'`).get(sourceItemId, sourceShopId);
    if (!sourceItem) {
        return error(res, 'Source item not found', 404);
    }

    if (sourceItem.stock < amount) {
        return error(res, `Insufficient stock to transfer. Only ${sourceItem.stock} ${sourceItem.unit} available`, 400);
    }

    const destShop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(destShopId);
    if (!destShop) {
        return error(res, 'Target shop not found', 404);
    }

    db.transaction(() => {
        // 1. Deduct from source shop
        db.prepare(`UPDATE items SET stock = stock - ? WHERE id = ? AND shop_id = ?`).run(amount, sourceItemId, sourceShopId);

        // 2. Add or update item in target shop
        let destItem = db.prepare(`SELECT * FROM items WHERE shop_id = ? AND LOWER(name) = LOWER(?) AND status = 'active'`).get(destShopId, sourceItem.name);
        let destItemId;
        if (destItem) {
            destItemId = destItem.id;
            db.prepare(`UPDATE items SET stock = stock + ? WHERE id = ? AND shop_id = ?`).run(amount, destItemId, destShopId);
        } else {
            destItemId = 'itm_' + uuidv4().substring(0, 8);
            db.prepare(`
                INSERT INTO items (id, shop_id, name, category, unit, buy_price, selling_price, stock, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(destItemId, destShopId, sourceItem.name, sourceItem.category, sourceItem.unit, sourceItem.buy_price, sourceItem.selling_price, amount, 'active');
        }

        // 3. Create logs in both shops
        db.prepare(`
            INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, reason, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('stk_' + uuidv4().substring(0, 8), sourceShopId, req.user.id, sourceItemId, sourceItem.name, 'out', amount, 'Stock Transfer', `Transferred to ${destShop.shop_name}`);

        db.prepare(`
            INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, reason, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('stk_' + uuidv4().substring(0, 8), destShopId, req.user.id, destItemId, sourceItem.name, 'in', amount, 'Stock Transfer', `Received from shop ${sourceShopId}`);
    })();

    logAudit(sourceShopId, req.user.id, 'Stock Transfer', `Transferred ${amount} ${sourceItem.unit} of ${sourceItem.name} to ${destShop.shop_name}`);
    return success(res, `Transferred ${amount} ${sourceItem.unit} to ${destShop.shop_name}`);
};

const getStockLogs = (req, res) => {
    const shopId = req.user.active_shop_id;
    const { search, type, from, to, page = 1, limit = 100 } = req.query;

    let sql = `SELECT sl.*, u.name as user_name FROM stock_logs sl LEFT JOIN users u ON sl.user_id = u.id WHERE sl.shop_id = ?`;
    const params = [shopId];

    if (search) {
        sql += ` AND (sl.item_name LIKE ? OR sl.reason LIKE ? OR sl.notes LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (type) {
        sql += ` AND sl.type = ?`;
        params.push(type);
    }

    if (from) {
        sql += ` AND date(sl.created_at) >= date(?)`;
        params.push(from);
    }

    if (to) {
        sql += ` AND date(sl.created_at) <= date(?)`;
        params.push(to);
    }

    sql += ` ORDER BY sl.created_at DESC LIMIT ? OFFSET ?`;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const logs = db.prepare(sql).all(...params);
    logs.forEach(l => {
        l.date = l.created_at;
        l.itemName = l.item_name;
        l.qty = l.quantity;
    });

    return success(res, 'Stock logs retrieved', logs);
};

module.exports = {
    stockIn,
    stockOut,
    adjustStock,
    transferStock,
    getStockLogs
};

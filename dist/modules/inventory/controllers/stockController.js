"use strict";
const { db, success, error } = require('../../../shared');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../../notifications/services/auditService');
const stockIn = async (req, res) => {
    const { itemId, qty, supplier, notes } = req.body;
    if (!itemId || !qty || parseFloat(qty) <= 0) {
        return error(res, 'Item ID and positive quantity are required', 400);
    }
    const targetShop = req.user.active_shop_id;
    const addQty = parseFloat(qty);
    try {
        const item = await db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ?`).get(itemId, targetShop);
        if (!item)
            return error(res, 'Item not found', 404);
        await db.prepare(`UPDATE items SET stock = stock + ?, qty = qty + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?`).run(addQty, addQty, itemId, targetShop);
        const logId = 'log_' + uuidv4().substring(0, 8);
        await db.prepare(`
            INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, qty, supplier, notes)
            VALUES (?, ?, ?, ?, ?, 'in', ?, ?, ?, ?)
        `).run(logId, targetShop, req.user.id, itemId, item.name, addQty, addQty, supplier || null, notes || 'Manual Stock In');
        await logAudit(targetShop, req.user.id, 'Stock In', `Added ${addQty} ${item.unit} to '${item.name}'`);
        return success(res, 'Stock added successfully');
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const stockOut = async (req, res) => {
    const { itemId, qty, reason = 'Other', notes } = req.body;
    if (!itemId || !qty || parseFloat(qty) <= 0) {
        return error(res, 'Item ID and positive quantity are required', 400);
    }
    const targetShop = req.user.active_shop_id;
    const removeQty = parseFloat(qty);
    try {
        const item = await db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ?`).get(itemId, targetShop);
        if (!item)
            return error(res, 'Item not found', 404);
        await db.prepare(`UPDATE items SET stock = GREATEST(0, stock - ?), qty = GREATEST(0, qty - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?`).run(removeQty, removeQty, itemId, targetShop);
        const logId = 'log_' + uuidv4().substring(0, 8);
        await db.prepare(`
            INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, qty, reason, notes)
            VALUES (?, ?, ?, ?, ?, 'out', ?, ?, ?, ?)
        `).run(logId, targetShop, req.user.id, itemId, item.name, removeQty, removeQty, reason, notes || 'Manual Stock Out');
        await logAudit(targetShop, req.user.id, 'Stock Out', `Removed ${removeQty} ${item.unit} from '${item.name}' (${reason})`);
        return success(res, 'Stock removed successfully');
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const adjustStock = async (req, res) => {
    const { itemId, newStock, reason = 'Inventory Count' } = req.body;
    if (!itemId || newStock === undefined)
        return error(res, 'Item ID and new stock count required', 400);
    const targetShop = req.user.active_shop_id;
    const stockVal = parseFloat(newStock) || 0;
    try {
        const item = await db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ?`).get(itemId, targetShop);
        if (!item)
            return error(res, 'Item not found', 404);
        const diff = stockVal - parseFloat(item.stock || 0);
        await db.prepare(`UPDATE items SET stock = ?, qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?`).run(stockVal, stockVal, itemId, targetShop);
        const logId = 'log_' + uuidv4().substring(0, 8);
        await db.prepare(`
            INSERT INTO stock_logs (id, shop_id, user_id, item_id, item_name, type, quantity, qty, reason, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(logId, targetShop, req.user.id, itemId, item.name, diff >= 0 ? 'in' : 'out', Math.abs(diff), Math.abs(diff), reason, `Stock adjusted to ${stockVal}`);
        return success(res, 'Stock adjusted successfully');
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const transferStock = async (req, res) => {
    const { itemId, targetShopId, qty } = req.body;
    if (!itemId || !targetShopId || !qty || parseFloat(qty) <= 0) {
        return error(res, 'Item ID, target shop ID, and quantity required', 400);
    }
    const sourceShop = req.user.active_shop_id;
    const transferQty = parseFloat(qty);
    try {
        const item = await db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ?`).get(itemId, sourceShop);
        if (!item)
            return error(res, 'Item not found in source shop', 404);
        if (parseFloat(item.stock) < transferQty) {
            return error(res, `Insufficient stock (${item.stock} available)`, 400);
        }
        // Deduct from source shop
        await db.prepare(`UPDATE items SET stock = stock - ?, qty = qty - ? WHERE id = ? AND shop_id = ?`).run(transferQty, transferQty, itemId, sourceShop);
        // Add to target shop (find or create)
        const targetItem = await db.prepare(`SELECT id FROM items WHERE LOWER(name) = LOWER(?) AND shop_id = ? AND status = 'active'`).get(item.name, targetShopId);
        if (targetItem) {
            await db.prepare(`UPDATE items SET stock = stock + ?, qty = qty + ? WHERE id = ? AND shop_id = ?`).run(transferQty, transferQty, targetItem.id, targetShopId);
        }
        else {
            const newItemId = 'itm_' + uuidv4().substring(0, 8);
            await db.prepare(`
                INSERT INTO items (id, shop_id, name, category, unit, buy_price, selling_price, price, stock, qty, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
            `).run(newItemId, targetShopId, item.name, item.category, item.unit, item.buy_price, item.selling_price, item.selling_price, transferQty, transferQty);
        }
        await logAudit(sourceShop, req.user.id, 'Stock Transfer', `Transferred ${transferQty} of '${item.name}' to shop ${targetShopId}`);
        return success(res, 'Stock transferred successfully');
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const getStockLogs = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;
        const logs = await db.prepare(`SELECT * FROM stock_logs WHERE shop_id = ? ORDER BY created_at DESC LIMIT 100`).all(targetShop);
        return success(res, 'Stock logs retrieved', logs);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
module.exports = { stockIn, stockOut, adjustStock, transferStock, getStockLogs };

const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const getItems = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;
        const search = req.query.search || '';
        const category = req.query.category || '';

        let sql = `SELECT * FROM items WHERE shop_id = ? AND status = 'active'`;
        const params = [targetShop];

        if (search) {
            sql += ` AND LOWER(name) LIKE ?`;
            params.push(`%${search.toLowerCase()}%`);
        }
        if (category && category !== 'All') {
            sql += ` AND category = ?`;
            params.push(category);
        }

        sql += ` ORDER BY created_at DESC`;

        const items = await db.prepare(sql).all(params);
        return success(res, 'Items retrieved successfully', items);
    } catch (err) {
        return error(res, err.message || 'Failed to retrieve items', 500);
    }
};

const getItemById = async (req, res) => {
    const { id } = req.params;
    try {
        const item = await db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ?`).get(id, req.user.active_shop_id);
        if (!item) {
            return error(res, 'Item not found', 404);
        }
        return success(res, 'Item details retrieved', item);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const createItem = async (req, res) => {
    const { name, category = 'General', unit = 'Pcs', buy_price = 0, selling_price = 0, stock = 0 } = req.body;

    if (!name) {
        return error(res, 'Item name is required', 400);
    }

    const buyPriceNum = parseFloat(buy_price) || 0;
    const sellingPriceNum = parseFloat(selling_price) || 0;
    const stockNum = parseFloat(stock) || 0;
    const activeShop = req.user.active_shop_id;

    try {
        const existing = await db.prepare(`SELECT id FROM items WHERE LOWER(name) = LOWER(?) AND shop_id = ? AND status = 'active'`).get(name, activeShop);
        if (existing) {
            return error(res, `An item with the name '${name}' already exists in this shop`, 400);
        }

        const itemId = 'itm_' + uuidv4().substring(0, 8);

        await db.prepare(`
            INSERT INTO items (id, shop_id, name, category, unit, buy_price, selling_price, price, stock, qty, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            itemId, activeShop, name, category, unit, buyPriceNum, sellingPriceNum, sellingPriceNum, stockNum, stockNum, 'active'
        );

        let warning = null;
        if (buyPriceNum > 0 && sellingPriceNum < buyPriceNum) {
            warning = `⚠ Warning: Selling price (${sellingPriceNum}) is lower than buying price (${buyPriceNum})!`;
        }

        await logAudit(activeShop, req.user.id, 'Create Item', `Added item '${name}' (Selling: ${sellingPriceNum}, Stock: ${stockNum})`);

        return success(res, 'Item created successfully', {
            id: itemId,
            name,
            category,
            unit,
            buy_price: buyPriceNum,
            selling_price: sellingPriceNum,
            stock: stockNum,
            warning
        }, 201);
    } catch (err) {
        return error(res, err.message || 'Failed to create item', 500);
    }
};

const updateItem = async (req, res) => {
    const { id } = req.params;
    const { name, category, unit, buy_price, selling_price, stock } = req.body;
    const activeShop = req.user.active_shop_id;

    try {
        const item = await db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ?`).get(id, activeShop);
        if (!item) {
            return error(res, 'Item not found', 404);
        }

        const newBuyPrice = buy_price !== undefined ? parseFloat(buy_price) : item.buy_price;
        const newSellingPrice = selling_price !== undefined ? parseFloat(selling_price) : item.selling_price;
        const newStock = stock !== undefined ? parseFloat(stock) : item.stock;

        await db.prepare(`
            UPDATE items SET
                name = COALESCE(?, name),
                category = COALESCE(?, category),
                unit = COALESCE(?, unit),
                buy_price = ?,
                selling_price = ?,
                price = ?,
                stock = ?,
                qty = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND shop_id = ?
        `).run(
            name, category, unit, newBuyPrice, newSellingPrice, newSellingPrice, newStock, newStock, id, activeShop
        );

        let warning = null;
        if (newBuyPrice > 0 && newSellingPrice < newBuyPrice) {
            warning = `⚠ Warning: Selling price (${newSellingPrice}) is lower than buying price (${newBuyPrice})!`;
        }

        await logAudit(activeShop, req.user.id, 'Update Item', `Updated item '${item.name}' details`);

        return success(res, 'Item updated successfully', { warning });
    } catch (err) {
        return error(res, err.message || 'Failed to update item', 500);
    }
};

const deleteItem = async (req, res) => {
    const { id } = req.params;
    const activeShop = req.user.active_shop_id;

    try {
        const item = await db.prepare(`SELECT * FROM items WHERE id = ? AND shop_id = ?`).get(id, activeShop);
        if (!item) {
            return error(res, 'Item not found', 404);
        }

        await db.prepare(`UPDATE items SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
        await logAudit(activeShop, req.user.id, 'Delete Item', `Soft deleted item '${item.name}'`);

        return success(res, 'Item deleted successfully');
    } catch (err) {
        return error(res, err.message || 'Failed to delete item', 500);
    }
};

module.exports = {
    getItems,
    getItemById,
    createItem,
    updateItem,
    deleteItem
};

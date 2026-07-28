const { db, success, error } = require('../../../shared');
const { v4: uuidv4 } = require('uuid');

const getUnits = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;
        const units = await db.prepare(`SELECT * FROM units WHERE shop_id = ? ORDER BY name ASC`).all(targetShop);
        return success(res, 'Units retrieved', units);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const createUnit = async (req, res) => {
    const { name } = req.body;
    if (!name) return error(res, 'Unit name is required', 400);

    const targetShop = req.user.active_shop_id;
    try {
        const existing = await db.prepare(`SELECT id FROM units WHERE LOWER(name) = LOWER(?) AND shop_id = ?`).get(name.trim(), targetShop);
        if (existing) return error(res, 'Unit already exists', 400);

        const id = 'unit_' + uuidv4().substring(0, 8);
        await db.prepare(`INSERT INTO units (id, shop_id, name) VALUES (?, ?, ?)`).run(id, targetShop, name.trim());
        return success(res, 'Unit created', { id, name: name.trim() }, 201);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const updateUnit = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        await db.prepare(`UPDATE units SET name = ? WHERE id = ? AND shop_id = ?`).run(name, id, req.user.active_shop_id);
        return success(res, 'Unit updated');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const deleteUnit = async (req, res) => {
    const { id } = req.params;
    try {
        await db.prepare(`DELETE FROM units WHERE id = ? AND shop_id = ?`).run(id, req.user.active_shop_id);
        return success(res, 'Unit deleted');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

module.exports = { getUnits, createUnit, updateUnit, deleteUnit };

const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/response');

const getUnits = (req, res) => {
    const shopId = req.user.active_shop_id;
    const units = db.prepare(`SELECT * FROM units WHERE shop_id = ? ORDER BY name ASC`).all(shopId);
    return success(res, 'Units retrieved', units);
};

const createUnit = (req, res) => {
    const { name } = req.body;
    const shopId = req.user.active_shop_id;

    if (!name || name.trim() === '') {
        return error(res, 'Unit name is required', 400);
    }

    const trimmed = name.trim();

    // Check duplicate
    const existing = db.prepare(`SELECT id FROM units WHERE shop_id = ? AND LOWER(name) = LOWER(?)`).get(shopId, trimmed);
    if (existing) {
        return error(res, 'Unit already exists', 400);
    }

    const id = 'unit_' + uuidv4().substring(0, 8);
    db.prepare(`INSERT INTO units (id, shop_id, name) VALUES (?, ?, ?)`).run(id, shopId, trimmed);

    return success(res, 'Unit created successfully', { id, name: trimmed }, 201);
};

const updateUnit = (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    const shopId = req.user.active_shop_id;

    if (!name || name.trim() === '') {
        return error(res, 'Unit name is required', 400);
    }

    const trimmed = name.trim();
    const existing = db.prepare(`SELECT id FROM units WHERE shop_id = ? AND LOWER(name) = LOWER(?) AND id != ?`).get(shopId, trimmed, id);
    if (existing) {
        return error(res, 'Unit name already exists', 400);
    }

    db.prepare(`UPDATE units SET name = ? WHERE id = ? AND shop_id = ?`).run(trimmed, id, shopId);
    return success(res, 'Unit updated successfully');
};

const deleteUnit = (req, res) => {
    const { id } = req.params;
    const shopId = req.user.active_shop_id;
    db.prepare(`DELETE FROM units WHERE id = ? AND shop_id = ?`).run(id, shopId);
    return success(res, 'Unit deleted successfully');
};

module.exports = {
    getUnits,
    createUnit,
    updateUnit,
    deleteUnit
};

const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/response');

const getCategories = async (req, res) => {
    try {
        const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;
        const categories = await db.prepare(`SELECT * FROM categories WHERE shop_id = ? ORDER BY name ASC`).all(targetShop);
        return success(res, 'Categories retrieved', categories);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const createCategory = async (req, res) => {
    const { name } = req.body;
    if (!name) return error(res, 'Category name is required', 400);

    const targetShop = req.user.active_shop_id;
    try {
        const existing = await db.prepare(`SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND shop_id = ?`).get(name.trim(), targetShop);
        if (existing) return error(res, 'Category already exists', 400);

        const id = 'cat_' + uuidv4().substring(0, 8);
        await db.prepare(`INSERT INTO categories (id, shop_id, name) VALUES (?, ?, ?)`).run(id, targetShop, name.trim());
        return success(res, 'Category created', { id, name: name.trim() }, 201);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const updateCategory = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        await db.prepare(`UPDATE categories SET name = ? WHERE id = ? AND shop_id = ?`).run(name, id, req.user.active_shop_id);
        return success(res, 'Category updated');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const deleteCategory = async (req, res) => {
    const { id } = req.params;
    try {
        await db.prepare(`DELETE FROM categories WHERE id = ? AND shop_id = ?`).run(id, req.user.active_shop_id);
        return success(res, 'Category deleted');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };

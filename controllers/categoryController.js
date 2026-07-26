const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/response');

const getCategories = (req, res) => {
    const shopId = req.user.active_shop_id;
    const categories = db.prepare(`SELECT * FROM categories WHERE shop_id = ? ORDER BY name ASC`).all(shopId);
    return success(res, 'Categories retrieved', categories);
};

const createCategory = (req, res) => {
    const { name } = req.body;
    const shopId = req.user.active_shop_id;

    if (!name || name.trim() === '') {
        return error(res, 'Category name is required', 400);
    }

    const trimmed = name.trim();

    // Check duplicate
    const existing = db.prepare(`SELECT id FROM categories WHERE shop_id = ? AND LOWER(name) = LOWER(?)`).get(shopId, trimmed);
    if (existing) {
        return error(res, 'Category already exists', 400);
    }

    const id = 'cat_' + uuidv4().substring(0, 8);
    db.prepare(`INSERT INTO categories (id, shop_id, name) VALUES (?, ?, ?)`).run(id, shopId, trimmed);

    return success(res, 'Category created successfully', { id, name: trimmed }, 201);
};

const updateCategory = (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    const shopId = req.user.active_shop_id;

    if (!name || name.trim() === '') {
        return error(res, 'Category name is required', 400);
    }

    const trimmed = name.trim();
    const existing = db.prepare(`SELECT id FROM categories WHERE shop_id = ? AND LOWER(name) = LOWER(?) AND id != ?`).get(shopId, trimmed, id);
    if (existing) {
        return error(res, 'Category name already exists', 400);
    }

    db.prepare(`UPDATE categories SET name = ? WHERE id = ? AND shop_id = ?`).run(trimmed, id, shopId);
    return success(res, 'Category updated successfully');
};

const deleteCategory = (req, res) => {
    const { id } = req.params;
    const shopId = req.user.active_shop_id;
    db.prepare(`DELETE FROM categories WHERE id = ? AND shop_id = ?`).run(id, shopId);
    return success(res, 'Category deleted successfully');
};

module.exports = {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};

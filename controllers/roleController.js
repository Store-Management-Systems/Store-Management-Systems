const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/response');

const SYSTEM_PERMISSIONS = [
    'Dashboard', 'Inventory', 'Billing', 'Reports', 'Customers',
    'Stock In', 'Stock Out', 'Delete Item', 'Edit Item', 'Create Item',
    'Discount', 'Print Bill', 'Export Excel', 'Settings', 'Users',
    'Shops', 'Financial Reports', 'Categories', 'Units', 'Purchase Price',
    'Selling Price', 'History'
];

const getPermissionsList = (req, res) => {
    return success(res, 'System permissions checklist retrieved', SYSTEM_PERMISSIONS);
};

const getRoles = async (req, res) => {
    try {
        const roles = await db.prepare(`SELECT * FROM roles WHERE shop_id = ? OR is_system = 1 ORDER BY name ASC`).all(req.user.active_shop_id);
        return success(res, 'Roles retrieved', roles);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const createRole = async (req, res) => {
    const { name, permissions } = req.body;
    if (!name) return error(res, 'Role name is required', 400);

    const targetShop = req.user.active_shop_id;
    try {
        const id = 'rol_' + uuidv4().substring(0, 8);
        const permsStr = typeof permissions === 'string' ? permissions : JSON.stringify(permissions || []);
        await db.prepare(`INSERT INTO roles (id, shop_id, name, permissions) VALUES (?, ?, ?, ?)`).run(id, targetShop, name, permsStr);
        return success(res, 'Role created', { id, name, permissions }, 201);
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const updateRole = async (req, res) => {
    const { id } = req.params;
    const { name, permissions } = req.body;
    try {
        const permsStr = permissions !== undefined ? (typeof permissions === 'string' ? permissions : JSON.stringify(permissions)) : null;
        await db.prepare(`UPDATE roles SET name = COALESCE(?, name), permissions = COALESCE(?, permissions) WHERE id = ? AND shop_id = ?`).run(name, permsStr, id, req.user.active_shop_id);
        return success(res, 'Role updated');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

const deleteRole = async (req, res) => {
    const { id } = req.params;
    try {
        await db.prepare(`DELETE FROM roles WHERE id = ? AND shop_id = ? AND is_system = 0`).run(id, req.user.active_shop_id);
        return success(res, 'Role deleted');
    } catch (err) {
        return error(res, err.message, 500);
    }
};

module.exports = { getPermissionsList, getRoles, createRole, updateRole, deleteRole };

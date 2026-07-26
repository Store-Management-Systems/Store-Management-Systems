const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/response');

const ALL_PERMISSIONS = [
    'Dashboard',
    'Inventory',
    'Billing',
    'Reports',
    'Customers',
    'Stock In',
    'Stock Out',
    'Delete Item',
    'Edit Item',
    'Create Item',
    'Discount',
    'Print Bill',
    'Export Excel',
    'Settings',
    'Users',
    'Shops',
    'Financial Reports',
    'Categories',
    'Units',
    'Purchase Price',
    'Selling Price',
    'History'
];

const getPermissionsList = (req, res) => {
    return success(res, 'Available permissions retrieved', ALL_PERMISSIONS);
};

const getRoles = (req, res) => {
    const shopId = req.user.active_shop_id;
    const roles = db.prepare(`SELECT * FROM roles WHERE shop_id = ? ORDER BY created_at DESC`).all(shopId);
    roles.forEach(r => {
        try {
            r.permissions = JSON.parse(r.permissions);
        } catch (e) {
            r.permissions = [];
        }
    });
    return success(res, 'Roles retrieved', roles);
};

const createRole = (req, res) => {
    const { name, permissions } = req.body;
    const shopId = req.user.active_shop_id;

    if (!name || !permissions) {
        return error(res, 'Role name and permissions are required', 400);
    }

    const roleId = 'role_' + uuidv4().substring(0, 8);
    const permsJson = typeof permissions === 'string' ? permissions : JSON.stringify(permissions);

    db.prepare(`
        INSERT INTO roles (id, shop_id, name, permissions)
        VALUES (?, ?, ?, ?)
    `).run(roleId, shopId, name, permsJson);

    return success(res, 'Role created successfully', { id: roleId, name, permissions }, 201);
};

const updateRole = (req, res) => {
    const { id } = req.params;
    const { name, permissions } = req.body;

    const permsJson = typeof permissions === 'string' ? permissions : JSON.stringify(permissions);

    db.prepare(`
        UPDATE roles SET
            name = COALESCE(?, name),
            permissions = COALESCE(?, permissions)
        WHERE id = ?
    `).run(name, permsJson, id);

    return success(res, 'Role updated successfully');
};

const deleteRole = (req, res) => {
    const { id } = req.params;
    db.prepare(`DELETE FROM roles WHERE id = ?`).run(id);
    return success(res, 'Role deleted successfully');
};

module.exports = {
    getPermissionsList,
    getRoles,
    createRole,
    updateRole,
    deleteRole,
    ALL_PERMISSIONS
};

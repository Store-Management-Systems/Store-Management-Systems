const db = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { success, error } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const getUsers = (req, res) => {
    let users = [];
    const targetShop = req.user.role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;

    if (req.user.role === 'Admin' && !req.query.shop_id) {
        users = db.prepare(`
            SELECT u.id, u.name, u.username, u.email, u.role, u.shop_id, u.permissions, u.status, u.phone, u.created_at, s.shop_name
            FROM users u
            LEFT JOIN shops s ON u.shop_id = s.id
            ORDER BY u.created_at DESC
        `).all();
    } else {
        users = db.prepare(`
            SELECT u.id, u.name, u.username, u.email, u.role, u.shop_id, u.permissions, u.status, u.phone, u.created_at, s.shop_name
            FROM users u
            LEFT JOIN shops s ON u.shop_id = s.id
            WHERE u.shop_id = ?
            ORDER BY u.created_at DESC
        `).all(targetShop);
    }

    users.forEach(u => {
        try {
            u.permissions = JSON.parse(u.permissions || '[]');
        } catch (e) {
            u.permissions = [];
        }
    });

    return success(res, 'Users retrieved successfully', users);
};

const getUserById = (req, res) => {
    const { id } = req.params;
    const user = db.prepare(`
        SELECT id, name, username, email, role, shop_id, permissions, status, phone, created_at
        FROM users WHERE id = ?
    `).get(id);

    if (!user) {
        return error(res, 'User not found', 404);
    }

    try {
        user.permissions = JSON.parse(user.permissions || '[]');
    } catch (e) {
        user.permissions = [];
    }

    return success(res, 'User retrieved', user);
};

const createUser = (req, res) => {
    const { name, username, email, password, role = 'Staff', shop_id, permissions, phone } = req.body;

    if (!name || !username || !password) {
        return error(res, 'Name, username, and password are required', 400);
    }

    const assignedShopId = req.user.role === 'Admin' ? (shop_id || req.user.shop_id) : req.user.shop_id;

    const existingUser = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
    if (existingUser) {
        return error(res, 'Username is already taken', 400);
    }

    const userId = 'usr_' + uuidv4().substring(0, 8);
    const hashedPassword = bcrypt.hashSync(password, 10);

    let permsArray = permissions;
    if (typeof permissions === 'string') {
        try { permsArray = JSON.parse(permissions); } catch (e) { permsArray = []; }
    }
    if (!Array.isArray(permsArray)) {
        // Default role permissions preset
        if (role === 'Owner' || role === 'Admin') {
            permsArray = ['Dashboard', 'Inventory', 'Billing', 'Reports', 'Customers', 'Stock In', 'Stock Out', 'Delete Item', 'Edit Item', 'Create Item', 'Discount', 'Print Bill', 'Export Excel', 'Settings', 'Users', 'Financial Reports', 'Categories', 'Units', 'History'];
        } else if (role === 'Manager') {
            permsArray = ['Dashboard', 'Inventory', 'Billing', 'Reports', 'Customers', 'Stock In', 'Stock Out', 'Edit Item', 'Create Item', 'Print Bill', 'Export Excel', 'Categories', 'Units', 'History'];
        } else if (role === 'Cashier') {
            permsArray = ['Dashboard', 'Billing', 'Print Bill', 'Customers', 'History'];
        } else {
            permsArray = ['Dashboard', 'Inventory', 'Stock In', 'Stock Out'];
        }
    }

    db.prepare(`
        INSERT INTO users (id, name, username, email, password, role, shop_id, permissions, status, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        userId,
        name,
        username,
        email || null,
        hashedPassword,
        role,
        assignedShopId,
        JSON.stringify(permsArray),
        'active',
        phone || null
    );

    logAudit(assignedShopId, req.user.id, 'Create User', `Created user '${username}' with role '${role}'`);

    return success(res, 'User created successfully', {
        id: userId,
        name,
        username,
        role,
        shop_id: assignedShopId,
        permissions: permsArray
    }, 201);
};

const updateUser = (req, res) => {
    const { id } = req.params;
    const { name, email, role, permissions, status, phone } = req.body;

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!user) {
        return error(res, 'User not found', 404);
    }

    let permsJson = user.permissions;
    if (permissions !== undefined) {
        permsJson = typeof permissions === 'string' ? permissions : JSON.stringify(permissions);
    }

    db.prepare(`
        UPDATE users SET
            name = COALESCE(?, name),
            email = COALESCE(?, email),
            role = COALESCE(?, role),
            permissions = ?,
            status = COALESCE(?, status),
            phone = COALESCE(?, phone),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        name, email, role, permsJson, status, phone, id
    );

    logAudit(user.shop_id, req.user.id, 'Update User', `Updated profile/permissions for user ${user.username}`);
    return success(res, 'User updated successfully');
};

const resetPassword = (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 4) {
        return error(res, 'New password must be at least 4 characters long', 400);
    }

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!user) {
        return error(res, 'User not found', 404);
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare(`UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(hashedPassword, id);

    logAudit(user.shop_id, req.user.id, 'Reset Password', `Reset password for user ${user.username}`);
    return success(res, `Password reset successfully for user ${user.username}`);
};

const deleteUser = (req, res) => {
    const { id } = req.params;
    if (id === req.user.id) {
        return error(res, 'Cannot delete your own account', 400);
    }

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!user) {
        return error(res, 'User not found', 404);
    }

    db.prepare(`UPDATE users SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    logAudit(user.shop_id, req.user.id, 'Delete User', `Disabled user account ${user.username}`);
    return success(res, 'User account disabled');
};

module.exports = {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    resetPassword,
    deleteUser
};

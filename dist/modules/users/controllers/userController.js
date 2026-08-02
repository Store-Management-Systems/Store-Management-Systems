"use strict";
const { db, success, error } = require('../../../shared');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../../notifications/services/auditService');
const getUsers = async (req, res) => {
    try {
        let users = [];
        const role = req.user.role;
        const targetShop = role === 'Admin' && req.query.shop_id ? req.query.shop_id : req.user.active_shop_id;
        if (role === 'Admin' && !req.query.shop_id) {
            users = await db.prepare(`
                SELECT u.id, u.name, u.username, u.email, u.role, u.shop_id, u.organization_id, u.permissions, u.status, u.phone, u.force_password_change, u.last_password_reset_at, u.last_password_reset_by, u.created_at, s.shop_name
                FROM users u
                LEFT JOIN shops s ON u.shop_id = s.id
                ORDER BY u.created_at DESC
            `).all();
        }
        else if (role === 'Owner' && !req.query.shop_id) {
            const orgId = req.user.organization_id || '';
            users = await db.prepare(`
                SELECT u.id, u.name, u.username, u.email, u.role, u.shop_id, u.organization_id, u.permissions, u.status, u.phone, u.force_password_change, u.last_password_reset_at, u.last_password_reset_by, u.created_at, s.shop_name
                FROM users u
                LEFT JOIN shops s ON u.shop_id = s.id
                WHERE (u.organization_id = ? OR s.organization_id = ? OR u.shop_id = ?)
                ORDER BY u.created_at DESC
            `).all(orgId, orgId, targetShop);
        }
        else {
            users = await db.prepare(`
                SELECT u.id, u.name, u.username, u.email, u.role, u.shop_id, u.organization_id, u.permissions, u.status, u.phone, u.force_password_change, u.last_password_reset_at, u.last_password_reset_by, u.created_at, s.shop_name
                FROM users u
                LEFT JOIN shops s ON u.shop_id = s.id
                WHERE u.shop_id = ?
                ORDER BY u.created_at DESC
            `).all(targetShop);
        }
        users.forEach(u => {
            try {
                u.permissions = JSON.parse(u.permissions || '[]');
            }
            catch (e) {
                u.permissions = [];
            }
        });
        return success(res, 'Users retrieved successfully', users);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const getUserById = async (req, res) => {
    const { id } = req.params;
    try {
        const user = await db.prepare(`
            SELECT u.id, u.name, u.username, u.email, u.role, u.shop_id, u.organization_id, u.permissions, u.status, u.phone, u.force_password_change, u.last_password_reset_at, u.last_password_reset_by, u.created_at, s.shop_name, o.name as organization_name
            FROM users u
            LEFT JOIN shops s ON u.shop_id = s.id
            LEFT JOIN organizations o ON u.organization_id = o.id
            WHERE u.id = ?
        `).get(id);
        if (!user) {
            return error(res, 'User not found', 404);
        }
        try {
            user.permissions = JSON.parse(user.permissions || '[]');
        }
        catch (e) {
            user.permissions = [];
        }
        return success(res, 'User retrieved', user);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const createUser = async (req, res) => {
    const { name, username, email, password, role = 'Staff', shop_id, organization_id, permissions, phone } = req.body;
    if (!name || !username || !password) {
        return error(res, 'Name, username, and password are required', 400);
    }
    const assignedShopId = (req.user.role === 'Admin' || req.user.role === 'Owner') ? (shop_id || req.user.shop_id) : req.user.shop_id;
    const targetOrgId = organization_id || req.user.organization_id || null;
    try {
        const existingUser = await db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
        if (existingUser) {
            return error(res, 'Username is already taken', 400);
        }
        const userId = 'usr_' + uuidv4().substring(0, 8);
        const hashedPassword = bcrypt.hashSync(password, 10);
        let permsArray = permissions;
        if (typeof permissions === 'string') {
            try {
                permsArray = JSON.parse(permissions);
            }
            catch (e) {
                permsArray = [];
            }
        }
        if (!Array.isArray(permsArray)) {
            permsArray = ['Dashboard', 'Inventory', 'Billing', 'Reports'];
        }
        const userStatus = 'active';
        await db.prepare(`
            INSERT INTO users (id, name, username, email, password, password_hash, role, shop_id, organization_id, permissions, status, phone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(userId, name, username, email || null, hashedPassword, hashedPassword, role, assignedShopId, targetOrgId, JSON.stringify(permsArray), userStatus, phone || null);
        await logAudit(assignedShopId, req.user.id, 'Create User', `Created user '${username}' with role '${role}'`);
        return success(res, 'User created successfully', {
            id: userId,
            name,
            username,
            role,
            shop_id: assignedShopId,
            permissions: permsArray
        }, 201);
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, role, permissions, status, phone } = req.body;
    try {
        const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
        if (!user) {
            return error(res, 'User not found', 404);
        }
        let permsJson = user.permissions;
        if (permissions !== undefined) {
            permsJson = typeof permissions === 'string' ? permissions : JSON.stringify(permissions);
        }
        await db.prepare(`
            UPDATE users SET
                name = COALESCE(?, name),
                email = COALESCE(?, email),
                role = COALESCE(?, role),
                permissions = ?,
                status = COALESCE(?, status),
                phone = COALESCE(?, phone),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, email, role, permsJson, status, phone, id);
        await logAudit(user.shop_id, req.user.id, 'Update User', `Updated profile/permissions for user ${user.username}`);
        return success(res, 'User updated successfully');
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
const searchUsersForReset = async (req, res) => {
    try {
        const { search = '', role = '', shop_id = '', organization_id = '' } = req.query;
        const callerRole = req.user.role;
        const callerOrgId = req.user.organization_id;
        const callerShopId = req.user.shop_id;
        let sql = `
            SELECT u.id, u.name, u.username, u.email, u.role, u.shop_id, u.organization_id, u.status, u.phone, u.force_password_change, u.last_password_reset_at, u.last_password_reset_by, s.shop_name, o.name as organization_name
            FROM users u
            LEFT JOIN shops s ON u.shop_id = s.id
            LEFT JOIN organizations o ON u.organization_id = o.id
            WHERE u.status != 'deleted'
        `;
        const params = [];
        // Scoping by Caller Role
        if (callerRole === 'Owner') {
            sql += ` AND (u.organization_id = ? OR s.organization_id = ?) AND u.role != 'Admin'`;
            params.push(callerOrgId, callerOrgId);
        }
        else if (callerRole === 'Manager') {
            sql += ` AND u.shop_id = ? AND u.role NOT IN ('Admin', 'Owner')`;
            params.push(callerShopId);
        }
        else if (callerRole !== 'Admin') {
            return error(res, 'Unauthorized access to password reset search', 403);
        }
        if (search) {
            sql += ` AND (LOWER(u.name) LIKE ? OR LOWER(u.username) LIKE ? OR LOWER(u.email) LIKE ? OR u.phone LIKE ? OR u.id LIKE ?)`;
            const s = `%${search.toLowerCase()}%`;
            params.push(s, s, s, s, s);
        }
        if (role) {
            sql += ` AND u.role = ?`;
            params.push(role);
        }
        if (shop_id) {
            sql += ` AND u.shop_id = ?`;
            params.push(shop_id);
        }
        if (organization_id) {
            sql += ` AND (u.organization_id = ? OR s.organization_id = ?)`;
            params.push(organization_id, organization_id);
        }
        sql += ` ORDER BY u.created_at DESC LIMIT 50`;
        const users = await db.prepare(sql).all(params);
        return success(res, 'Users matching reset search retrieved', users);
    }
    catch (err) {
        return error(res, err.message || 'Failed to search users', 500);
    }
};
const resetPassword = async (req, res) => {
    const targetUserId = req.params.id || req.body.userId;
    const { newPassword, generateTemp, forceChangeNextLogin } = req.body;
    const caller = req.user;
    const callerRole = caller.role;
    if (!callerRole || ['Staff', 'Cashier'].includes(callerRole)) {
        return error(res, 'Unauthorized: You do not have permission to reset passwords.', 403);
    }
    if (!targetUserId) {
        return error(res, 'Target user ID is required', 400);
    }
    try {
        const targetUser = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetUserId);
        if (!targetUser) {
            return error(res, 'Target user record not found', 404);
        }
        // -------------------------------------------------------------
        // RBAC RULES ENFORCEMENT FOR PASSWORD RESET
        // -------------------------------------------------------------
        if (callerRole === 'Owner') {
            const isSameOrg = (targetUser.organization_id && targetUser.organization_id === caller.organization_id);
            if (!isSameOrg || targetUser.role === 'Admin') {
                return error(res, 'Unauthorized: Owners can only reset passwords for employees within their own Organization.', 403);
            }
        }
        else if (callerRole === 'Manager') {
            const isSameShop = (targetUser.shop_id && targetUser.shop_id === caller.shop_id);
            if (!isSameShop || ['Admin', 'Owner'].includes(targetUser.role)) {
                return error(res, 'Unauthorized: Managers can only reset passwords for staff in their assigned branch.', 403);
            }
        }
        let passwordToSet = newPassword;
        let isTempGenerated = false;
        if (generateTemp || !passwordToSet) {
            // Auto-generate secure 8-character temporary password
            passwordToSet = 'Pass-' + Math.floor(1000 + Math.random() * 9000);
            isTempGenerated = true;
        }
        if (passwordToSet.length < 6) {
            return error(res, 'Password must be at least 6 characters long', 400);
        }
        const hashedPassword = bcrypt.hashSync(passwordToSet, 10);
        const forceFlag = (forceChangeNextLogin === true || forceChangeNextLogin === 1 || isTempGenerated) ? 1 : 0;
        const now = new Date().toISOString();
        await db.prepare(`
            UPDATE users SET
                password = ?,
                password_hash = ?,
                force_password_change = ?,
                last_password_reset_at = ?,
                last_password_reset_by = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(hashedPassword, hashedPassword, forceFlag, now, caller.id, targetUserId);
        const auditDetail = `Reset password for user '${targetUser.name}' (${targetUser.username}, Role: ${targetUser.role}). Force Change: ${forceFlag === 1 ? 'Yes' : 'No'}, Temp: ${isTempGenerated ? 'Yes' : 'No'}`;
        await logAudit(targetUser.shop_id || caller.shop_id, caller.id, 'Reset Password', auditDetail);
        return success(res, `Password reset successfully for user ${targetUser.username}`, {
            userId: targetUser.id,
            username: targetUser.username,
            name: targetUser.name,
            role: targetUser.role,
            temporaryPassword: isTempGenerated ? passwordToSet : null,
            forcePasswordChange: forceFlag === 1,
            resetAt: now,
            resetBy: caller.name || caller.username
        });
    }
    catch (err) {
        return error(res, err.message || 'Failed to reset user password', 500);
    }
};
const deleteUser = async (req, res) => {
    const { id } = req.params;
    if (id === req.user.id) {
        return error(res, 'Cannot delete your own account', 400);
    }
    try {
        const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
        if (!user) {
            return error(res, 'User not found', 404);
        }
        const isAuthorizedCreator = req.user.role === 'Admin' || req.user.role === 'Owner';
        if (!isAuthorizedCreator) {
            return error(res, 'Unauthorized to delete user accounts', 403);
        }
        await db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
        await logAudit(user.shop_id, req.user.id, 'Delete User', `Permanently deleted user account ${user.username}`);
        return success(res, 'User account permanently deleted successfully');
    }
    catch (err) {
        return error(res, err.message, 500);
    }
};
module.exports = {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    searchUsersForReset,
    resetPassword,
    deleteUser
};

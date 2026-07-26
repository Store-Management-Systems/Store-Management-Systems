const db = require('../database/init');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { success, error } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const login = async (req, res) => {
    let { username, password } = req.body;

    username = username ? username.trim() : '';
    password = password ? password.trim() : '';

    if (!username || !password) {
        return error(res, 'Username and password are required', 400);
    }

    try {
        const user = await db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)').get(username, username);

        if (!user) {
            return error(res, 'Invalid credentials', 401);
        }

        if (user.status === 'disabled' || user.status === 'deleted') {
            return error(res, 'Your account has been deactivated. Contact Admin.', 403);
        }

        const validPassword = bcrypt.compareSync(password, user.password || user.password_hash || '');
        if (!validPassword) {
            return error(res, 'Invalid credentials', 401);
        }

        const shop = await db.prepare('SELECT * FROM shops WHERE id = ?').get(user.shop_id);

        let permissions = [];
        try {
            permissions = JSON.parse(user.permissions || '[]');
        } catch (e) {
            permissions = [];
        }

        const payload = {
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            role: user.role,
            shop_id: user.shop_id,
            permissions
        };

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '24h' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000
        });

        await logAudit(user.shop_id, user.id, 'Login', `User ${user.username} logged in successfully`);

        return success(res, 'Login successful', {
            token,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role,
                shop_id: user.shop_id,
                permissions,
                shop: shop ? {
                    id: shop.id,
                    name: shop.shop_name || shop.name,
                    code: shop.shop_code,
                    currency: shop.currency || '₹',
                    taxRate: shop.tax_rate || 0,
                    logo: shop.logo,
                    address: shop.address,
                    phone: shop.phone,
                    gst: shop.gst
                } : null
            }
        });
    } catch (err) {
        return error(res, err.message || 'Login error', 500);
    }
};

const getMe = async (req, res) => {
    try {
        const user = await db.prepare('SELECT id, name, username, email, role, shop_id, permissions, status, phone FROM users WHERE id = ?').get(req.user.id);

        if (!user) {
            return error(res, 'User session invalid', 401);
        }

        const shop = await db.prepare('SELECT * FROM shops WHERE id = ?').get(user.shop_id);

        let permissions = [];
        try {
            permissions = JSON.parse(user.permissions || '[]');
        } catch (e) {
            permissions = [];
        }

        return success(res, 'User session valid', {
            ...user,
            permissions,
            shop: shop ? {
                id: shop.id,
                name: shop.shop_name || shop.name,
                code: shop.shop_code,
                currency: shop.currency || '₹',
                taxRate: shop.tax_rate || 0,
                logo: shop.logo,
                address: shop.address,
                phone: shop.phone,
                gst: shop.gst
            } : null
        });
    } catch (err) {
        return error(res, err.message || 'Session error', 500);
    }
};

const changePassword = async (req, res) => {
    let { oldPassword, newPassword } = req.body;
    oldPassword = oldPassword ? oldPassword.trim() : '';
    newPassword = newPassword ? newPassword.trim() : '';

    if (!oldPassword || !newPassword) {
        return error(res, 'Old and new passwords are required', 400);
    }

    try {
        const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const valid = bcrypt.compareSync(oldPassword, user.password || user.password_hash || '');
        if (!valid) {
            return error(res, 'Incorrect current password', 400);
        }

        const hashed = bcrypt.hashSync(newPassword, 10);
        await db.prepare('UPDATE users SET password = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashed, hashed, req.user.id);

        await logAudit(user.shop_id, user.id, 'Change Password', `User ${user.username} changed password`);
        return success(res, 'Password changed successfully');
    } catch (err) {
        return error(res, err.message || 'Failed to change password', 500);
    }
};

const logout = (req, res) => {
    res.clearCookie('token');
    return success(res, 'Logged out successfully');
};

module.exports = {
    login,
    getMe,
    changePassword,
    logout
};

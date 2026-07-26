const db = require('../database/init');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { success, error } = require('../utils/response');
const { logAudit } = require('../services/auditService');

const login = (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return error(res, 'Username and password are required', 400);
    }

    const user = db.prepare(`SELECT * FROM users WHERE (username = ? OR email = ?) AND status = 'active'`).get(username, username);

    if (!user) {
        return error(res, 'Invalid username or password', 401);
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
        return error(res, 'Invalid username or password', 401);
    }

    let permissions = [];
    try {
        permissions = JSON.parse(user.permissions || '[]');
    } catch (e) {
        permissions = [];
    }

    // Fetch user shop info
    const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(user.shop_id) || {};

    const payload = {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        shop_id: user.shop_id,
        permissions: permissions
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    logAudit(user.shop_id, user.id, 'User Login', `User ${user.username} logged in successfully.`);

    res.cookie('token', token, {
        httpOnly: true,
        secure: false, // Set true in HTTPS production
        maxAge: 24 * 60 * 60 * 1000
    });

    return success(res, 'Login successful', {
        token,
        user: {
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            role: user.role,
            shop_id: user.shop_id,
            permissions: permissions,
            shop: {
                id: shop.id,
                name: shop.shop_name,
                code: shop.shop_code,
                currency: shop.currency || '₹',
                taxRate: shop.tax_rate || 0,
                logo: shop.logo || null
            }
        }
    });
};

const logout = (req, res) => {
    if (req.user) {
        logAudit(req.user.shop_id, req.user.id, 'User Logout', `User ${req.user.username} logged out.`);
    }
    res.clearCookie('token');
    return success(res, 'Logged out successfully');
};

const getMe = (req, res) => {
    const user = db.prepare(`SELECT id, name, username, email, role, shop_id, permissions, phone, status FROM users WHERE id = ?`).get(req.user.id);
    if (!user) {
        return error(res, 'User not found', 404);
    }

    const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(user.shop_id) || {};

    let permissions = [];
    try {
        permissions = JSON.parse(user.permissions || '[]');
    } catch (e) {
        permissions = [];
    }

    return success(res, 'User session valid', {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        shop_id: user.shop_id,
        permissions: permissions,
        phone: user.phone,
        status: user.status,
        shop: {
            id: shop.id,
            name: shop.shop_name,
            code: shop.shop_code,
            currency: shop.currency || '₹',
            taxRate: shop.tax_rate || 0,
            logo: shop.logo || null,
            address: shop.address,
            phone: shop.phone,
            gst: shop.gst
        }
    });
};

const changePassword = (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return error(res, 'Current password and new password are required', 400);
    }

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
    if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
        return error(res, 'Incorrect current password', 400);
    }

    const hashedNew = bcrypt.hashSync(newPassword, 10);
    db.prepare(`UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(hashedNew, req.user.id);

    logAudit(user.shop_id, user.id, 'Password Change', 'User updated their password.');
    return success(res, 'Password changed successfully');
};

module.exports = {
    login,
    logout,
    getMe,
    changePassword
};

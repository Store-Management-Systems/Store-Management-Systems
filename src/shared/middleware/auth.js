const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');
const { db } = require('../database/init');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_shop_key_2026';

const authenticate = async (req, res, next) => {
    try {
        let token = null;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        if (!token) {
            return error(res, 'Authentication required. Please login.', 401);
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        // DB Status Verification: Prevent disabled users or deleted organization accounts from making requests
        if (req.user.role !== 'Admin') {
            const dbUser = await db.prepare("SELECT id, status, organization_id, shop_id FROM users WHERE id = ?").get(req.user.id);
            if (!dbUser || dbUser.status === 'disabled' || dbUser.status === 'deleted') {
                return error(res, 'Access revoked: Your user account has been disabled or deleted.', 403);
            }

            const orgId = dbUser.organization_id || req.user.organization_id;
            if (orgId) {
                const dbOrg = await db.prepare("SELECT status FROM organizations WHERE id = ?").get(orgId);
                if (!dbOrg || dbOrg.status === 'deleted' || dbOrg.status === 'inactive') {
                    return error(res, 'Access revoked: Your Organization has been deactivated or deleted. Contact Admin.', 403);
                }
            }
        }

        const targetShopId = req.headers['x-shop-id'] || req.query.shop_id;
        if (targetShopId && (req.user.role === 'Admin' || req.user.role === 'Owner')) {
            req.user.active_shop_id = targetShopId;
        } else {
            req.user.active_shop_id = req.user.shop_id;
        }

        next();
    } catch (err) {
        return error(res, err.message || 'Session expired or invalid token. Please login again.', 401);
    }
};

module.exports = {
    authenticate,
    JWT_SECRET
};

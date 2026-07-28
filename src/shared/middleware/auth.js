const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_shop_key_2026';

const authenticate = (req, res, next) => {
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

        // Allow Admin or Owner to switch active shop view via x-shop-id header or query param
        const targetShopId = req.headers['x-shop-id'] || req.query.shop_id;
        if (targetShopId && (req.user.role === 'Admin' || req.user.role === 'Owner')) {
            req.user.active_shop_id = targetShopId;
        } else {
            req.user.active_shop_id = req.user.shop_id;
        }

        next();
    } catch (err) {
        return error(res, 'Session expired or invalid token. Please login again.', 401);
    }
};

module.exports = {
    authenticate,
    JWT_SECRET
};

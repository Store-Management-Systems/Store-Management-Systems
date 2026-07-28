const { error } = require('../utils/response');

const checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        if (!req.user) {
            return error(res, 'Unauthorized', 401);
        }

        // Admin has full access everywhere
        if (req.user.role === 'Admin') {
            return next();
        }

        // Owner has full access within their assigned shop
        if (req.user.role === 'Owner') {
            return next();
        }

        try {
            let perms = [];
            if (typeof req.user.permissions === 'string') {
                perms = JSON.parse(req.user.permissions || '[]');
            } else if (Array.isArray(req.user.permissions)) {
                perms = req.user.permissions;
            }

            if (perms.includes(requiredPermission) || perms.includes('*')) {
                return next();
            }

            return error(res, `Permission denied: Missing '${requiredPermission}' access.`, 403);
        } catch (e) {
            return error(res, 'Permission evaluation failed.', 403);
        }
    };
};

module.exports = { checkPermission };

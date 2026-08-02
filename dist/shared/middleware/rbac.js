"use strict";
const { error } = require('../utils/response');
const isSuperAdminRole = (role) => ['Admin', 'SUPER_ADMIN', 'Super Admin', 'SuperAdmin'].includes(role);
const checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        if (!req.user) {
            return error(res, 'Unauthorized', 401);
        }
        // Super Admin has unrestricted access everywhere across all tenants & modules
        if (isSuperAdminRole(req.user.role)) {
            return next();
        }
        // Owner has full access within their assigned organization and branches
        if (req.user.role === 'Owner') {
            return next();
        }
        try {
            let perms = [];
            if (typeof req.user.permissions === 'string') {
                perms = JSON.parse(req.user.permissions || '[]');
            }
            else if (Array.isArray(req.user.permissions)) {
                perms = req.user.permissions;
            }
            if (perms.includes(requiredPermission) || perms.includes('*')) {
                return next();
            }
            return error(res, `Permission denied: Missing '${requiredPermission}' access.`, 403);
        }
        catch (e) {
            return error(res, 'Permission evaluation failed.', 403);
        }
    };
};
module.exports = { checkPermission, isSuperAdminRole };

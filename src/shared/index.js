const db = require('./database/init');
const { authenticate, JWT_SECRET } = require('./middleware/auth');
const { checkPermission } = require('./middleware/rbac');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');
const { success, error } = require('./utils/response');
const cache = require('./utils/cache');

module.exports = {
    db,
    authenticate,
    JWT_SECRET,
    checkPermission,
    notFoundHandler,
    globalErrorHandler,
    success,
    error,
    cache
};

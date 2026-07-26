const { error } = require('../utils/response');

const notFoundHandler = (req, res) => {
    return error(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
};

const globalErrorHandler = (err, req, res, next) => {
    console.error('Unhandled Server Error:', err);
    return error(res, err.message || 'Internal server error', 500);
};

module.exports = {
    notFoundHandler,
    globalErrorHandler
};

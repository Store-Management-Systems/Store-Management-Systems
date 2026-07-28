/**
 * Standard API Response Helper Functions
 */

const success = (res, message = 'Success', data = null, statusCode = 200, extra = {}) => {
    return res.status(statusCode).json({
        success: true,
        message,
        ...(data !== null ? { data } : {}),
        ...extra
    });
};

const error = (res, message = 'An error occurred', statusCode = 400, details = null) => {
    return res.status(statusCode).json({
        success: false,
        message,
        ...(details ? { details } : {})
    });
};

module.exports = {
    success,
    error
};

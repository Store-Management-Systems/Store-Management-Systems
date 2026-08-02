"use strict";
// Audit History feature removed as per specification.
const logAudit = async (shop_id, user_id, action, details) => {
    return Promise.resolve(true);
};
module.exports = { logAudit };

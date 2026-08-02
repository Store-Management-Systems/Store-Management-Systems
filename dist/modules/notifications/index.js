"use strict";
const routes = require('./routes/notificationRoutes');
const controller = require('./controllers/notificationController');
const service = require('./services/auditService');
module.exports = {
    routes,
    controller,
    service
};

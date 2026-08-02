"use strict";
const reportRoutes = require('./routes/reportRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const reportController = require('./controllers/reportController');
const analyticsController = require('./controllers/analyticsController');
module.exports = {
    routes: {
        reports: reportRoutes,
        analytics: analyticsRoutes
    },
    controllers: {
        reportController,
        analyticsController
    }
};

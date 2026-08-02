"use strict";
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userController = require('./controllers/userController');
const roleController = require('./controllers/roleController');
const adminController = require('./controllers/adminController');
module.exports = {
    routes: {
        users: userRoutes,
        roles: roleRoutes,
        admin: adminRoutes
    },
    controllers: {
        userController,
        roleController,
        adminController
    }
};

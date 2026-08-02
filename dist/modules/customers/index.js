"use strict";
const customerRoutes = require('./routes/customerRoutes');
const peopleRoutes = require('./routes/peopleRoutes');
const ledgerRoutes = require('./routes/ledgerRoutes');
const customerController = require('./controllers/customerController');
const peopleController = require('./controllers/peopleController');
const ledgerController = require('./controllers/ledgerController');
module.exports = {
    routes: {
        customers: customerRoutes,
        people: peopleRoutes,
        ledgers: ledgerRoutes
    },
    controllers: {
        customerController,
        peopleController,
        ledgerController
    }
};

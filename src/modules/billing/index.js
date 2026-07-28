const billRoutes = require('./routes/billRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const billController = require('./controllers/billController');
const purchaseController = require('./controllers/purchaseController');
const paymentController = require('./controllers/paymentController');

module.exports = {
    routes: {
        bills: billRoutes,
        purchases: purchaseRoutes,
        payments: paymentRoutes
    },
    controllers: {
        billController,
        purchaseController,
        paymentController
    }
};

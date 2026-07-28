const itemRoutes = require('./routes/itemRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const unitRoutes = require('./routes/unitRoutes');
const stockRoutes = require('./routes/stockRoutes');

const itemController = require('./controllers/itemController');
const categoryController = require('./controllers/categoryController');
const unitController = require('./controllers/unitController');
const stockController = require('./controllers/stockController');

module.exports = {
    routes: {
        items: itemRoutes,
        categories: categoryRoutes,
        units: unitRoutes,
        stock: stockRoutes
    },
    controllers: {
        itemController,
        categoryController,
        unitController,
        stockController
    }
};

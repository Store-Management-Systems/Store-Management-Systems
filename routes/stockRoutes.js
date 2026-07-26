const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

router.post('/in', authenticate, checkPermission('Stock In'), stockController.stockIn);
router.post('/out', authenticate, checkPermission('Stock Out'), stockController.stockOut);
router.post('/adjust', authenticate, checkPermission('Inventory'), stockController.adjustStock);
router.post('/transfer', authenticate, checkPermission('Inventory'), stockController.transferStock);
router.get('/logs', authenticate, checkPermission('History'), stockController.getStockLogs);

module.exports = router;

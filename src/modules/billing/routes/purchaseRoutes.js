const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');
const { authenticate, checkPermission } = require('../../../shared');

router.get('/', authenticate, purchaseController.getPurchases);
router.get('/:id', authenticate, purchaseController.getPurchaseById);
router.post('/', authenticate, checkPermission('Inventory'), purchaseController.createPurchase);

module.exports = router;

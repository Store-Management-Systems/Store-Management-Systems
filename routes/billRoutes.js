const express = require('express');
const router = express.Router();
const billController = require('../controllers/billController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

router.post('/', authenticate, checkPermission('Billing'), billController.createBill);
router.get('/stats', authenticate, billController.getBillStats);
router.get('/', authenticate, billController.getBills);
router.get('/:id', authenticate, billController.getBillById);
router.post('/:id/payments', authenticate, checkPermission('Billing'), billController.recordPaymentForBill);
router.post('/:id/cancel', authenticate, checkPermission('Billing'), billController.cancelBill);

module.exports = router;

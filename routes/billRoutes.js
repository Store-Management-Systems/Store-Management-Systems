const express = require('express');
const router = express.Router();
const billController = require('../controllers/billController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

router.post('/', authenticate, checkPermission('Billing'), billController.createBill);
router.get('/', authenticate, checkPermission('History'), billController.getBills);
router.get('/:id', authenticate, checkPermission('History'), billController.getBillById);

module.exports = router;

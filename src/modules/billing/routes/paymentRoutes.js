const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../../../shared');

router.get('/', authenticate, paymentController.getPayments);
router.post('/', authenticate, paymentController.recordPayment);

module.exports = router;

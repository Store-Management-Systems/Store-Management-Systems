const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

router.get('/', authenticate, checkPermission('Customers'), customerController.getCustomers);
router.get('/:id', authenticate, checkPermission('Customers'), customerController.getCustomerById);
router.post('/', authenticate, checkPermission('Customers'), customerController.createCustomer);
router.put('/:id', authenticate, checkPermission('Customers'), customerController.updateCustomer);
router.delete('/:id', authenticate, checkPermission('Customers'), customerController.deleteCustomer);

module.exports = router;

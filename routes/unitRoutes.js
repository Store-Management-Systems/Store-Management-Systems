const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unitController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

router.get('/', authenticate, unitController.getUnits);
router.post('/', authenticate, checkPermission('Units'), unitController.createUnit);
router.put('/:id', authenticate, checkPermission('Units'), unitController.updateUnit);
router.delete('/:id', authenticate, checkPermission('Units'), unitController.deleteUnit);

module.exports = router;

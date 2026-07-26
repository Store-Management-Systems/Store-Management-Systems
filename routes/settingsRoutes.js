const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

router.get('/', authenticate, settingsController.getSettings);
router.put('/', authenticate, checkPermission('Settings'), settingsController.updateSettings);

module.exports = router;

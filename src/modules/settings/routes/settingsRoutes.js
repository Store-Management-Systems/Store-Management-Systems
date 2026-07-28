const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate, checkPermission } = require('../../../shared');

router.get('/', authenticate, settingsController.getSettings);
router.put('/', authenticate, checkPermission('Settings'), settingsController.updateSettings);

module.exports = router;

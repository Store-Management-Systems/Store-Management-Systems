const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate, checkPermission } = require('../../../shared');

router.use(authenticate);

// Platform Settings (Platform Admin only)
router.get('/platform', settingsController.getPlatformSettings);
router.put('/platform', settingsController.updatePlatformSettings);

// Organization Settings (Organization Owner)
router.get('/organization', settingsController.getOrganizationSettings);
router.put('/organization', settingsController.updateOrganizationSettings);

// Branch Settings (Branch Manager/Staff)
router.get('/branch', settingsController.getSettings);
router.put('/branch', checkPermission('Settings'), settingsController.updateSettings);

// General fallback
router.get('/', settingsController.getSettings);
router.put('/', checkPermission('Settings'), settingsController.updateSettings);

module.exports = router;

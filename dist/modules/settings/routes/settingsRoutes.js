"use strict";
const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate, checkPermission } = require('../../../shared');
router.use(authenticate);
// Global SaaS Configuration Center (Super Admin)
router.get('/global', settingsController.getGlobalSettings);
router.put('/global', settingsController.updateGlobalSettings);
// Legacy Platform Settings Aliases
router.get('/platform', settingsController.getGlobalSettings);
router.put('/platform', settingsController.updateGlobalSettings);
// Organization Settings (Organization Owner)
router.get('/organization', settingsController.getOrganizationSettings);
router.put('/organization', settingsController.updateOrganizationSettings);
// Branch Settings (Branch Manager/Staff)
router.get('/branch', settingsController.getShopSettings);
router.put('/branch', checkPermission('Settings'), settingsController.updateShopSettings);
// General fallback
router.get('/', settingsController.getShopSettings);
router.put('/', checkPermission('Settings'), settingsController.updateShopSettings);
module.exports = router;

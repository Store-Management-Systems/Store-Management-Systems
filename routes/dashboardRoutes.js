const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

router.get('/', authenticate, checkPermission('Dashboard'), dashboardController.getDashboardStats);

module.exports = router;

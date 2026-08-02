"use strict";
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate, checkPermission } = require('../../../shared');
router.get('/', authenticate, checkPermission('Dashboard'), dashboardController.getDashboardStats);
module.exports = router;

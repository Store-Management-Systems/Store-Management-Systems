"use strict";
const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate } = require('../../../shared');
router.get('/', authenticate, analyticsController.getAnalytics);
module.exports = router;

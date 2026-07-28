const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate, checkPermission } = require('../../../shared');

router.get('/excel', authenticate, checkPermission('Export Excel'), reportController.generateExcelReport);
router.get('/pdf', authenticate, checkPermission('Reports'), reportController.generatePDFReport);

module.exports = router;

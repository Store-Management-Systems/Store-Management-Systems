const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

router.get('/excel', authenticate, checkPermission('Export Excel'), reportController.generateExcelReport);
router.get('/pdf', authenticate, checkPermission('Reports'), reportController.generatePDFReport);

module.exports = router;

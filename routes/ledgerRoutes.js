const express = require('express');
const router = express.Router();
const ledgerController = require('../controllers/ledgerController');
const { authenticate } = require('../middleware/auth');

router.get('/:personId', authenticate, ledgerController.getLedger);
router.get('/:personId/export/excel', authenticate, ledgerController.exportLedgerExcel);
router.get('/:personId/export/pdf', authenticate, ledgerController.exportLedgerPdf);

module.exports = router;

const express = require('express');
const router = express.Router();
const { getApprovals, approveRequest, rejectRequest } = require('../controllers/approvalController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', getApprovals);
router.post('/:id/approve', approveRequest);
router.post('/:id/reject', rejectRequest);

module.exports = router;

const express = require('express');
const router = express.Router();
const { getOrganizations, getOrganizationById, createOrganization, updateOrganization, deleteOrganization } = require('../controllers/organizationController');
const { authenticate } = require('../../../shared');

router.use(authenticate);

router.get('/', getOrganizations);
router.get('/:id', getOrganizationById);
router.post('/', createOrganization);
router.put('/:id', updateOrganization);
router.delete('/:id', deleteOrganization);

module.exports = router;

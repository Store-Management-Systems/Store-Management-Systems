const express = require('express');
const router = express.Router();
const peopleController = require('../controllers/peopleController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

router.get('/', authenticate, peopleController.getPeople);
router.get('/:id', authenticate, peopleController.getPersonById);
router.post('/', authenticate, checkPermission('Customers'), peopleController.createPerson);
router.put('/:id', authenticate, checkPermission('Customers'), peopleController.updatePerson);
router.delete('/:id', authenticate, checkPermission('Customers'), peopleController.deletePerson);

module.exports = router;

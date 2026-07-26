const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

router.get('/', authenticate, checkPermission('Users'), userController.getUsers);
router.get('/:id', authenticate, checkPermission('Users'), userController.getUserById);
router.post('/', authenticate, checkPermission('Users'), userController.createUser);
router.put('/:id', authenticate, checkPermission('Users'), userController.updateUser);
router.post('/:id/reset-password', authenticate, checkPermission('Users'), userController.resetPassword);
router.delete('/:id', authenticate, checkPermission('Users'), userController.deleteUser);

module.exports = router;

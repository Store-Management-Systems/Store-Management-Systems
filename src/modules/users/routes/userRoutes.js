const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, checkPermission } = require('../../../shared');

router.get('/', authenticate, checkPermission('Users'), userController.getUsers);
router.get('/reset-password/search', authenticate, checkPermission('Users'), userController.searchUsersForReset);
router.get('/:id', authenticate, checkPermission('Users'), userController.getUserById);
router.post('/', authenticate, checkPermission('Users'), userController.createUser);
router.post('/reset-password', authenticate, checkPermission('Users'), userController.resetPassword);
router.post('/:id/reset-password', authenticate, checkPermission('Users'), userController.resetPassword);
router.put('/:id', authenticate, checkPermission('Users'), userController.updateUser);
router.delete('/:id', authenticate, checkPermission('Users'), userController.deleteUser);

module.exports = router;

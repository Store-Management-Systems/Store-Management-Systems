const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../../../shared');

router.post('/login', authController.login);
router.get('/login', (req, res) => res.redirect('/'));
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);
router.post('/change-password', authenticate, authController.changePassword);
router.post('/change-password-forced', authenticate, authController.changePasswordForced);

module.exports = router;

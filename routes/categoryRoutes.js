const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

router.get('/', authenticate, categoryController.getCategories);
router.post('/', authenticate, checkPermission('Categories'), categoryController.createCategory);
router.put('/:id', authenticate, checkPermission('Categories'), categoryController.updateCategory);
router.delete('/:id', authenticate, checkPermission('Categories'), categoryController.deleteCategory);

module.exports = router;

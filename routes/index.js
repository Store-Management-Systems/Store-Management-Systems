const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const shopRoutes = require('./shopRoutes');
const userRoutes = require('./userRoutes');
const roleRoutes = require('./roleRoutes');
const itemRoutes = require('./itemRoutes');
const categoryRoutes = require('./categoryRoutes');
const unitRoutes = require('./unitRoutes');
const customerRoutes = require('./customerRoutes');
const billRoutes = require('./billRoutes');
const stockRoutes = require('./stockRoutes');
const reportRoutes = require('./reportRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const settingsRoutes = require('./settingsRoutes');
const notificationRoutes = require('./notificationRoutes');

router.use('/auth', authRoutes);
router.use('/shops', shopRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/items', itemRoutes);
router.use('/categories', categoryRoutes);
router.use('/units', unitRoutes);
router.use('/customers', customerRoutes);
router.use('/bills', billRoutes);
router.use('/stock', stockRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/settings', settingsRoutes);
router.use('/notifications', notificationRoutes);

module.exports = router;

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Initialize Database & Migration
require('./src/shared/database/init');

const apiRoutes = require('./src/routes');
const { notFoundHandler, globalErrorHandler } = require('./src/shared/middleware/errorHandler');

const app = express();

// Security & Optimization Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { success: false, message: 'Too many requests from this IP, please try again later.' }
});
app.use('/api', limiter);

// Serve Static Frontend Files with Cache Control
const staticOptions = {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.json')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
};
app.use(express.static(path.join(__dirname), staticOptions));
app.use(express.static(path.join(__dirname, 'public'), staticOptions));

// API Routes
app.use('/api', apiRoutes);

// Catch 404 & Global Errors
app.use('/api/*', notFoundHandler);
app.use(globalErrorHandler);

// Default SPA Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Shop Management System Backend Running on Port ${PORT}`);
    console.log(`🌐 Local Access: http://localhost:${PORT}`);
    console.log(`🔑 Default Admin: Username=admin | Password=admin123`);
    console.log(`===================================================`);
});
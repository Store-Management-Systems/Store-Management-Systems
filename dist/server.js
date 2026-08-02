"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const pgInit_1 = require("./shared/database/pgInit");
const logger_1 = require("./shared/utils/logger");
const routes_1 = __importDefault(require("./routes"));
const errorHandler_1 = require("./shared/middleware/errorHandler");
const app = (0, express_1.default)();
// Initialize Neon Database & PL/pgSQL routines
(0, pgInit_1.initNeonDatabase)().catch(err => {
    logger_1.logger.error('Database Initialization Warning:', err.message);
});
// Security & Optimization Middleware
app.use((0, helmet_1.default)({ contentSecurityPolicy: false }));
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, cookie_parser_1.default)());
// Rate Limiting
const limiter = (0, express_rate_limit_1.default)({
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
app.use(express_1.default.static(path_1.default.join(__dirname, '..'), staticOptions));
app.use(express_1.default.static(path_1.default.join(__dirname, '../public'), staticOptions));
// RESTful API Routes
app.use('/api', routes_1.default);
// Catch 404 & Global Errors
app.use('/api/*', errorHandler_1.notFoundHandler);
app.use(errorHandler_1.globalErrorHandler);
// Default SPA Fallback
app.get('*', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../index.html'));
});
// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger_1.logger.info(`===================================================`);
    logger_1.logger.info(`🚀 Enterprise Multi-Branch SaaS System Running on Port ${PORT}`);
    logger_1.logger.info(`🌐 Local Access: http://localhost:${PORT}`);
    logger_1.logger.info(`🔑 Default Admin: Username=admin | Password=admin123`);
    logger_1.logger.info(`===================================================`);
});
exports.default = app;

import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';

import { initNeonDatabase } from './shared/database/pgInit';
import { logger } from './shared/utils/logger';
import apiRoutes from './routes';
import { notFoundHandler, globalErrorHandler } from './shared/middleware/errorHandler';

const app = express();

// Initialize Neon Database & PL/pgSQL routines
initNeonDatabase().catch(err => {
    logger.error('Database Initialization Warning:', err.message);
});

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
    setHeaders: (res: Response, filePath: string) => {
        if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.json')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
};
app.use(express.static(path.join(__dirname, '..'), staticOptions));
app.use(express.static(path.join(__dirname, '../public'), staticOptions));

// RESTful API Routes
app.use('/api', apiRoutes);

// Catch 404 & Global Errors
app.use('/api/*', notFoundHandler);
app.use(globalErrorHandler);

// Default SPA Fallback
app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`===================================================`);
    logger.info(`🚀 Enterprise Multi-Branch SaaS System Running on Port ${PORT}`);
    logger.info(`🌐 Local Access: http://localhost:${PORT}`);
    logger.info(`🔑 Default Admin: Username=admin | Password=admin123`);
    logger.info(`===================================================`);
});

export default app;

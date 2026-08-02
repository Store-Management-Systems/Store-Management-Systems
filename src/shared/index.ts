import { db } from './database/db';
import { success, error } from './utils/response';
import { logger } from './utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_shop_key_2026';

export {
    db,
    success,
    error,
    logger,
    JWT_SECRET
};

import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { error } from '../utils/response';

export const validateRequest = (schema: AnyZodObject) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params
            });
            return next();
        } catch (err) {
            if (err instanceof ZodError) {
                const formattedErrors = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
                return error(res, `Validation Error: ${formattedErrors}`, 400);
            }
            return error(res, 'Invalid request data', 400);
        }
    };
};

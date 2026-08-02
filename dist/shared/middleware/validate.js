"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequest = void 0;
const zod_1 = require("zod");
const response_1 = require("../utils/response");
const validateRequest = (schema) => {
    return async (req, res, next) => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params
            });
            return next();
        }
        catch (err) {
            if (err instanceof zod_1.ZodError) {
                const formattedErrors = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
                return (0, response_1.error)(res, `Validation Error: ${formattedErrors}`, 400);
            }
            return (0, response_1.error)(res, 'Invalid request data', 400);
        }
    };
};
exports.validateRequest = validateRequest;

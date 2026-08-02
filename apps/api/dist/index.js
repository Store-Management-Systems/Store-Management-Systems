"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const client_1 = require("@prisma/client");
exports.prisma = new client_1.PrismaClient();
const fastify = (0, fastify_1.default)({ logger: true });
async function start() {
    await fastify.register(cors_1.default, {
        origin: '*', // TODO: configure for production
    });
    await fastify.register(jwt_1.default, {
        secret: process.env.JWT_SECRET || 'supersecretjwtkeyforomnexa',
    });
    // Register Routes
    fastify.register(Promise.resolve().then(() => __importStar(require('./routes/auth.routes'))), { prefix: '/api/auth' });
    fastify.register(Promise.resolve().then(() => __importStar(require('./routes/org.routes'))), { prefix: '/api/organizations' });
    fastify.register(Promise.resolve().then(() => __importStar(require('./routes/inventory.routes'))), { prefix: '/api/inventory' });
    // Example route
    fastify.get('/api/health', async () => {
        return { status: 'ok', message: 'Omnexa API is running' };
    });
    try {
        await fastify.listen({ port: 3000, host: '0.0.0.0' });
        console.log(`Server listening on http://localhost:3000`);
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}
start();

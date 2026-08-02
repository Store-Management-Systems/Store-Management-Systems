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
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.register = register;
const index_1 = require("../index");
const argon2 = __importStar(require("argon2"));
const zod_1 = require("zod");
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
async function login(request, reply) {
    try {
        const { email, password } = loginSchema.parse(request.body);
        const user = await index_1.prisma.user.findUnique({
            where: { email },
            include: { organization: true, shop: true },
        });
        if (!user) {
            return reply.status(401).send({ error: 'Invalid email or password' });
        }
        if (user.status !== 'active') {
            return reply.status(403).send({ error: 'Account is inactive' });
        }
        const isValid = await argon2.verify(user.passwordHash, password);
        if (!isValid) {
            return reply.status(401).send({ error: 'Invalid email or password' });
        }
        const token = await reply.jwtSign({
            id: user.id,
            role: user.role,
            organizationId: user.organizationId,
            shopId: user.shopId,
        });
        return reply.send({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                organization: user.organization,
                shop: user.shop,
            }
        });
    }
    catch (err) {
        return reply.status(400).send({ error: 'Invalid request payload' });
    }
}
async function register(request, reply) {
    // Super admin / Org owner registration logic here (simplified)
    return reply.status(501).send({ error: 'Not implemented yet' });
}

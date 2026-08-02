"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = authRoutes;
const auth_controller_1 = require("../controllers/auth.controller");
async function authRoutes(fastify) {
    fastify.post('/login', auth_controller_1.login);
    fastify.post('/register', auth_controller_1.register);
}

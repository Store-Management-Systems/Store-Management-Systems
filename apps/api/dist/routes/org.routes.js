"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = orgRoutes;
const org_controller_1 = require("../controllers/org.controller");
async function orgRoutes(fastify) {
    fastify.post('/', org_controller_1.createOrganization);
    fastify.get('/', org_controller_1.getOrganizations);
}

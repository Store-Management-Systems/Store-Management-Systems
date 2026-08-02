"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = inventoryRoutes;
const inventory_controller_1 = require("../controllers/inventory.controller");
async function inventoryRoutes(fastify) {
    // Add authentication middleware hook here for these routes
    fastify.addHook('onRequest', async (request, reply) => {
        try {
            await request.jwtVerify();
        }
        catch (err) {
            reply.send(err);
        }
    });
    // Category routes
    fastify.post('/categories', inventory_controller_1.createCategory);
    fastify.get('/categories', inventory_controller_1.getCategories);
    // Product routes
    fastify.post('/products', inventory_controller_1.createProduct);
    fastify.get('/products', inventory_controller_1.getProducts);
}

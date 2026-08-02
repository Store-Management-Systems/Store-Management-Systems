import { FastifyInstance } from 'fastify';
import { createCategory, getCategories, createProduct, getProducts } from '../controllers/inventory.controller';

export default async function inventoryRoutes(fastify: FastifyInstance) {
  // Add authentication middleware hook here for these routes
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // Category routes
  fastify.post('/categories', createCategory);
  fastify.get('/categories', getCategories);

  // Product routes
  fastify.post('/products', createProduct);
  fastify.get('/products', getProducts);
}

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
const fastify = Fastify({ logger: true });

async function start() {
  await fastify.register(cors, {
    origin: '*', // TODO: configure for production
  });

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'supersecretjwtkeyforomnexa',
  });

  // Register Routes
  fastify.register(import('./routes/auth.routes'), { prefix: '/api/auth' });
  fastify.register(import('./routes/org.routes'), { prefix: '/api/organizations' });
  fastify.register(import('./routes/inventory.routes'), { prefix: '/api/inventory' });

  // Example route
  fastify.get('/api/health', async () => {
    return { status: 'ok', message: 'Omnexa API is running' };
  });

  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log(`Server listening on http://localhost:3000`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();

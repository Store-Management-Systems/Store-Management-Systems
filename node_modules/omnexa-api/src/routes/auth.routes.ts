import { FastifyInstance } from 'fastify';
import { login, register } from '../controllers/auth.controller';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', login);
  fastify.post('/register', register);
}

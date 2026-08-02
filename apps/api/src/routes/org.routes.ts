import { FastifyInstance } from 'fastify';
import { createOrganization, getOrganizations } from '../controllers/org.controller';

export default async function orgRoutes(fastify: FastifyInstance) {
  fastify.post('/', createOrganization);
  fastify.get('/', getOrganizations);
}

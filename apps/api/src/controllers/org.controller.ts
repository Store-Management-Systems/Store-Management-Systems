import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../index';
import { z } from 'zod';

const createOrgSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).toUpperCase(),
  ownerName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
});

export async function createOrganization(request: FastifyRequest, reply: FastifyReply) {
  try {
    const data = createOrgSchema.parse(request.body);

    const existingOrg = await prisma.organization.findUnique({
      where: { code: data.code }
    });

    if (existingOrg) {
      return reply.status(400).send({ error: 'Organization code already exists' });
    }

    const org = await prisma.organization.create({
      data: {
        name: data.name,
        code: data.code,
        ownerName: data.ownerName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
      }
    });

    return reply.status(201).send(org);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return reply.status(400).send({ error: err.errors });
    }
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

export async function getOrganizations(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgs = await prisma.organization.findMany();
    return reply.send(orgs);
  } catch (err) {
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

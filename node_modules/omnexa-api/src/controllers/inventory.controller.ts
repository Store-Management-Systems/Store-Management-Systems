import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../index';
import { z } from 'zod';

const createCategorySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
});

export async function createCategory(request: FastifyRequest, reply: FastifyReply) {
  try {
    const data = createCategorySchema.parse(request.body);
    // Assuming organizationId is extracted from JWT token and attached to request.user
    const user = (request as any).user;
    if (!user || !user.organizationId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const category = await prisma.category.create({
      data: {
        name: data.name,
        description: data.description,
        organizationId: user.organizationId,
      }
    });

    return reply.status(201).send(category);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return reply.status(400).send({ error: err.errors });
    }
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

export async function getCategories(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = (request as any).user;
    if (!user || !user.organizationId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const categories = await prisma.category.findMany({
      where: { organizationId: user.organizationId }
    });
    return reply.send(categories);
  } catch (err) {
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

const createProductSchema = z.object({
  name: z.string().min(2),
  categoryId: z.string().uuid().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  unit: z.string().default('pcs'),
  sellingPrice: z.number().min(0).default(0),
  costPrice: z.number().min(0).default(0),
  taxRate: z.number().min(0).default(0),
  isRawMaterial: z.boolean().default(false),
});

export async function createProduct(request: FastifyRequest, reply: FastifyReply) {
  try {
    const data = createProductSchema.parse(request.body);
    const user = (request as any).user;
    if (!user || !user.organizationId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const product = await prisma.product.create({
      data: {
        ...data,
        organizationId: user.organizationId,
      }
    });

    return reply.status(201).send(product);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return reply.status(400).send({ error: err.errors });
    }
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

export async function getProducts(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = (request as any).user;
    if (!user || !user.organizationId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const products = await prisma.product.findMany({
      where: { organizationId: user.organizationId },
      include: { category: true }
    });
    return reply.send(products);
  } catch (err) {
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

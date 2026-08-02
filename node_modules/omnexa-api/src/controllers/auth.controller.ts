import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../index';
import * as argon2 from 'argon2';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function login(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { email, password } = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({
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

  } catch (err) {
    return reply.status(400).send({ error: 'Invalid request payload' });
  }
}

export async function register(request: FastifyRequest, reply: FastifyReply) {
  // Super admin / Org owner registration logic here (simplified)
  return reply.status(501).send({ error: 'Not implemented yet' });
}

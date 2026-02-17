import { FastifyRequest, FastifyReply } from 'fastify';
import { USER_ROLES } from '@meditations/shared';

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.role !== USER_ROLES.ADMIN) {
    return reply.status(403).send({ error: 'Admin access required' });
  }
}

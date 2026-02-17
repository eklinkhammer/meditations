import { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { updateUserSchema } from '@meditations/shared';
import { authenticate } from '../middleware/auth.js';
import { db, users } from '../db/index.js';

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // All user routes require authentication
  fastify.addHook('onRequest', authenticate);

  // GET / - Get current user profile
  fastify.get('/', async (request, reply) => {
    try {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          creditsBalance: users.creditsBalance,
          isPremium: users.isPremium,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, request.user.id))
        .limit(1);

      return user;
    } catch (err) {
      request.log.error(err, 'Failed to get user profile');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // PATCH / - Update current user profile
  fastify.patch('/', async (request, reply) => {
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      const [updated] = await db
        .update(users)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(users.id, request.user.id))
        .returning({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          creditsBalance: users.creditsBalance,
          isPremium: users.isPremium,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      return updated;
    } catch (err) {
      request.log.error(err, 'Failed to update user profile');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};

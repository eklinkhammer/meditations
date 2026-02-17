import { FastifyPluginAsync } from 'fastify';
import { eq, desc, sql } from 'drizzle-orm';
import {
  updatePricingConfigSchema,
  moderationActionSchema,
  VIDEO_VISIBILITY,
  MODERATION_STATUS,
} from '@meditations/shared';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { db, users, videos, pricingConfig } from '../db/index.js';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // All admin routes require authentication + admin role
  fastify.addHook('onRequest', authenticate);
  fastify.addHook('onRequest', requireAdmin);

  // GET /stats - Dashboard stats
  fastify.get('/stats', async (request, reply) => {
    try {
      const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
      const [videoCount] = await db.select({ count: sql<number>`count(*)` }).from(videos);
      const [pendingCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(videos)
        .where(eq(videos.moderationStatus, MODERATION_STATUS.PENDING));

      return {
        totalUsers: userCount.count,
        totalVideos: videoCount.count,
        pendingModeration: pendingCount.count,
      };
    } catch (err) {
      request.log.error(err, 'Failed to get admin stats');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /users - List users
  fastify.get('/users', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));
    const offset = (page - 1) * limit;

    try {
      const results = await db
        .select()
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      return { data: results, page, limit };
    } catch (err) {
      request.log.error(err, 'Failed to list users');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /moderation - Get videos pending moderation
  fastify.get('/moderation', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10) || 20));
    const offset = (page - 1) * limit;

    try {
      const results = await db
        .select()
        .from(videos)
        .where(eq(videos.moderationStatus, MODERATION_STATUS.PENDING))
        .orderBy(desc(videos.createdAt))
        .limit(limit)
        .offset(offset);

      return { data: results, page, limit };
    } catch (err) {
      request.log.error(err, 'Failed to list moderation queue');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // POST /moderation - Approve or reject a video
  fastify.post('/moderation', async (request, reply) => {
    const parsed = moderationActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { videoId, action } = parsed.data;

    const newVisibility = action === 'approve' ? VIDEO_VISIBILITY.PUBLIC : VIDEO_VISIBILITY.REJECTED;
    const newModerationStatus = action === 'approve' ? MODERATION_STATUS.APPROVED : MODERATION_STATUS.REJECTED;

    try {
      const [updated] = await db
        .update(videos)
        .set({
          visibility: newVisibility,
          moderationStatus: newModerationStatus,
          updatedAt: new Date(),
        })
        .where(eq(videos.id, videoId))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: 'Video not found' });
      }

      return updated;
    } catch (err) {
      request.log.error(err, 'Failed to moderate video');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /pricing - Get all pricing config
  fastify.get('/pricing', async (request, reply) => {
    try {
      const configs = await db.select().from(pricingConfig);
      return { data: configs };
    } catch (err) {
      request.log.error(err, 'Failed to get pricing config');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // PUT /pricing - Update pricing config
  fastify.put('/pricing', async (request, reply) => {
    const parsed = updatePricingConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      const [updated] = await db
        .insert(pricingConfig)
        .values({
          key: parsed.data.key,
          value: parsed.data.value,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: pricingConfig.key,
          set: {
            value: parsed.data.value,
            updatedAt: new Date(),
          },
        })
        .returning();

      return updated;
    } catch (err) {
      request.log.error(err, 'Failed to update pricing config');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};

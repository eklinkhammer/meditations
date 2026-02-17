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
  fastify.get('/stats', async () => {
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
  });

  // GET /users - List users
  fastify.get('/users', async (request) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const results = await db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: results, page, limit };
  });

  // GET /moderation - Get videos pending moderation
  fastify.get('/moderation', async (request) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const results = await db
      .select()
      .from(videos)
      .where(eq(videos.moderationStatus, MODERATION_STATUS.PENDING))
      .orderBy(desc(videos.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: results, page, limit };
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
  });

  // GET /pricing - Get all pricing config
  fastify.get('/pricing', async () => {
    const configs = await db.select().from(pricingConfig);
    return { data: configs };
  });

  // PUT /pricing - Update pricing config
  fastify.put('/pricing', async (request, reply) => {
    const parsed = updatePricingConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

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
  });
};

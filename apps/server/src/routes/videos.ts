import { FastifyPluginAsync } from 'fastify';
import { eq, desc, asc, ilike, and, sql } from 'drizzle-orm';
import { VIDEO_VISIBILITY, MODERATION_STATUS } from '@meditations/shared';
import { authenticate } from '../middleware/auth.js';
import { db, videos, users } from '../db/index.js';

export const videoRoutes: FastifyPluginAsync = async (fastify) => {
  // GET / - Browse public video library (no auth required)
  fastify.get('/', async (request) => {
    const query = request.query as {
      search?: string;
      tags?: string;
      sortBy?: string;
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const conditions = [
      eq(videos.visibility, VIDEO_VISIBILITY.PUBLIC),
      eq(videos.moderationStatus, MODERATION_STATUS.APPROVED),
    ];

    if (query.search) {
      conditions.push(ilike(videos.title, `%${query.search}%`));
    }

    if (query.tags) {
      const tagList = query.tags.split(',');
      conditions.push(sql`${videos.tags} && ${tagList}`);
    }

    let orderBy;
    switch (query.sortBy) {
      case 'popular':
        orderBy = desc(videos.viewCount);
        break;
      case 'duration':
        orderBy = asc(videos.durationSeconds);
        break;
      default:
        orderBy = desc(videos.createdAt);
    }

    const results = await db
      .select({
        id: videos.id,
        title: videos.title,
        thumbnailKey: videos.thumbnailKey,
        durationSeconds: videos.durationSeconds,
        visibility: videos.visibility,
        viewCount: videos.viewCount,
        likeCount: videos.likeCount,
        createdAt: videos.createdAt,
        user: {
          id: users.id,
          displayName: users.displayName,
        },
      })
      .from(videos)
      .innerJoin(users, eq(videos.userId, users.id))
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    return { data: results, page, limit };
  });

  // GET /my - Get current user's videos (requires auth)
  fastify.get('/my', { onRequest: [authenticate] }, async (request) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const results = await db
      .select()
      .from(videos)
      .where(eq(videos.userId, request.user.id))
      .orderBy(desc(videos.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: results, page, limit };
  });

  // GET /:id - Get single video
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const [video] = await db
      .select({
        id: videos.id,
        userId: videos.userId,
        title: videos.title,
        storageKey: videos.storageKey,
        thumbnailKey: videos.thumbnailKey,
        durationSeconds: videos.durationSeconds,
        visibility: videos.visibility,
        moderationStatus: videos.moderationStatus,
        visualPrompt: videos.visualPrompt,
        tags: videos.tags,
        viewCount: videos.viewCount,
        likeCount: videos.likeCount,
        createdAt: videos.createdAt,
        updatedAt: videos.updatedAt,
        user: {
          id: users.id,
          displayName: users.displayName,
        },
      })
      .from(videos)
      .innerJoin(users, eq(videos.userId, users.id))
      .where(eq(videos.id, request.params.id))
      .limit(1);

    if (!video) {
      return reply.status(404).send({ error: 'Video not found' });
    }

    // Non-public videos are hidden unless viewer is the owner
    if (
      video.visibility !== VIDEO_VISIBILITY.PUBLIC ||
      video.moderationStatus !== MODERATION_STATUS.APPROVED
    ) {
      return reply.status(404).send({ error: 'Video not found' });
    }

    // Increment view count
    await db
      .update(videos)
      .set({ viewCount: sql`${videos.viewCount} + 1` })
      .where(eq(videos.id, video.id));

    return video;
  });
};

import { FastifyPluginAsync } from 'fastify';
import { eq, desc, asc, ilike, and, sql } from 'drizzle-orm';
import { VIDEO_VISIBILITY, MODERATION_STATUS } from '@meditations/shared';
import { authenticate } from '../middleware/auth.js';
import { db, videos, users } from '../db/index.js';

export const videoRoutes: FastifyPluginAsync = async (fastify) => {
  // GET / - Browse public video library (no auth required)
  fastify.get('/', async (request, reply) => {
    const query = request.query as {
      search?: string;
      tags?: string;
      sortBy?: string;
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10) || 20));
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

    try {
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
    } catch (err) {
      request.log.error(err, 'Failed to list videos');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /my - Get current user's videos (requires auth)
  fastify.get('/my', { onRequest: [authenticate] }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10) || 20));
    const offset = (page - 1) * limit;

    try {
      const results = await db
        .select()
        .from(videos)
        .where(eq(videos.userId, request.user.id))
        .orderBy(desc(videos.createdAt))
        .limit(limit)
        .offset(offset);

      return { data: results, page, limit };
    } catch (err) {
      request.log.error(err, 'Failed to list user videos');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /:id - Get single video
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    // Optionally authenticate to check ownership
    let userId: string | undefined;
    try {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        await authenticate(request, reply);
        userId = request.user?.id;
      }
    } catch {
      // Auth is optional for this endpoint
    }

    try {
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

      // Allow owner to view their own videos regardless of visibility/moderation
      const isOwner = userId === video.userId;

      if (
        !isOwner &&
        (video.visibility !== VIDEO_VISIBILITY.PUBLIC ||
          video.moderationStatus !== MODERATION_STATUS.APPROVED)
      ) {
        return reply.status(404).send({ error: 'Video not found' });
      }

      // Increment view count
      await db
        .update(videos)
        .set({ viewCount: sql`${videos.viewCount} + 1` })
        .where(eq(videos.id, video.id));

      return video;
    } catch (err) {
      request.log.error(err, 'Failed to get video');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};

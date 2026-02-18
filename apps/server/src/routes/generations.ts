import { FastifyPluginAsync } from 'fastify';
import { eq, desc, and, sql } from 'drizzle-orm';
import {
  createGenerationRequestSchema,
  VIDEO_VISIBILITY,
  GENERATION_STATUS,
  CREDIT_TRANSACTION_TYPE,
} from '@meditations/shared';
import { authenticate } from '../middleware/auth.js';
import { db, users, generationRequests, creditTransactions } from '../db/index.js';
import { videoGenerateQueue } from '../jobs/queue.js';

// Credit costs by duration
const CREDITS_BY_DURATION: Record<number, number> = {
  60: 5,
  120: 8,
  180: 12,
  300: 15,
};

const PRIVATE_SURCHARGE = 3;

export const generationRoutes: FastifyPluginAsync = async (fastify) => {
  // All generation routes require authentication
  fastify.addHook('onRequest', authenticate);

  // POST / - Submit a generation request
  fastify.post('/', async (request, reply) => {
    const parsed = createGenerationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { visualPrompt, scriptType, scriptContent, durationSeconds, ambientSoundId, musicTrackId, visibility } = parsed.data;

    // Calculate credits needed
    let creditsNeeded = CREDITS_BY_DURATION[durationSeconds] || 5;
    if (visibility === VIDEO_VISIBILITY.PRIVATE) {
      creditsNeeded += PRIVATE_SURCHARGE;
    }

    let result;
    try {
      // Deduct credits and create generation request in a transaction
      result = await db.transaction(async (tx) => {
        // Atomically deduct credits only if balance is sufficient
        const [updated] = await tx
          .update(users)
          .set({
            creditsBalance: sql`${users.creditsBalance} - ${creditsNeeded}`,
            updatedAt: new Date(),
          })
          .where(and(
            eq(users.id, request.user.id),
            sql`${users.creditsBalance} >= ${creditsNeeded}`,
          ))
          .returning({ creditsBalance: users.creditsBalance });

        if (!updated) {
          throw new Error('INSUFFICIENT_CREDITS');
        }

        // Record transaction
        await tx.insert(creditTransactions).values({
          userId: request.user.id,
          amount: -creditsNeeded,
          type: CREDIT_TRANSACTION_TYPE.GENERATION_SPEND,
          description: `Video generation (${durationSeconds}s${visibility === VIDEO_VISIBILITY.PRIVATE ? ', private' : ''})`,
        });

        // Create generation request
        const [genRequest] = await tx
          .insert(generationRequests)
          .values({
            userId: request.user.id,
            status: GENERATION_STATUS.PENDING,
            visualPrompt,
            scriptType,
            scriptContent: scriptContent || null,
            durationSeconds,
            ambientSoundId: ambientSoundId || null,
            musicTrackId: musicTrackId || null,
            creditsCharged: creditsNeeded,
          })
          .returning();

        return genRequest;
      });
      // Enqueue the job before responding. If this fails, the catch block
      // marks the generation as FAILED and returns 500.
      await videoGenerateQueue.add(
        'generate',
        { generationRequestId: result.id },
        { jobId: result.id },
      );
    } catch (err) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_CREDITS') {
        return reply.status(402).send({
          error: 'Insufficient credits',
          required: creditsNeeded,
        });
      }

      // If the transaction succeeded but queue.add failed, mark generation as FAILED
      if (result) {
        try {
          await db
            .update(generationRequests)
            .set({ status: GENERATION_STATUS.FAILED, updatedAt: new Date() })
            .where(eq(generationRequests.id, result.id));
        } catch (cleanupErr) {
          request.log.error(cleanupErr, 'Failed to mark generation as FAILED after queue error');
        }
      }

      request.log.error(err, 'Failed to create generation request');
      return reply.status(500).send({ error: 'Internal server error' });
    }

    return reply.status(201).send(result);
  });

  // GET / - List user's generation requests
  fastify.get('/', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10) || 20));
    const offset = (page - 1) * limit;

    try {
      const results = await db
        .select()
        .from(generationRequests)
        .where(eq(generationRequests.userId, request.user.id))
        .orderBy(desc(generationRequests.createdAt))
        .limit(limit)
        .offset(offset);

      return { data: results, page, limit };
    } catch (err) {
      request.log.error(err, 'Failed to list generation requests');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /:id/progress - Get generation progress
  fastify.get<{ Params: { id: string } }>('/:id/progress', async (request, reply) => {
    try {
      const [genRequest] = await db
        .select({
          id: generationRequests.id,
          status: generationRequests.status,
          progress: generationRequests.progress,
          videoId: generationRequests.videoId,
        })
        .from(generationRequests)
        .where(and(
          eq(generationRequests.id, request.params.id),
          eq(generationRequests.userId, request.user.id),
        ))
        .limit(1);

      if (!genRequest) {
        return reply.status(404).send({ error: 'Generation request not found' });
      }

      return genRequest;
    } catch (err) {
      request.log.error(err, 'Failed to get generation progress');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};

import { FastifyPluginAsync } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import {
  createGenerationRequestSchema,
  VIDEO_VISIBILITY,
  GENERATION_STATUS,
  CREDIT_TRANSACTION_TYPE,
} from '@meditations/shared';
import { authenticate } from '../middleware/auth.js';
import { db, users, generationRequests, creditTransactions } from '../db/index.js';

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

    // Check user has enough credits
    if (request.user.creditsBalance < creditsNeeded) {
      return reply.status(402).send({
        error: 'Insufficient credits',
        required: creditsNeeded,
        balance: request.user.creditsBalance,
      });
    }

    // Deduct credits and create generation request in a transaction
    const result = await db.transaction(async (tx) => {
      // Deduct credits
      await tx
        .update(users)
        .set({
          creditsBalance: request.user.creditsBalance - creditsNeeded,
          updatedAt: new Date(),
        })
        .where(eq(users.id, request.user.id));

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

    // TODO: Enqueue BullMQ job here
    // await videoGenerateQueue.add('generate', { generationRequestId: result.id });

    return reply.status(201).send(result);
  });

  // GET / - List user's generation requests
  fastify.get('/', async (request) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const results = await db
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.userId, request.user.id))
      .orderBy(desc(generationRequests.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: results, page, limit };
  });

  // GET /:id/progress - Get generation progress
  fastify.get<{ Params: { id: string } }>('/:id/progress', async (request, reply) => {
    const [genRequest] = await db
      .select({
        id: generationRequests.id,
        status: generationRequests.status,
        progress: generationRequests.progress,
        videoId: generationRequests.videoId,
      })
      .from(generationRequests)
      .where(eq(generationRequests.id, request.params.id))
      .limit(1);

    if (!genRequest) {
      return reply.status(404).send({ error: 'Generation request not found' });
    }

    return genRequest;
  });
};

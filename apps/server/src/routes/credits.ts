import { FastifyPluginAsync } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import {
  purchaseCreditsSchema,
  DEFAULT_CREDIT_PACKS,
  CREDIT_TRANSACTION_TYPE,
} from '@meditations/shared';
import { authenticate } from '../middleware/auth.js';
import { db, users, creditTransactions } from '../db/index.js';

export const creditRoutes: FastifyPluginAsync = async (fastify) => {
  // All credit routes require authentication
  fastify.addHook('onRequest', authenticate);

  // GET / - Get credit balance and recent transactions
  fastify.get('/', async (request) => {
    const transactions = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, request.user.id))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(50);

    return {
      balance: request.user.creditsBalance,
      transactions,
    };
  });

  // GET /packs - Get available credit packs
  fastify.get('/packs', async () => {
    return { packs: DEFAULT_CREDIT_PACKS };
  });

  // POST /purchase - Purchase credits (Stripe web flow)
  fastify.post('/purchase', async (request, reply) => {
    const parsed = purchaseCreditsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const pack = DEFAULT_CREDIT_PACKS[parsed.data.packIndex];
    if (!pack) {
      return reply.status(400).send({ error: 'Invalid pack index' });
    }

    // TODO: Create Stripe PaymentIntent, confirm payment, then credit user
    // For now, stub the flow
    const stripePaymentId = `pi_stub_${Date.now()}`;

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          creditsBalance: request.user.creditsBalance + pack.credits,
          updatedAt: new Date(),
        })
        .where(eq(users.id, request.user.id));

      await tx.insert(creditTransactions).values({
        userId: request.user.id,
        amount: pack.credits,
        type: CREDIT_TRANSACTION_TYPE.PURCHASE,
        stripePaymentId,
        description: `Purchased ${pack.label} for $${pack.priceUsd}`,
      });
    });

    return {
      success: true,
      creditsAdded: pack.credits,
      newBalance: request.user.creditsBalance + pack.credits,
    };
  });
};

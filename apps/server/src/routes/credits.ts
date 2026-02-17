import { FastifyPluginAsync } from 'fastify';
import { eq, desc, sql } from 'drizzle-orm';
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
  fastify.get('/', async (request, reply) => {
    try {
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
    } catch (err) {
      request.log.error(err, 'Failed to get credit balance');
      return reply.status(500).send({ error: 'Internal server error' });
    }
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

    // TODO: Replace with Stripe integration
    request.log.warn('Credit purchase using stub payment flow — no real charge');
    const stripePaymentId = `pi_stub_${Date.now()}`;

    try {
      const [updated] = await db.transaction(async (tx) => {
        const [result] = await tx
          .update(users)
          .set({
            creditsBalance: sql`${users.creditsBalance} + ${pack.credits}`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, request.user.id))
          .returning({ creditsBalance: users.creditsBalance });

        await tx.insert(creditTransactions).values({
          userId: request.user.id,
          amount: pack.credits,
          type: CREDIT_TRANSACTION_TYPE.PURCHASE,
          stripePaymentId,
          description: `Purchased ${pack.label} for $${pack.priceUsd}`,
        });

        return [result];
      });

      return {
        success: true,
        creditsAdded: pack.credits,
        newBalance: updated.creditsBalance,
      };
    } catch (err) {
      request.log.error(err, 'Failed to purchase credits');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};

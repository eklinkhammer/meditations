import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { VALID_USER } from '../../test-helpers/fixtures.js';
import type { AuthUser } from '../../middleware/auth.js';

const mockSelect = vi.fn();
const mockTransaction = vi.fn();
vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
  users: { id: 'id', creditsBalance: 'creditsBalance', updatedAt: 'updatedAt' },
  creditTransactions: { userId: 'userId', createdAt: 'createdAt' },
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticate: async (request: any) => {
    request.user = { ...VALID_USER } as AuthUser;
  },
}));

import { creditRoutes } from '../credits.js';

describe('credit routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function buildApp() {
    const app = Fastify();
    await app.register(creditRoutes, { prefix: '/api/credits' });
    return app;
  }

  describe('GET /api/credits', () => {
    it('returns balance and transactions', async () => {
      const transactions = [
        {
          id: '1',
          userId: VALID_USER.id,
          amount: 10,
          type: 'purchase',
          stripePaymentId: null,
          iapReceiptId: null,
          description: null,
          createdAt: new Date(),
        },
      ];

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(transactions),
            }),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/credits' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.balance).toBe(VALID_USER.creditsBalance);
      expect(body.transactions).toHaveLength(1);
    });

    it('returns 500 on DB error', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockRejectedValue(new Error('DB failure')),
            }),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/credits' });

      expect(res.statusCode).toBe(500);
      expect(res.json().error).toMatch(/internal server error/i);
    });
  });

  describe('GET /api/credits/packs', () => {
    it('returns DEFAULT_CREDIT_PACKS', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/credits/packs' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.packs).toHaveLength(4);
      expect(body.packs[0].credits).toBe(10);
      expect(body.packs[0].priceUsd).toBe(4.99);
    });
  });

  describe('POST /api/credits/purchase', () => {
    it('adds credits and records transaction', async () => {
      const newBalance = VALID_USER.creditsBalance + 10;

      mockTransaction.mockImplementation(async (fn: Function) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ creditsBalance: newBalance }]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
        };
        return fn(tx);
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/credits/purchase',
        payload: { packIndex: 0, paymentMethodId: 'pm_123' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.creditsAdded).toBe(10);
      expect(body.newBalance).toBe(newBalance);
    });

    it('returns 400 for invalid packIndex (out of range)', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/credits/purchase',
        payload: { packIndex: 5, paymentMethodId: 'pm_123' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for missing paymentMethodId', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/credits/purchase',
        payload: { packIndex: 0 },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for negative packIndex', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/credits/purchase',
        payload: { packIndex: -1, paymentMethodId: 'pm_123' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 500 on DB error during purchase transaction', async () => {
      mockTransaction.mockImplementation(async () => {
        throw new Error('Transaction failed');
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/credits/purchase',
        payload: { packIndex: 0, paymentMethodId: 'pm_123' },
      });

      expect(res.statusCode).toBe(500);
      expect(res.json().error).toMatch(/internal server error/i);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { VALID_USER, VALID_GENERATION } from '../../test-helpers/fixtures.js';
import type { AuthUser } from '../../middleware/auth.js';

// Mock db
const mockTransaction = vi.fn();
const mockSelect = vi.fn();
vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
  users: { id: 'id', creditsBalance: 'creditsBalance', updatedAt: 'updatedAt' },
  generationRequests: {
    id: 'id',
    userId: 'userId',
    status: 'status',
    progress: 'progress',
    videoId: 'videoId',
    createdAt: 'createdAt',
  },
  creditTransactions: {},
}));

// Configurable user for mocked authenticate
let mockUser: AuthUser = { ...VALID_USER } as AuthUser;

vi.mock('../../middleware/auth.js', () => ({
  authenticate: async (request: any) => {
    request.user = mockUser;
  },
}));

import { generationRoutes } from '../generations.js';

const validBody = {
  visualPrompt: 'A peaceful mountain scene',
  scriptType: 'ai_generated',
  durationSeconds: 60,
};

function createSuccessfulTxMock(returnedGeneration: unknown, returnedBalance = 95) {
  return async (fn: Function) => {
    const txInsert = vi.fn();
    // First insert call: creditTransactions (no returning)
    txInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });
    // Second insert call: generationRequests (with returning)
    txInsert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([returnedGeneration]),
      }),
    });

    const tx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ creditsBalance: returnedBalance }]),
          }),
        }),
      }),
      insert: txInsert,
    };
    return fn(tx);
  };
}

function createInsufficientCreditsTxMock() {
  return async (fn: Function) => {
    const tx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            // WHERE clause doesn't match — returns empty array
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: vi.fn(),
    };
    return fn(tx);
  };
}

describe('generation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { ...VALID_USER } as AuthUser;
  });

  async function buildApp() {
    const app = Fastify();
    await app.register(generationRoutes, { prefix: '/api/generations' });
    return app;
  }

  describe('credit calculation', () => {
    it.each([
      [60, 5],
      [120, 8],
      [180, 12],
      [300, 15],
    ])('duration %ds costs %d credits', async (duration, expectedCredits) => {
      const createdGen = {
        ...VALID_GENERATION,
        durationSeconds: duration,
        creditsCharged: expectedCredits,
      };

      mockTransaction.mockImplementation(createSuccessfulTxMock(createdGen));

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: { ...validBody, durationSeconds: duration },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().creditsCharged).toBe(expectedCredits);
    });
  });

  describe('private surcharge', () => {
    it('adds 3 credits for private visibility', async () => {
      const createdGen = {
        ...VALID_GENERATION,
        creditsCharged: 8, // 5 + 3
      };

      mockTransaction.mockImplementation(createSuccessfulTxMock(createdGen));

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: { ...validBody, visibility: 'private' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().creditsCharged).toBe(8);
    });
  });

  describe('insufficient credits', () => {
    it('returns 402 when user has insufficient credits', async () => {
      mockTransaction.mockImplementation(createInsufficientCreditsTxMock());

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: validBody,
      });

      expect(res.statusCode).toBe(402);
      const body = res.json();
      expect(body.error).toMatch(/insufficient/i);
      expect(body.required).toBe(5);
    });
  });

  describe('atomic transaction', () => {
    it('deducts credits, records transaction, and creates generation in transaction', async () => {
      const txUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ creditsBalance: 95 }]),
          }),
        }),
      });
      const txInsert = vi.fn();
      txInsert.mockReturnValueOnce({
        values: vi.fn().mockResolvedValue(undefined),
      });
      txInsert.mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([VALID_GENERATION]),
        }),
      });

      mockTransaction.mockImplementation(async (fn: Function) => {
        return fn({ update: txUpdate, insert: txInsert });
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: validBody,
      });

      expect(res.statusCode).toBe(201);
      expect(mockTransaction).toHaveBeenCalledOnce();
      expect(txUpdate).toHaveBeenCalledOnce();
      expect(txInsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('validation', () => {
    it('returns 400 for invalid body', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: { invalid: true },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when scriptContent missing for user_provided scriptType', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          ...validBody,
          scriptType: 'user_provided',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('succeeds with valid scriptContent for user_provided scriptType', async () => {
      const createdGen = {
        ...VALID_GENERATION,
        scriptType: 'user_provided',
        scriptContent: 'Welcome to your meditation...',
      };

      mockTransaction.mockImplementation(createSuccessfulTxMock(createdGen));

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          ...validBody,
          scriptType: 'user_provided',
          scriptContent: 'Welcome to your meditation...',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().scriptType).toBe('user_provided');
    });
  });

  describe('DB error during transaction', () => {
    it('returns 500 for non-INSUFFICIENT_CREDITS transaction error', async () => {
      mockTransaction.mockImplementation(async (fn: Function) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ creditsBalance: 95 }]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockRejectedValue(new Error('DB connection lost')),
          }),
        };
        return fn(tx);
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: validBody,
      });

      expect(res.statusCode).toBe(500);
      expect(res.json().error).toMatch(/internal server error/i);
    });
  });

  describe('GET /api/generations', () => {
    function setupListMock(results: unknown[] = [VALID_GENERATION]) {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(results),
              }),
            }),
          }),
        }),
      });
    }

    it('returns paginated list', async () => {
      setupListMock();

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/generations' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });

    it('clamps limit to max 50', async () => {
      setupListMock([]);
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/generations?limit=100',
      });

      expect(res.json().limit).toBe(50);
    });

    it('clamps page to min 1', async () => {
      setupListMock([]);
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/generations?page=0',
      });

      expect(res.json().page).toBe(1);
    });

    it('returns 500 on DB error', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockRejectedValue(new Error('DB failure')),
              }),
            }),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/generations' });

      expect(res.statusCode).toBe(500);
      expect(res.json().error).toMatch(/internal server error/i);
    });
  });

  describe('GET /api/generations/:id/progress', () => {
    it('returns progress for existing generation', async () => {
      const progress = {
        id: VALID_GENERATION.id,
        status: 'generating_video',
        progress: 50,
        videoId: null,
      };

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([progress]),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/generations/${VALID_GENERATION.id}/progress`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().progress).toBe(50);
      expect(res.json().status).toBe('generating_video');
    });

    it('returns 404 for non-existent generation', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/generations/nonexistent-id/progress',
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 500 on DB error', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('DB failure')),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/generations/${VALID_GENERATION.id}/progress`,
      });

      expect(res.statusCode).toBe(500);
      expect(res.json().error).toMatch(/internal server error/i);
    });
  });
});

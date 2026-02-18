import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockGetUser,
  mockDbSelect,
  mockDbUpdate,
  mockDbInsert,
  mockDbTransaction,
  mockSql,
} = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockGetUser: fn(),
    mockDbSelect: fn(),
    mockDbUpdate: fn(),
    mockDbInsert: fn(),
    mockDbTransaction: fn(),
    mockSql: fn().mockResolvedValue([{ '?column?': 1 }]),
  };
});

vi.mock('../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
  sql: mockSql,
  users: { id: 'id', email: 'email', displayName: 'displayName', role: 'role', authProvider: 'authProvider', creditsBalance: 'creditsBalance', isPremium: 'isPremium', createdAt: 'createdAt', updatedAt: 'updatedAt' },
  videos: { id: 'id', userId: 'userId', title: 'title', storageKey: 'storageKey', thumbnailKey: 'thumbnailKey', durationSeconds: 'durationSeconds', visibility: 'visibility', moderationStatus: 'moderationStatus', visualPrompt: 'visualPrompt', tags: 'tags', viewCount: 'viewCount', likeCount: 'likeCount', createdAt: 'createdAt', updatedAt: 'updatedAt' },
  generationRequests: { id: 'id', userId: 'userId', status: 'status', visualPrompt: 'visualPrompt', scriptType: 'scriptType', scriptContent: 'scriptContent', durationSeconds: 'durationSeconds', ambientSoundId: 'ambientSoundId', musicTrackId: 'musicTrackId', videoProvider: 'videoProvider', voiceProvider: 'voiceProvider', creditsCharged: 'creditsCharged', progress: 'progress', videoId: 'videoId', createdAt: 'createdAt', updatedAt: 'updatedAt' },
  creditTransactions: { id: 'id', userId: 'userId', amount: 'amount', type: 'type', stripePaymentId: 'stripePaymentId', iapReceiptId: 'iapReceiptId', description: 'description', createdAt: 'createdAt' },
  ambientSounds: { id: 'id', name: 'name', storageKey: 'storageKey', category: 'category', isLoopable: 'isLoopable' },
  musicTracks: { id: 'id', name: 'name', storageKey: 'storageKey', mood: 'mood', licenseType: 'licenseType' },
  scriptTemplates: { id: 'id', title: 'title', category: 'category', scriptText: 'scriptText', durationHint: 'durationHint', createdAt: 'createdAt' },
  pricingConfig: { id: 'id', key: 'key', value: 'value', updatedAt: 'updatedAt' },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock('../config.js', () => ({
  config: {
    port: 3001, nodeEnv: 'test', logLevel: 'silent',
    corsOrigins: ['http://localhost:3000'],
    database: { url: 'postgresql://test:test@localhost:5432/test' },
    redis: { url: 'redis://localhost:6379' },
    supabase: { url: 'https://test.supabase.co', anonKey: 'test-anon-key', serviceRoleKey: 'test-key' },
    s3: { endpoint: 'https://s3.test.com', accessKey: 'test', secretKey: 'test', bucket: 'test', publicUrl: 'https://cdn.test.com' },
    stripe: { secretKey: 'sk_test_123', webhookSecret: 'whsec_test_123' },
    ai: {},
  },
}));

import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { VALID_USER, VALID_VIDEO, VALID_GENERATION, ZERO_CREDIT_USER } from '../test-helpers/fixtures.js';
import { chainableSelectMock, mockValidAuth, AUTH_HEADER } from './helpers/setup.js';

describe('User Flows', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockGetUser.mockReset();
    mockDbSelect.mockReset();
    mockDbUpdate.mockReset();
    mockDbInsert.mockReset();
    mockDbTransaction.mockReset();
    mockSql.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // Flow 1: Browse & view video (no auth)
  // -------------------------------------------------------------------------
  it('browse and view video flow (no auth)', async () => {
    const videoListItem = {
      id: VALID_VIDEO.id,
      title: VALID_VIDEO.title,
      thumbnailKey: VALID_VIDEO.thumbnailKey,
      durationSeconds: VALID_VIDEO.durationSeconds,
      visibility: VALID_VIDEO.visibility,
      viewCount: VALID_VIDEO.viewCount,
      likeCount: VALID_VIDEO.likeCount,
      createdAt: VALID_VIDEO.createdAt,
      user: { id: VALID_USER.id, displayName: VALID_USER.displayName },
    };

    // Step 1: GET /api/videos → list
    const listSelect = chainableSelectMock([videoListItem]);
    mockDbSelect.mockImplementation((...args: unknown[]) => listSelect(...args));

    const listRes = await app.inject({ method: 'GET', url: '/api/videos' });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].id).toBe(VALID_VIDEO.id);

    // Step 2: GET /api/videos/:id → detail (view count incremented)
    const videoDetail = {
      ...VALID_VIDEO,
      user: { id: VALID_USER.id, displayName: VALID_USER.displayName },
    };
    const detailSelect = chainableSelectMock([videoDetail]);
    mockDbSelect.mockImplementation((...args: unknown[]) => detailSelect(...args));

    const updateChain: Record<string, unknown> = {};
    ['set', 'where', 'returning'].forEach(m => { updateChain[m] = vi.fn().mockReturnValue(updateChain); });
    updateChain.then = (resolve: (val: unknown) => void) => resolve(undefined);
    mockDbUpdate.mockReturnValue(updateChain);

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/videos/${VALID_VIDEO.id}`,
    });
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json().id).toBe(VALID_VIDEO.id);
    expect(mockDbUpdate).toHaveBeenCalled(); // view count increment
  });

  // -------------------------------------------------------------------------
  // Flow 2: Credit purchase → generation
  // -------------------------------------------------------------------------
  it('credit purchase → generation flow', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);

    // Step 1: GET /api/credits (check balance)
    const creditsRes = await app.inject({
      method: 'GET',
      url: '/api/credits',
      headers: AUTH_HEADER,
    });
    expect(creditsRes.statusCode).toBe(200);
    expect(creditsRes.json().balance).toBe(VALID_USER.creditsBalance);

    // Step 2: POST /api/credits/purchase
    const newBalance = VALID_USER.creditsBalance + 10;
    mockDbTransaction.mockImplementation(async (fn: Function) => {
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

    const purchaseRes = await app.inject({
      method: 'POST',
      url: '/api/credits/purchase',
      headers: AUTH_HEADER,
      payload: { packIndex: 0, paymentMethodId: 'pm_123' },
    });
    expect(purchaseRes.statusCode).toBe(200);
    expect(purchaseRes.json().success).toBe(true);
    expect(purchaseRes.json().creditsAdded).toBe(10);

    // Step 3: POST /api/generations (credits deducted)
    const genResult = {
      ...VALID_GENERATION,
      id: '770e8400-e29b-41d4-a716-446655440001',
    };
    mockDbTransaction.mockImplementation(async (fn: Function) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ creditsBalance: newBalance - 5 }]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([genResult]),
          }),
        }),
      };
      return fn(tx);
    });

    const genRes = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: AUTH_HEADER,
      payload: {
        visualPrompt: 'A peaceful mountain scene',
        scriptType: 'ai_generated',
        durationSeconds: 60,
      },
    });
    expect(genRes.statusCode).toBe(201);
    expect(genRes.json().id).toBe(genResult.id);

    // Step 4: GET /api/generations/:id/progress
    const progressSelect = chainableSelectMock([{
      id: genResult.id,
      status: 'pending',
      progress: 0,
      videoId: null,
    }]);
    mockDbSelect.mockImplementation((...args: unknown[]) => progressSelect(...args));

    const progressRes = await app.inject({
      method: 'GET',
      url: `/api/generations/${genResult.id}/progress`,
      headers: AUTH_HEADER,
    });
    expect(progressRes.statusCode).toBe(200);
    expect(progressRes.json().status).toBe('pending');
  });

  // -------------------------------------------------------------------------
  // Flow 3: Insufficient credits → purchase → retry
  // -------------------------------------------------------------------------
  it('insufficient credits → purchase → retry generation', async () => {
    // Start with zero credits user
    mockValidAuth(mockGetUser, mockDbSelect, ZERO_CREDIT_USER);

    // Step 1: POST /api/generations → 402 (insufficient credits)
    mockDbTransaction.mockImplementation(async (fn: Function) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]), // no rows = insufficient
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
      return fn(tx);
    });

    const failRes = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: AUTH_HEADER,
      payload: {
        visualPrompt: 'A peaceful scene',
        scriptType: 'ai_generated',
        durationSeconds: 60,
      },
    });
    expect(failRes.statusCode).toBe(402);
    expect(failRes.json().error).toMatch(/insufficient credits/i);

    // Step 2: POST /api/credits/purchase
    mockDbTransaction.mockImplementation(async (fn: Function) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ creditsBalance: 10 }]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };
      return fn(tx);
    });

    const purchaseRes = await app.inject({
      method: 'POST',
      url: '/api/credits/purchase',
      headers: AUTH_HEADER,
      payload: { packIndex: 0, paymentMethodId: 'pm_123' },
    });
    expect(purchaseRes.statusCode).toBe(200);
    expect(purchaseRes.json().success).toBe(true);

    // Step 3: POST /api/generations → 201 (now has credits)
    const genResult = { ...VALID_GENERATION };
    mockDbTransaction.mockImplementation(async (fn: Function) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ creditsBalance: 5 }]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([genResult]),
          }),
        }),
      };
      return fn(tx);
    });

    const retryRes = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: AUTH_HEADER,
      payload: {
        visualPrompt: 'A peaceful scene',
        scriptType: 'ai_generated',
        durationSeconds: 60,
      },
    });
    expect(retryRes.statusCode).toBe(201);
  });
});

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

vi.mock('../db/index.js', () => {
  return {
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
  };
});

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
import { VALID_USER, ADMIN_USER } from '../test-helpers/fixtures.js';
import { mockValidAuth, mockAdminAuth, AUTH_HEADER } from './helpers/setup.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setupEmptySelect() {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('App Assembly', () => {
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

  it('buildApp() resolves without throwing', () => {
    expect(app).toBeDefined();
    expect(app.server).toBeDefined();
  });

  it('GET /health → 200 with status, db, timestamp', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('db');
    expect(body).toHaveProperty('timestamp');
  });

  it('GET /api/videos → 200 (public, no auth)', async () => {
    setupEmptySelect();
    const res = await app.inject({ method: 'GET', url: '/api/videos' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('page');
  });

  it('GET /api/media/ambient-sounds → 200 (public, no auth)', async () => {
    setupEmptySelect();
    const res = await app.inject({ method: 'GET', url: '/api/media/ambient-sounds' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('data');
  });

  it('GET /api/users with valid auth → 200', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);
    // After auth, the GET /api/users route also does a db.select
    // mockDbSelect is already set up by mockValidAuth — the auth middleware
    // uses one call, then the route handler needs one. We set it up to
    // return user on every call.
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /api/credits with valid auth → 200', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);
    const res = await app.inject({
      method: 'GET',
      url: '/api/credits',
      headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /api/generations with valid auth → 200', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);
    const res = await app.inject({
      method: 'GET',
      url: '/api/generations',
      headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /api/admin/stats with admin auth → 200', async () => {
    mockAdminAuth(mockGetUser, mockDbSelect);
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /api/nonexistent → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});

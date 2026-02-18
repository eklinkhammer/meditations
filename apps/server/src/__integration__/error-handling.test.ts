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

vi.mock('../jobs/queue.js', () => ({
  videoGenerateQueue: {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  },
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
import { VALID_USER } from '../test-helpers/fixtures.js';
import { chainableSelectMock, mockValidAuth, AUTH_HEADER } from './helpers/setup.js';

describe('Error Handling', () => {
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

  it('401 responses have { error: string } with content-type application/json', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const body = res.json();
    expect(typeof body.error).toBe('string');
  });

  it('403 responses have { error: string } with content-type application/json', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(403);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const body = res.json();
    expect(typeof body.error).toBe('string');
  });

  it('400 validation errors have { error: ... } (Zod flatten format)', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users',
      headers: AUTH_HEADER,
      payload: { displayName: '' }, // too short or invalid
    });
    // The route validates with Zod — if body is empty object, it should pass
    // Let's test with actually invalid fields
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/credits/purchase',
      headers: AUTH_HEADER,
      payload: {}, // missing required fields
    });
    expect(res2.statusCode).toBe(400);
    expect(res2.headers['content-type']).toMatch(/application\/json/);
    const body = res2.json();
    expect(body).toHaveProperty('error');
  });

  it('500 responses have { error: "Internal server error" } with no stack traces', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);
    // Make the select throw for the route handler (after auth succeeds)
    // We need auth to pass first, then route's select to fail.
    // Override mockDbSelect to succeed once (auth), then fail.
    const authUser = VALID_USER;
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          email: authUser.email,
          user_metadata: { full_name: authUser.displayName },
          app_metadata: { provider: 'google' },
        },
      },
      error: null,
    });

    // Auth select: succeed
    const authChain = chainableSelectMock([authUser]);
    // Route select: throw
    const errorChain = chainableSelectMock([]);
    // Override the terminal to throw
    let callCount = 0;
    mockDbSelect.mockImplementation((...args: unknown[]) => {
      callCount++;
      if (callCount === 1) {
        return authChain(...args);
      }
      // Make it throw
      const chain: Record<string, unknown> = {};
      ['from', 'where', 'innerJoin', 'orderBy', 'leftJoin'].forEach(m => {
        chain[m] = vi.fn().mockReturnValue(chain);
      });
      chain.limit = vi.fn().mockImplementation(() => {
        const limChain: Record<string, unknown> = { ...chain };
        limChain.offset = vi.fn().mockRejectedValue(new Error('DB connection lost'));
        limChain.then = (_: unknown, reject: (err: Error) => void) => reject(new Error('DB connection lost'));
        return limChain;
      });
      chain.then = (_: unknown, reject: (err: Error) => void) => reject(new Error('DB connection lost'));
      return chain;
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/credits',
      headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const body = res.json();
    expect(body.error).toMatch(/internal server error/i);
    // No stack trace leaked
    expect(body.stack).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/at\s+\w+\s*\(/);
  });

  it('404 on unknown route returns JSON', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nonexistent' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('all error responses include content-type application/json', async () => {
    // 401
    const r401 = await app.inject({ method: 'GET', url: '/api/users' });
    expect(r401.headers['content-type']).toMatch(/application\/json/);

    // 404
    const r404 = await app.inject({ method: 'GET', url: '/api/nonexistent' });
    expect(r404.headers['content-type']).toMatch(/application\/json/);

    // 403
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);
    const r403 = await app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: AUTH_HEADER,
    });
    expect(r403.headers['content-type']).toMatch(/application\/json/);
  });
});

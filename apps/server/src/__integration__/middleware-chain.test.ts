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
import { chainableSelectMock, mockValidAuth, AUTH_HEADER } from './helpers/setup.js';
import { VALID_USER } from '../test-helpers/fixtures.js';

describe('Middleware Chain', () => {
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

  it('response includes helmet security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('CORS preflight with allowed origin returns correct headers', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'GET',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('CORS with disallowed origin does not return allow-origin header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        origin: 'https://evil.com',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate-limit headers are present', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('helmet headers present on multiple route prefixes', async () => {
    const selectMock = chainableSelectMock([]);
    mockDbSelect.mockImplementation((...args: unknown[]) => selectMock(...args));

    const routes = ['/health', '/api/videos'];
    for (const url of routes) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-download-options']).toBe('noopen');
    }

    // Also check authenticated route
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);
    const authRes = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: AUTH_HEADER,
    });
    expect(authRes.headers['x-content-type-options']).toBe('nosniff');
  });
});

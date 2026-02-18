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
import { VALID_USER, ADMIN_USER } from '../test-helpers/fixtures.js';
import {
  chainableSelectMock,
  mockValidAuth,
  mockAdminAuth,
  mockInvalidAuth,
  AUTH_HEADER,
} from './helpers/setup.js';

describe('Auth Flows', () => {
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
  // Public routes — should work without auth
  // -------------------------------------------------------------------------
  describe('Public routes without auth → 200', () => {
    beforeEach(() => {
      const selectMock = chainableSelectMock([]);
      mockDbSelect.mockImplementation((...args: unknown[]) => selectMock(...args));
    });

    it('GET /health', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /api/videos', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/videos' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /api/videos/:id (public video)', async () => {
      const selectMock = chainableSelectMock([{
        id: '660e8400-e29b-41d4-a716-446655440000',
        userId: VALID_USER.id,
        title: 'Test',
        storageKey: 'videos/test.mp4',
        thumbnailKey: 'thumbs/test.jpg',
        durationSeconds: 120,
        visibility: 'public',
        moderationStatus: 'approved',
        visualPrompt: 'Test',
        tags: [],
        viewCount: 10,
        likeCount: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: { id: VALID_USER.id, displayName: VALID_USER.displayName },
      }]);
      mockDbSelect.mockImplementation((...args: unknown[]) => selectMock(...args));

      const updateChain: Record<string, unknown> = {};
      ['set', 'where', 'returning'].forEach(m => { updateChain[m] = vi.fn().mockReturnValue(updateChain); });
      updateChain.then = (resolve: (val: unknown) => void) => resolve(undefined);
      mockDbUpdate.mockReturnValue(updateChain);

      const res = await app.inject({
        method: 'GET',
        url: '/api/videos/660e8400-e29b-41d4-a716-446655440000',
      });
      expect(res.statusCode).toBe(200);
    });

    it('GET /api/media/ambient-sounds', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/media/ambient-sounds' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /api/media/music-tracks', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/media/music-tracks' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /api/media/script-templates', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/media/script-templates' });
      expect(res.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Protected routes — should reject without auth
  // -------------------------------------------------------------------------
  describe('Protected routes without auth → 401', () => {
    it('GET /api/users', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/users' });
      expect(res.statusCode).toBe(401);
    });

    it('PATCH /api/users', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/users',
        payload: { displayName: 'New' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /api/credits', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/credits' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /api/credits/purchase', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/credits/purchase',
        payload: { packIndex: 0, paymentMethodId: 'pm_123' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /api/generations', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/generations' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /api/generations', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          visualPrompt: 'Test',
          scriptType: 'ai_generated',
          durationSeconds: 60,
        },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Admin routes
  // -------------------------------------------------------------------------
  describe('Admin routes without auth → 401', () => {
    it('GET /api/admin/stats', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/admin/stats' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /api/admin/moderation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/moderation',
        payload: { videoId: '123', action: 'approve' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Admin routes with non-admin auth → 403', () => {
    beforeEach(() => {
      mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);
    });

    it('GET /api/admin/stats', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/stats',
        headers: AUTH_HEADER,
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /api/admin/moderation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/moderation',
        headers: AUTH_HEADER,
        payload: { videoId: '123', action: 'approve' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Auth populates user correctly
  // -------------------------------------------------------------------------
  it('GET /api/users with valid auth returns user data matching mock', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(VALID_USER.id);
    expect(body.email).toBe(VALID_USER.email);
  });
});

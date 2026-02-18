/**
 * Integration test helpers.
 *
 * IMPORTANT: Each test file must still call vi.mock() at its own top level
 * (vi.mock is hoisted). This module exports the mock functions and helpers
 * that those vi.mock() calls should reference.
 */
import { vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { VALID_USER, ADMIN_USER } from '../../test-helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Hoisted mock functions — import these in vi.hoisted() blocks
// ---------------------------------------------------------------------------
export function createHoistedMocks(): {
  mockGetUser: import('vitest').Mock;
  mockDbSelect: import('vitest').Mock;
  mockDbUpdate: import('vitest').Mock;
  mockDbInsert: import('vitest').Mock;
  mockDbTransaction: import('vitest').Mock;
  mockSql: import('vitest').Mock;
} {
  return {
    mockGetUser: vi.fn(),
    mockDbSelect: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockDbInsert: vi.fn(),
    mockDbTransaction: vi.fn(),
    mockSql: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  };
}

// ---------------------------------------------------------------------------
// Schema table column mocks (same pattern as unit tests)
// ---------------------------------------------------------------------------
export const mockTables = {
  users: {
    id: 'id',
    email: 'email',
    displayName: 'displayName',
    role: 'role',
    authProvider: 'authProvider',
    creditsBalance: 'creditsBalance',
    isPremium: 'isPremium',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  videos: {
    id: 'id',
    userId: 'userId',
    title: 'title',
    storageKey: 'storageKey',
    thumbnailKey: 'thumbnailKey',
    durationSeconds: 'durationSeconds',
    visibility: 'visibility',
    moderationStatus: 'moderationStatus',
    visualPrompt: 'visualPrompt',
    tags: 'tags',
    viewCount: 'viewCount',
    likeCount: 'likeCount',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  generationRequests: {
    id: 'id',
    userId: 'userId',
    status: 'status',
    visualPrompt: 'visualPrompt',
    scriptType: 'scriptType',
    scriptContent: 'scriptContent',
    durationSeconds: 'durationSeconds',
    ambientSoundId: 'ambientSoundId',
    musicTrackId: 'musicTrackId',
    videoProvider: 'videoProvider',
    voiceProvider: 'voiceProvider',
    creditsCharged: 'creditsCharged',
    progress: 'progress',
    videoId: 'videoId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  creditTransactions: {
    id: 'id',
    userId: 'userId',
    amount: 'amount',
    type: 'type',
    stripePaymentId: 'stripePaymentId',
    iapReceiptId: 'iapReceiptId',
    description: 'description',
    createdAt: 'createdAt',
  },
  ambientSounds: {
    id: 'id',
    name: 'name',
    storageKey: 'storageKey',
    category: 'category',
    isLoopable: 'isLoopable',
  },
  musicTracks: {
    id: 'id',
    name: 'name',
    storageKey: 'storageKey',
    mood: 'mood',
    licenseType: 'licenseType',
  },
  scriptTemplates: {
    id: 'id',
    title: 'title',
    category: 'category',
    scriptText: 'scriptText',
    durationHint: 'durationHint',
    createdAt: 'createdAt',
  },
  pricingConfig: {
    id: 'id',
    key: 'key',
    value: 'value',
    updatedAt: 'updatedAt',
  },
};

// ---------------------------------------------------------------------------
// DB mock factory — returns the object to use as vi.mock return value
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDbMockFactory(mocks: ReturnType<typeof createHoistedMocks>): any {
  return {
    db: {
      select: (...args: unknown[]) => mocks.mockDbSelect(...args),
      update: (...args: unknown[]) => mocks.mockDbUpdate(...args),
      insert: (...args: unknown[]) => mocks.mockDbInsert(...args),
      transaction: (...args: unknown[]) => mocks.mockDbTransaction(...args),
    },
    sql: mocks.mockSql,
    ...mockTables,
  };
}

// ---------------------------------------------------------------------------
// Config mock
// ---------------------------------------------------------------------------
export const mockConfig = {
  config: {
    port: 3001,
    nodeEnv: 'test',
    logLevel: 'silent',
    corsOrigins: ['http://localhost:3000'],
    database: { url: 'postgresql://test:test@localhost:5432/test' },
    redis: { url: 'redis://localhost:6379' },
    supabase: {
      url: 'https://test.supabase.co',
      anonKey: 'test-anon-key',
      serviceRoleKey: 'test-key',
    },
    s3: {
      endpoint: 'https://s3.test.com',
      accessKey: 'test-access-key',
      secretKey: 'test-secret-key',
      bucket: 'test-bucket',
      publicUrl: 'https://cdn.test.com',
    },
    stripe: {
      secretKey: 'sk_test_123',
      webhookSecret: 'whsec_test_123',
    },
    ai: {},
  },
};

// ---------------------------------------------------------------------------
// App factory — call AFTER vi.mock() declarations in each test file
// ---------------------------------------------------------------------------
export async function createTestApp(): Promise<FastifyInstance> {
  const { buildApp } = await import('../../app.js');
  return buildApp({ logger: false });
}

// ---------------------------------------------------------------------------
// Chainable select mock — handles any chain order, resolves to `data`
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function chainableSelectMock(data: unknown[] = []): any {
  const chain: Record<string, unknown> = {};
  const self = vi.fn().mockReturnValue(chain);
  const methods = ['from', 'where', 'innerJoin', 'orderBy', 'limit', 'offset', 'leftJoin'];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  // Terminal: when no more methods are called, resolve the data.
  // Override limit to also resolve as a promise (for chains ending at .limit())
  (chain.limit as ReturnType<typeof vi.fn>).mockImplementation(() => {
    const limChain: Record<string, unknown> = { ...chain, then: (resolve: (val: unknown) => void) => resolve(data) };
    limChain.offset = vi.fn().mockResolvedValue(data);
    return limChain;
  });
  // Also make the chain itself thenable for direct await
  chain.then = (resolve: (val: unknown) => void) => resolve(data);
  return self;
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
export function mockValidAuth(
  mockGetUser: ReturnType<typeof vi.fn>,
  mockDbSelect: ReturnType<typeof vi.fn>,
  user = VALID_USER,
) {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        email: user.email,
        user_metadata: { full_name: user.displayName },
        app_metadata: { provider: 'google' },
      },
    },
    error: null,
  });

  // Use chainable mock that works for any query chain shape.
  // Auth middleware calls db.select().from().where().limit()
  // Route handlers call various chain shapes — this handles all of them.
  const selectMock = chainableSelectMock([user]);
  mockDbSelect.mockImplementation((...args: unknown[]) => selectMock(...args));
}

export function mockAdminAuth(
  mockGetUser: ReturnType<typeof vi.fn>,
  mockDbSelect: ReturnType<typeof vi.fn>,
) {
  mockValidAuth(mockGetUser, mockDbSelect, ADMIN_USER);
}

export function mockInvalidAuth(mockGetUser: ReturnType<typeof vi.fn>) {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: new Error('Invalid token'),
  });
}

// ---------------------------------------------------------------------------
// Reset helper
// ---------------------------------------------------------------------------
export function resetAllMocks(mocks: ReturnType<typeof createHoistedMocks>) {
  mocks.mockGetUser.mockReset();
  mocks.mockDbSelect.mockReset();
  mocks.mockDbUpdate.mockReset();
  mocks.mockDbInsert.mockReset();
  mocks.mockDbTransaction.mockReset();
  mocks.mockSql.mockReset().mockResolvedValue([{ '?column?': 1 }]);
}

// ---------------------------------------------------------------------------
// Auth header helper
// ---------------------------------------------------------------------------
export const AUTH_HEADER = { authorization: 'Bearer valid-test-token' };

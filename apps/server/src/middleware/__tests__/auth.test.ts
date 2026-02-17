import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Use vi.hoisted to declare mocks before vi.mock() hoisting
const { mockGetUser, mockDbSelect, mockDbInsert } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
}));

// Mock db/index.js before importing anything that uses it
vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
  users: { id: 'id', email: 'email' },
}));

// Mock supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

// Mock config
vi.mock('../../config.js', () => ({
  config: {
    supabase: {
      url: 'https://test.supabase.co',
      serviceRoleKey: 'test-key',
    },
  },
}));

import { authenticate } from '../../middleware/auth.js';

const EXISTING_USER = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'user',
  creditsBalance: 100,
  isPremium: false,
};

function setupDbSelectReturns(user: unknown | null) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(user ? [user] : []),
      }),
    }),
  });
}

describe('authenticate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function buildApp() {
    const app = Fastify();
    app.get('/test', { onRequest: [authenticate] }, async (request) => {
      return { user: request.user };
    });
    return app;
  }

  it('returns 401 for missing Authorization header', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/missing|invalid/i);
  });

  it('returns 401 for malformed Authorization header (no Bearer prefix)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Token abc123' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for invalid Supabase token', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid token'),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer invalid-token' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/invalid|expired/i);
  });

  it('populates request.user for valid token with existing user', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          email: EXISTING_USER.email,
          user_metadata: { full_name: 'Test User' },
          app_metadata: { provider: 'google' },
        },
      },
      error: null,
    });

    setupDbSelectReturns(EXISTING_USER);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.id).toBe(EXISTING_USER.id);
    expect(body.user.email).toBe(EXISTING_USER.email);
    expect(body.user.role).toBe('user');
  });

  it('auto-creates DB record for new user and derives displayName from metadata', async () => {
    const newEmail = 'new@example.com';
    const newUser = {
      id: '550e8400-e29b-41d4-a716-446655440099',
      email: newEmail,
      displayName: 'Full Name',
      role: 'user',
      creditsBalance: 0,
      isPremium: false,
    };

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          email: newEmail,
          user_metadata: { full_name: 'Full Name' },
          app_metadata: { provider: 'google' },
        },
      },
      error: null,
    });

    // First select: user not found
    setupDbSelectReturns(null);

    // Insert: create new user
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([newUser]),
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe(newEmail);
    expect(body.user.displayName).toBe('Full Name');
  });

  it('returns 401 when Supabase user has no email', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          email: null,
          user_metadata: {},
          app_metadata: {},
        },
      },
      error: null,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/email.*required/i);
  });

  it('falls back to email prefix when full_name is absent', async () => {
    const newEmail = 'fallback@example.com';
    const newUser = {
      id: '550e8400-e29b-41d4-a716-446655440098',
      email: newEmail,
      displayName: 'fallback',
      role: 'user',
      creditsBalance: 0,
      isPremium: false,
    };

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          email: newEmail,
          user_metadata: {},
          app_metadata: { provider: 'email' },
        },
      },
      error: null,
    });

    setupDbSelectReturns(null);

    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([newUser]),
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.displayName).toBe('fallback');
  });

  it('recovers from race condition when insert throws but retry select finds user', async () => {
    const email = 'race@example.com';
    const raceUser = {
      id: '550e8400-e29b-41d4-a716-446655440097',
      email,
      displayName: 'Race User',
      role: 'user',
      creditsBalance: 0,
      isPremium: false,
    };

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          email,
          user_metadata: { full_name: 'Race User' },
          app_metadata: { provider: 'email' },
        },
      },
      error: null,
    });

    // First select: not found
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    // Insert throws (race condition)
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error('unique_violation')),
      }),
    });

    // Second select (retry): user found
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([raceUser]),
        }),
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(email);
  });

  it('returns 500 when insert throws and retry select also finds nothing', async () => {
    const email = 'fail@example.com';

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          email,
          user_metadata: { full_name: 'Fail User' },
          app_metadata: { provider: 'email' },
        },
      },
      error: null,
    });

    // First select: not found
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    // Insert throws
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error('unique_violation')),
      }),
    });

    // Retry select: still not found
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().error).toMatch(/failed to create user/i);
  });
});

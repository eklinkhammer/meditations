import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { VALID_USER } from '../../test-helpers/fixtures.js';
import type { AuthUser } from '../../middleware/auth.js';

// Mock db
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
  users: {
    id: 'id',
    email: 'email',
    displayName: 'displayName',
    role: 'role',
    creditsBalance: 'creditsBalance',
    isPremium: 'isPremium',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
}));

// Mock authenticate middleware
vi.mock('../../middleware/auth.js', () => ({
  authenticate: async (request: any) => {
    request.user = VALID_USER as AuthUser;
  },
}));

import { userRoutes } from '../users.js';

describe('user routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function buildApp() {
    const app = Fastify();
    await app.register(userRoutes, { prefix: '/api/users' });
    return app;
  }

  describe('GET /api/users', () => {
    it('returns user profile', async () => {
      const userProfile = {
        ...VALID_USER,
        createdAt: new Date('2024-01-01').toISOString(),
        updatedAt: new Date('2024-01-01').toISOString(),
      };

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([userProfile]),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/users' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(VALID_USER.id);
      expect(body.email).toBe(VALID_USER.email);
    });
  });

  describe('PATCH /api/users', () => {
    it('updates displayName', async () => {
      const updatedUser = {
        ...VALID_USER,
        displayName: 'New Name',
        createdAt: new Date('2024-01-01').toISOString(),
        updatedAt: new Date('2024-01-02').toISOString(),
      };

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedUser]),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/users',
        payload: { displayName: 'New Name' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().displayName).toBe('New Name');
    });

    it('returns 400 for invalid body', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/users',
        payload: { displayName: 123 },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});

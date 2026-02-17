import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { ADMIN_USER, VALID_USER, VALID_VIDEO } from '../../test-helpers/fixtures.js';
import type { AuthUser } from '../../middleware/auth.js';

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
  users: { id: 'id', createdAt: 'createdAt' },
  videos: {
    id: 'id',
    visibility: 'visibility',
    moderationStatus: 'moderationStatus',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  pricingConfig: { key: 'key' },
}));

// Default: admin auth
let currentUser: AuthUser = ADMIN_USER as AuthUser;

vi.mock('../../middleware/auth.js', () => ({
  authenticate: async (request: any) => {
    request.user = currentUser;
  },
}));

vi.mock('../../middleware/admin.js', async () => {
  const { USER_ROLES } = await import('@meditations/shared');
  return {
    requireAdmin: async (request: any, reply: any) => {
      if (request.user.role !== USER_ROLES.ADMIN) {
        return reply.status(403).send({ error: 'Admin access required' });
      }
    },
  };
});

import { adminRoutes } from '../admin.js';

describe('admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = ADMIN_USER as AuthUser;
  });

  async function buildApp() {
    const app = Fastify();
    await app.register(adminRoutes, { prefix: '/api/admin' });
    return app;
  }

  describe('non-admin access', () => {
    it('returns 403 on GET /stats for non-admin', async () => {
      currentUser = VALID_USER as AuthUser;
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/admin/stats' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 403 on GET /users for non-admin', async () => {
      currentUser = VALID_USER as AuthUser;
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/admin/users' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 403 on POST /moderation for non-admin', async () => {
      currentUser = VALID_USER as AuthUser;
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/moderation',
        payload: { videoId: VALID_VIDEO.id, action: 'approve' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/admin/stats', () => {
    it('returns dashboard stats', async () => {
      // Three sequential select calls for user count, video count, pending count
      mockSelect
        .mockReturnValueOnce({
          from: vi.fn().mockResolvedValue([{ count: 42 }]),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockResolvedValue([{ count: 100 }]),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 5 }]),
          }),
        });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/admin/stats' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalUsers).toBe(42);
      expect(body.totalVideos).toBe(100);
      expect(body.pendingModeration).toBe(5);
    });
  });

  describe('GET /api/admin/users', () => {
    it('returns paginated user list', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([ADMIN_USER, VALID_USER]),
            }),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/admin/users' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(2);
      expect(body.page).toBe(1);
    });
  });

  describe('GET /api/admin/moderation', () => {
    it('returns pending videos', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([VALID_VIDEO]),
              }),
            }),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/admin/moderation' });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
    });
  });

  describe('POST /api/admin/moderation', () => {
    it('approves a video: sets visibility=public, moderationStatus=approved', async () => {
      const approvedVideo = {
        ...VALID_VIDEO,
        visibility: 'public',
        moderationStatus: 'approved',
      };

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([approvedVideo]),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/moderation',
        payload: { videoId: VALID_VIDEO.id, action: 'approve' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().visibility).toBe('public');
      expect(res.json().moderationStatus).toBe('approved');
    });

    it('rejects a video: sets visibility=rejected, moderationStatus=rejected', async () => {
      const rejectedVideo = {
        ...VALID_VIDEO,
        visibility: 'rejected',
        moderationStatus: 'rejected',
      };

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([rejectedVideo]),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/moderation',
        payload: { videoId: VALID_VIDEO.id, action: 'reject' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().visibility).toBe('rejected');
      expect(res.json().moderationStatus).toBe('rejected');
    });

    it('returns 404 for non-existent video', async () => {
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/moderation',
        payload: { videoId: '550e8400-e29b-41d4-a716-446655440099', action: 'approve' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid action', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/moderation',
        payload: { videoId: VALID_VIDEO.id, action: 'ban' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/admin/pricing', () => {
    it('returns pricing configs', async () => {
      const configs = [{ id: '1', key: 'base_price', value: 5, updatedAt: new Date() }];

      mockSelect.mockReturnValue({
        from: vi.fn().mockResolvedValue(configs),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/admin/pricing' });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
    });
  });

  describe('PUT /api/admin/pricing', () => {
    it('upserts pricing config', async () => {
      const updated = { id: '1', key: 'base_price', value: 10, updatedAt: new Date() };

      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/pricing',
        payload: { key: 'base_price', value: 10 },
      });

      expect(res.statusCode).toBe(200);
    });

    it('returns 400 for invalid body', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/pricing',
        payload: { value: 10 }, // missing key
      });

      expect(res.statusCode).toBe(400);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { VALID_USER, VALID_VIDEO } from '../../test-helpers/fixtures.js';
import type { AuthUser } from '../../middleware/auth.js';

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
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
  users: {
    id: 'users_id',
    displayName: 'users_displayName',
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticate: async (request: any) => {
    request.user = { ...VALID_USER } as AuthUser;
  },
}));

import { videoRoutes } from '../videos.js';

const VIDEO_LIST_ITEM = {
  id: VALID_VIDEO.id,
  title: VALID_VIDEO.title,
  thumbnailKey: VALID_VIDEO.thumbnailKey,
  durationSeconds: VALID_VIDEO.durationSeconds,
  visibility: VALID_VIDEO.visibility,
  viewCount: VALID_VIDEO.viewCount,
  likeCount: VALID_VIDEO.likeCount,
  createdAt: VALID_VIDEO.createdAt,
  user: {
    id: VALID_USER.id,
    displayName: VALID_USER.displayName,
  },
};

describe('video routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function buildApp() {
    const app = Fastify();
    await app.register(videoRoutes, { prefix: '/api/videos' });
    return app;
  }

  describe('GET /api/videos', () => {
    function setupListMock(results: unknown[] = [VIDEO_LIST_ITEM]) {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(results),
                }),
              }),
            }),
          }),
        }),
      });
    }

    it('returns public approved videos', async () => {
      setupListMock();
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/videos' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });

    it('respects page and limit query params', async () => {
      setupListMock([]);
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/videos?page=2&limit=10',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(2);
      expect(res.json().limit).toBe(10);
    });

    it('clamps limit to max 50', async () => {
      setupListMock([]);
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/videos?limit=100',
      });

      expect(res.json().limit).toBe(50);
    });

    it('clamps page to min 1', async () => {
      setupListMock([]);
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/videos?page=0',
      });

      expect(res.json().page).toBe(1);
    });
  });

  describe('GET /api/videos/:id', () => {
    function setupGetMock(video: unknown | null) {
      const selectChain = {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(video ? [video] : []),
            }),
          }),
        }),
      };
      mockSelect.mockReturnValue(selectChain);
    }

    it('returns video details for public approved video', async () => {
      const video = {
        ...VALID_VIDEO,
        user: { id: VALID_USER.id, displayName: VALID_USER.displayName },
      };
      setupGetMock(video);
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/videos/${VALID_VIDEO.id}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(VALID_VIDEO.id);
    });

    it('increments viewCount', async () => {
      const video = {
        ...VALID_VIDEO,
        user: { id: VALID_USER.id, displayName: VALID_USER.displayName },
      };
      setupGetMock(video);

      const mockSetWhere = vi.fn().mockResolvedValue(undefined);
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: mockSetWhere,
        }),
      });

      const app = await buildApp();
      await app.inject({
        method: 'GET',
        url: `/api/videos/${VALID_VIDEO.id}`,
      });

      expect(mockUpdate).toHaveBeenCalled();
    });

    it('returns 404 for non-existent video', async () => {
      setupGetMock(null);

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/videos/nonexistent-id',
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for non-public video', async () => {
      const privateVideo = {
        ...VALID_VIDEO,
        visibility: 'private',
        user: { id: VALID_USER.id, displayName: VALID_USER.displayName },
      };
      setupGetMock(privateVideo);

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/videos/${VALID_VIDEO.id}`,
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for non-approved video', async () => {
      const pendingVideo = {
        ...VALID_VIDEO,
        moderationStatus: 'pending',
        user: { id: VALID_USER.id, displayName: VALID_USER.displayName },
      };
      setupGetMock(pendingVideo);

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/videos/${VALID_VIDEO.id}`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/videos/my', () => {
    it('returns authenticated user videos', async () => {
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
      const res = await app.inject({ method: 'GET', url: '/api/videos/my' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
    });
  });
});

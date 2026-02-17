import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiClient, ApiError } from '../index';

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('createApiClient', () => {
  const baseUrl = 'https://api.test.com';
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchSpy = mockFetch({});
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('authentication', () => {
    it('injects Bearer token in Authorization header', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('my-token'),
      });

      await client.users.getProfile();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer my-token');
    });

    it('sends no Authorization header when getToken returns null', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve(null),
      });

      await client.users.getProfile();

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('throws ApiError for non-ok responses', async () => {
      fetchSpy = mockFetch({ error: 'Not found' }, 404);
      vi.stubGlobal('fetch', fetchSpy);

      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await expect(client.users.getProfile()).rejects.toThrow(ApiError);
      await expect(client.users.getProfile()).rejects.toMatchObject({
        status: 404,
        body: { error: 'Not found' },
      });
    });

    it('ApiError has correct status and body', async () => {
      fetchSpy = mockFetch({ message: 'Forbidden' }, 403);
      vi.stubGlobal('fetch', fetchSpy);

      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      try {
        await client.users.getProfile();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(403);
        expect((err as ApiError).body).toEqual({ message: 'Forbidden' });
      }
    });
  });

  describe('users', () => {
    it('getProfile calls GET /api/users', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.users.getProfile();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${baseUrl}/api/users`,
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });

    it('updateProfile calls PATCH /api/users', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.users.updateProfile({ displayName: 'New Name' });

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${baseUrl}/api/users`);
      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body)).toEqual({ displayName: 'New Name' });
    });
  });

  describe('videos', () => {
    it('list calls GET /api/videos', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.videos.list();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${baseUrl}/api/videos`,
        expect.any(Object),
      );
    });

    it('list constructs query params correctly', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.videos.list({
        search: 'meditation',
        tags: ['nature', 'calm'],
        sortBy: 'popular',
        page: 2,
        limit: 10,
      });

      const [url] = fetchSpy.mock.calls[0];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('search')).toBe('meditation');
      expect(parsedUrl.searchParams.get('tags')).toBe('nature,calm');
      expect(parsedUrl.searchParams.get('sortBy')).toBe('popular');
      expect(parsedUrl.searchParams.get('page')).toBe('2');
      expect(parsedUrl.searchParams.get('limit')).toBe('10');
    });

    it('get calls GET /api/videos/:id', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.videos.get('abc-123');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${baseUrl}/api/videos/abc-123`,
        expect.any(Object),
      );
    });

    it('listMy calls GET /api/videos/my with params', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.videos.listMy(2, 10);

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/videos/my');
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('page')).toBe('2');
      expect(parsedUrl.searchParams.get('limit')).toBe('10');
    });
  });

  describe('generations', () => {
    it('create calls POST /api/generations', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      const data = {
        visualPrompt: 'A scene',
        scriptType: 'ai_generated' as const,
        durationSeconds: 60 as const,
        visibility: 'public' as const,
      };

      await client.generations.create(data);

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${baseUrl}/api/generations`);
      expect(options.method).toBe('POST');
    });

    it('list calls GET /api/generations', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.generations.list(1, 20);

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/generations');
    });

    it('getProgress calls GET /api/generations/:id/progress', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.generations.getProgress('gen-123');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${baseUrl}/api/generations/gen-123/progress`,
        expect.any(Object),
      );
    });
  });

  describe('credits', () => {
    it('getBalance calls GET /api/credits', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.credits.getBalance();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${baseUrl}/api/credits`,
        expect.any(Object),
      );
    });

    it('getPacks calls GET /api/credits/packs', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.credits.getPacks();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${baseUrl}/api/credits/packs`,
        expect.any(Object),
      );
    });

    it('purchase calls POST /api/credits/purchase', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.credits.purchase({ packIndex: 0, paymentMethodId: 'pm_123' });

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${baseUrl}/api/credits/purchase`);
      expect(options.method).toBe('POST');
    });
  });

  describe('media', () => {
    it('listAmbientSounds calls GET /api/media/ambient-sounds', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.media.listAmbientSounds();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${baseUrl}/api/media/ambient-sounds`,
        expect.any(Object),
      );
    });

    it('listMusicTracks calls GET /api/media/music-tracks', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.media.listMusicTracks();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${baseUrl}/api/media/music-tracks`,
        expect.any(Object),
      );
    });

    it('listScriptTemplates calls GET /api/media/script-templates', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.media.listScriptTemplates();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${baseUrl}/api/media/script-templates`,
        expect.any(Object),
      );
    });
  });

  describe('admin', () => {
    it('getStats calls GET /api/admin/stats', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.admin.getStats();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${baseUrl}/api/admin/stats`,
        expect.any(Object),
      );
    });

    it('listUsers calls GET /api/admin/users', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.admin.listUsers(1, 20);

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/admin/users');
    });

    it('moderate calls POST /api/admin/moderation', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.admin.moderate({
        videoId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'approve',
      });

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${baseUrl}/api/admin/moderation`);
      expect(options.method).toBe('POST');
    });

    it('updatePricing calls PUT /api/admin/pricing', async () => {
      const client = createApiClient({
        baseUrl,
        getToken: () => Promise.resolve('token'),
      });

      await client.admin.updatePricing({ key: 'base_price', value: 5 });

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${baseUrl}/api/admin/pricing`);
      expect(options.method).toBe('PUT');
    });
  });
});

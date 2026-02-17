import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockSelect = vi.fn();
vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
  ambientSounds: { id: 'id' },
  musicTracks: { id: 'id' },
  scriptTemplates: { id: 'id' },
}));

import { mediaRoutes } from '../media.js';

describe('media routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function buildApp() {
    const app = Fastify();
    await app.register(mediaRoutes, { prefix: '/api/media' });
    return app;
  }

  describe('GET /api/media/ambient-sounds', () => {
    it('returns data array of ambient sounds', async () => {
      const sounds = [
        { id: '1', name: 'Rain', storageKey: 'rain.mp3', category: 'nature', isLoopable: true },
      ];

      mockSelect.mockReturnValue({
        from: vi.fn().mockResolvedValue(sounds),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/media/ambient-sounds' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Rain');
    });

    it('requires no auth', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockResolvedValue([]),
      });

      const app = await buildApp();
      // No auth headers at all
      const res = await app.inject({ method: 'GET', url: '/api/media/ambient-sounds' });
      expect(res.statusCode).toBe(200);
    });

    it('returns 200 with empty array when no sounds exist', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockResolvedValue([]),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/media/ambient-sounds' });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(0);
    });

    it('returns 500 on DB error', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockRejectedValue(new Error('DB failure')),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/media/ambient-sounds' });

      expect(res.statusCode).toBe(500);
      expect(res.json().error).toMatch(/internal server error/i);
    });
  });

  describe('GET /api/media/music-tracks', () => {
    it('returns data array of music tracks', async () => {
      const tracks = [
        { id: '1', name: 'Piano', storageKey: 'piano.mp3', mood: 'calm', licenseType: 'free' },
      ];

      mockSelect.mockReturnValue({
        from: vi.fn().mockResolvedValue(tracks),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/media/music-tracks' });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
    });

    it('returns 200 with empty array when no tracks exist', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockResolvedValue([]),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/media/music-tracks' });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(0);
    });

    it('returns 500 on DB error', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockRejectedValue(new Error('DB failure')),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/media/music-tracks' });

      expect(res.statusCode).toBe(500);
      expect(res.json().error).toMatch(/internal server error/i);
    });
  });

  describe('GET /api/media/script-templates', () => {
    it('returns data array of script templates', async () => {
      const templates = [
        { id: '1', title: 'Morning', category: 'mindfulness', scriptText: 'Breathe...', durationHint: 60 },
      ];

      mockSelect.mockReturnValue({
        from: vi.fn().mockResolvedValue(templates),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/media/script-templates' });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
    });

    it('returns 200 with empty array when no templates exist', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockResolvedValue([]),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/media/script-templates' });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(0);
    });

    it('returns 500 on DB error', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockRejectedValue(new Error('DB failure')),
      });

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/media/script-templates' });

      expect(res.statusCode).toBe(500);
      expect(res.json().error).toMatch(/internal server error/i);
    });
  });
});

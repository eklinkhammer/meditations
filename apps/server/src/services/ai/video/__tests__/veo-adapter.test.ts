import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

vi.mock('../../../../config.js', () => ({
  config: {
    ai: { geminiApiKey: 'test-gemini-key' },
  },
}));

// Mock queue to prevent Redis connections
vi.mock('../../../../jobs/queue.js', () => ({
  videoGenerateQueue: { add: vi.fn() },
  redisConnection: {},
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { VeoVideoAdapter } from '../veo-adapter.js';

describe('VeoVideoAdapter', () => {
  let adapter: VeoVideoAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new VeoVideoAdapter();
  });

  describe('constructor', () => {
    it('throws when GEMINI_API_KEY is not configured', async () => {
      vi.resetModules();

      vi.doMock('../../../../config.js', () => ({
        config: { ai: { geminiApiKey: undefined } },
      }));

      const { VeoVideoAdapter: Fresh } = await import('../veo-adapter.js');
      expect(() => new Fresh()).toThrow('GEMINI_API_KEY is not configured');
    });
  });

  describe('generateVideo', () => {
    it('sends correct request and returns jobId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'operations/veo-123' }),
      });

      const result = await adapter.generateVideo('peaceful sunset', 120);

      expect(result).toEqual({ jobId: 'operations/veo-123' });
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('veo-3.1-generate-preview:predictLongRunning');
      expect(url).toContain('key=test-gemini-key');
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body);
      expect(body.instances[0].prompt).toBe('peaceful sunset');
      expect(body.parameters.aspectRatio).toBe('16:9');
      expect(body.parameters.durationSeconds).toBe(120);
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      });

      await expect(adapter.generateVideo('test', 60)).rejects.toThrow(
        'Veo generateVideo failed (429): Rate limited',
      );
    });

    it('propagates network errors from fetch', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(adapter.generateVideo('test', 60)).rejects.toThrow('fetch failed');
    });
  });

  describe('checkStatus', () => {
    it('returns processing for incomplete job', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ done: false }),
      });

      const status = await adapter.checkStatus('operations/veo-123');
      expect(status).toEqual({ state: 'processing' });
    });

    it('returns completed with downloadUri', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          done: true,
          response: {
            predictions: [{ videoUri: 'https://storage.example.com/video.mp4' }],
          },
        }),
      });

      const status = await adapter.checkStatus('operations/veo-123');
      expect(status).toEqual({
        state: 'completed',
        downloadUri: 'https://storage.example.com/video.mp4',
      });
    });

    it('returns failed when error is present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { message: 'Content policy violation' },
        }),
      });

      const status = await adapter.checkStatus('operations/veo-123');
      expect(status).toEqual({
        state: 'failed',
        error: 'Content policy violation',
      });
    });

    it('returns failed when done but no video URI', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          done: true,
          response: { predictions: [] },
        }),
      });

      const status = await adapter.checkStatus('operations/veo-123');
      expect(status).toEqual({
        state: 'failed',
        error: 'Veo completed but returned no video URI',
      });
    });

    it('returns failed when done but response key is missing entirely', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ done: true }),
      });

      const status = await adapter.checkStatus('operations/veo-123');
      expect(status).toEqual({
        state: 'failed',
        error: 'Veo completed but returned no video URI',
      });
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      await expect(adapter.checkStatus('operations/veo-123')).rejects.toThrow(
        'Veo checkStatus failed (500): Server error',
      );
    });

    it('propagates network errors from fetch', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(adapter.checkStatus('operations/veo-123')).rejects.toThrow('fetch failed');
    });
  });

  describe('downloadResult', () => {
    it('downloads video stream when job is completed', async () => {
      // checkStatus call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          done: true,
          response: {
            predictions: [{ videoUri: 'https://storage.example.com/video.mp4' }],
          },
        }),
      });

      // download call
      const mockBody = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockBody,
      });

      const stream = await adapter.downloadResult('operations/veo-123');
      expect(stream).toBeInstanceOf(Readable);
    });

    it('throws when job is processing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ done: false }),
      });

      await expect(adapter.downloadResult('operations/veo-123')).rejects.toThrow(
        'Cannot download: job is processing',
      );
    });

    it('throws when job is failed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { message: 'Content policy violation' },
        }),
      });

      await expect(adapter.downloadResult('operations/veo-123')).rejects.toThrow(
        'Cannot download: job is failed',
      );
    });

    it('throws when download fetch fails', async () => {
      // checkStatus - completed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          done: true,
          response: {
            predictions: [{ videoUri: 'https://storage.example.com/video.mp4' }],
          },
        }),
      });

      // download - fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(adapter.downloadResult('operations/veo-123')).rejects.toThrow(
        'Veo download failed (403)',
      );
    });

    it('propagates network errors from fetch', async () => {
      // checkStatus succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          done: true,
          response: {
            predictions: [{ videoUri: 'https://storage.example.com/video.mp4' }],
          },
        }),
      });

      // download fetch throws
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(adapter.downloadResult('operations/veo-123')).rejects.toThrow('fetch failed');
    });
  });
});

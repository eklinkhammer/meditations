import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

vi.mock('../../../../config.js', () => ({
  config: {
    ai: { elevenLabsApiKey: 'test-elevenlabs-key' },
  },
}));

// Mock queue to prevent Redis connections
vi.mock('../../../../jobs/queue.js', () => ({
  videoGenerateQueue: { add: vi.fn() },
  redisConnection: {},
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { ElevenLabsVoiceAdapter } from '../elevenlabs-adapter.js';

describe('ElevenLabsVoiceAdapter', () => {
  let adapter: ElevenLabsVoiceAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ElevenLabsVoiceAdapter();
  });

  describe('constructor', () => {
    it('throws when ELEVENLABS_API_KEY is not configured', async () => {
      vi.resetModules();

      vi.doMock('../../../../config.js', () => ({
        config: { ai: { elevenLabsApiKey: undefined } },
      }));

      const { ElevenLabsVoiceAdapter: Fresh } = await import('../elevenlabs-adapter.js');
      expect(() => new Fresh()).toThrow('ELEVENLABS_API_KEY is not configured');
    });
  });

  describe('synthesize', () => {
    it('sends correct request and returns audio stream', async () => {
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

      const stream = await adapter.synthesize('Welcome to meditation...', 'voice-123');
      expect(stream).toBeInstanceOf(Readable);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/text-to-speech/voice-123');
      expect(opts.method).toBe('POST');
      expect(opts.headers['xi-api-key']).toBe('test-elevenlabs-key');

      const body = JSON.parse(opts.body);
      expect(body.text).toBe('Welcome to meditation...');
      expect(body.model_id).toBe('eleven_multilingual_v2');
      expect(body.output_format).toBe('mp3_44100_128');
      expect(body.voice_settings.stability).toBe(0.7);
      expect(body.voice_settings.similarity_boost).toBe(0.75);
      expect(body.voice_settings.speed).toBe(0.9);

      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(url).toContain('https://api.elevenlabs.io/v1/text-to-speech/');
    });

    it('propagates network errors from fetch', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(adapter.synthesize('test', 'voice-123')).rejects.toThrow('fetch failed');
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      });

      await expect(adapter.synthesize('test', 'voice-123')).rejects.toThrow(
        'ElevenLabs synthesis failed (401): Invalid API key',
      );
    });
  });

  describe('listVoices', () => {
    it('fetches and maps voices correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          voices: [
            { voice_id: 'v1', name: 'Rachel', preview_url: 'https://example.com/rachel.mp3' },
            { voice_id: 'v2', name: 'Adam' },
          ],
        }),
      });

      const voices = await adapter.listVoices();
      expect(voices).toEqual([
        { id: 'v1', name: 'Rachel', previewUrl: 'https://example.com/rachel.mp3' },
        { id: 'v2', name: 'Adam', previewUrl: undefined },
      ]);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/voices');
      expect(opts.headers['xi-api-key']).toBe('test-elevenlabs-key');
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      await expect(adapter.listVoices()).rejects.toThrow(
        'ElevenLabs listVoices failed (500): Server error',
      );
    });

    it('propagates network errors from fetch', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(adapter.listVoices()).rejects.toThrow('fetch failed');
    });
  });
});

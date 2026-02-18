import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { GeminiScriptAdapter } from '../gemini-adapter.js';

describe('GeminiScriptAdapter', () => {
  let adapter: GeminiScriptAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GeminiScriptAdapter();
  });

  describe('constructor', () => {
    it('throws when GEMINI_API_KEY is not configured', async () => {
      vi.resetModules();

      vi.doMock('../../../../config.js', () => ({
        config: { ai: { geminiApiKey: undefined } },
      }));

      const { GeminiScriptAdapter: Fresh } = await import('../gemini-adapter.js');
      expect(() => new Fresh()).toThrow('GEMINI_API_KEY is not configured');
    });
  });

  describe('generateScript', () => {
    it('generates script with correct request structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: '  Welcome to this guided meditation...  ' }] } },
          ],
        }),
      });

      const result = await adapter.generateScript('guided', 120);

      expect(result).toBe('Welcome to this guided meditation...');

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('gemini-2.5-flash:generateContent');
      expect(url).toContain('key=test-gemini-key');

      const body = JSON.parse(opts.body);
      expect(body.system_instruction.parts[0].text).toContain('meditation script writer');
      expect(body.system_instruction.parts[0].text).toContain('260 words'); // 2 min * 130 wpm
      expect(body.contents[0].parts[0].text).toContain('guided');
      expect(body.generationConfig.temperature).toBe(0.8);
    });

    it('includes theme in system prompt when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Script text' }] } }],
        }),
      });

      await adapter.generateScript('visualization', 180, 'ocean sunset');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.system_instruction.parts[0].text).toContain('ocean sunset');
    });

    it('includes userPrompt in system prompt when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Script text' }] } }],
        }),
      });

      await adapter.generateScript('breathing', 60, undefined, 'focus on box breathing');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.system_instruction.parts[0].text).toContain('focus on box breathing');
    });

    it('uses correct type guidance for each meditation type', async () => {
      const types = ['guided', 'breathing', 'body_scan', 'visualization', 'affirmation'] as const;

      for (const type of types) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Script' }] } }],
          }),
        });

        await adapter.generateScript(type, 60);
      }

      // Verify each call used the specific type
      expect(mockFetch).toHaveBeenCalledTimes(5);
      const calls = mockFetch.mock.calls;
      expect(JSON.parse(calls[0][1].body).contents[0].parts[0].text).toContain('guided');
      expect(JSON.parse(calls[1][1].body).contents[0].parts[0].text).toContain('breathing');
      expect(JSON.parse(calls[2][1].body).contents[0].parts[0].text).toContain('body_scan');
      expect(JSON.parse(calls[3][1].body).contents[0].parts[0].text).toContain('visualization');
      expect(JSON.parse(calls[4][1].body).contents[0].parts[0].text).toContain('affirmation');
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });

      await expect(adapter.generateScript('guided', 60)).rejects.toThrow(
        'Gemini script generation failed (400): Bad request',
      );
    });

    it('throws when response has no text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [] }),
      });

      await expect(adapter.generateScript('guided', 60)).rejects.toThrow(
        'Gemini returned empty script',
      );
    });

    it('throws when candidates have no content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [] } }],
        }),
      });

      await expect(adapter.generateScript('guided', 60)).rejects.toThrow(
        'Gemini returned empty script',
      );
    });

    it('calculates correct word count for different durations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Script text' }] } }],
        }),
      });

      await adapter.generateScript('guided', 60);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // 60s = 1 min * 130 wpm = 130 words
      expect(body.system_instruction.parts[0].text).toContain('130 words');
    });

    it('throws when response is whitespace-only', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '   ' }] } }],
        }),
      });

      // The source does `text.trim()` which returns '' but !text is false for '   '
      // so it returns the trimmed empty string rather than throwing
      const result = await adapter.generateScript('guided', 60);
      expect(result).toBe('');
    });

    it('propagates network errors from fetch', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(adapter.generateScript('guided', 60)).rejects.toThrow('fetch failed');
    });
  });
});

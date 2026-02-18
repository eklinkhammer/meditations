import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VideoProvider, VoiceProvider, ScriptProvider } from '../types.js';

// Mock config to provide API keys
vi.mock('../../../config.js', () => ({
  config: {
    ai: {
      geminiApiKey: 'test-gemini-key',
      elevenLabsApiKey: 'test-elevenlabs-key',
    },
  },
}));

// Mock queue to prevent Redis connections
vi.mock('../../../jobs/queue.js', () => ({
  videoGenerateQueue: { add: vi.fn() },
  redisConnection: {},
}));

describe('AI provider factory', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('getAIProviders returns video, voice, and script providers', async () => {
    const { getAIProviders } = await import('../index.js');
    const providers = getAIProviders();

    expect(providers.video).toBeDefined();
    expect(providers.voice).toBeDefined();
    expect(providers.script).toBeDefined();
  });

  it('getAIProviders returns same singleton on repeated calls', async () => {
    const { getAIProviders } = await import('../index.js');
    const first = getAIProviders();
    const second = getAIProviders();

    expect(first).toBe(second);
  });

  it('setAIProviders overrides specific providers', async () => {
    const { getAIProviders, setAIProviders } = await import('../index.js');
    const original = getAIProviders();

    const mockVideo: VideoProvider = {
      generateVideo: vi.fn(),
      checkStatus: vi.fn(),
      downloadResult: vi.fn(),
    };

    setAIProviders({ video: mockVideo });

    const updated = getAIProviders();
    expect(updated.video).toBe(mockVideo);
    // Other providers remain unchanged
    expect(updated.voice).toBe(original.voice);
    expect(updated.script).toBe(original.script);
  });

  it('setAIProviders can override all providers', async () => {
    const { getAIProviders, setAIProviders } = await import('../index.js');

    const mockVideo: VideoProvider = {
      generateVideo: vi.fn(),
      checkStatus: vi.fn(),
      downloadResult: vi.fn(),
    };
    const mockVoice: VoiceProvider = {
      synthesize: vi.fn(),
      listVoices: vi.fn(),
    };
    const mockScript: ScriptProvider = {
      generateScript: vi.fn(),
    };

    setAIProviders({ video: mockVideo, voice: mockVoice, script: mockScript });

    const providers = getAIProviders();
    expect(providers.video).toBe(mockVideo);
    expect(providers.voice).toBe(mockVoice);
    expect(providers.script).toBe(mockScript);
  });

  it('setAIProviders with empty override leaves all providers unchanged', async () => {
    const { getAIProviders, setAIProviders } = await import('../index.js');
    const original = getAIProviders();

    setAIProviders({});

    const updated = getAIProviders();
    expect(updated.video).toBe(original.video);
    expect(updated.voice).toBe(original.voice);
    expect(updated.script).toBe(original.script);
  });

  it('getAIProviders returns instances of correct adapter classes', async () => {
    const { getAIProviders } = await import('../index.js');
    const { VeoVideoAdapter } = await import('../video/veo-adapter.js');
    const { ElevenLabsVoiceAdapter } = await import('../voice/elevenlabs-adapter.js');
    const { GeminiScriptAdapter } = await import('../text/gemini-adapter.js');

    const providers = getAIProviders();
    expect(providers.video).toBeInstanceOf(VeoVideoAdapter);
    expect(providers.voice).toBeInstanceOf(ElevenLabsVoiceAdapter);
    expect(providers.script).toBeInstanceOf(GeminiScriptAdapter);
  });
});

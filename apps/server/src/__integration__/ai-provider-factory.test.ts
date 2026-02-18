import { Readable } from 'node:stream';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VideoProvider, VoiceProvider, ScriptProvider } from '../services/ai/types.js';

// ---------------------------------------------------------------------------
// Mock config so adapters don't throw on missing API keys
// ---------------------------------------------------------------------------
vi.mock('../config.js', () => ({
  config: {
    ai: {
      geminiApiKey: 'test-gemini-key',
      elevenLabsApiKey: 'test-elevenlabs-key',
    },
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AI Provider Factory', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getAIProviders returns providers with the correct interface', async () => {
    const { getAIProviders } = await import('../services/ai/index.js');

    const providers = getAIProviders();

    expect(providers).toHaveProperty('video');
    expect(providers).toHaveProperty('voice');
    expect(providers).toHaveProperty('script');

    expect(providers.video.generateVideo).toBeTypeOf('function');
    expect(providers.video.checkStatus).toBeTypeOf('function');
    expect(providers.video.downloadResult).toBeTypeOf('function');
    expect(providers.voice.synthesize).toBeTypeOf('function');
    expect(providers.voice.listVoices).toBeTypeOf('function');
    expect(providers.script.generateScript).toBeTypeOf('function');
  });

  it('getAIProviders returns the same instance on repeated calls (singleton)', async () => {
    const { getAIProviders } = await import('../services/ai/index.js');

    const first = getAIProviders();
    const second = getAIProviders();

    expect(first).toBe(second);
  });

  it('setAIProviders overrides individual providers', async () => {
    const { getAIProviders, setAIProviders } = await import('../services/ai/index.js');

    const mockVideo: VideoProvider = {
      generateVideo: vi.fn().mockResolvedValue({ jobId: 'mock-job' }),
      checkStatus: vi.fn().mockResolvedValue({ state: 'completed', downloadUri: 'https://mock/video.mp4' }),
      downloadResult: vi.fn().mockResolvedValue(Readable.from(Buffer.from('mock'))),
    };

    setAIProviders({ video: mockVideo });

    const providers = getAIProviders();
    expect(providers.video).toBe(mockVideo);

    // Other providers should still be the original adapters
    expect(providers.voice.synthesize).toBeTypeOf('function');
    expect(providers.script.generateScript).toBeTypeOf('function');
  });

  it('setAIProviders can override all providers at once', async () => {
    const { getAIProviders, setAIProviders } = await import('../services/ai/index.js');

    const mockVideo: VideoProvider = {
      generateVideo: vi.fn().mockResolvedValue({ jobId: 'mock-job' }),
      checkStatus: vi.fn().mockResolvedValue({ state: 'completed', downloadUri: 'mock' }),
      downloadResult: vi.fn().mockResolvedValue(Readable.from(Buffer.from('mock'))),
    };
    const mockVoice: VoiceProvider = {
      synthesize: vi.fn().mockResolvedValue(Readable.from(Buffer.from('mock'))),
      listVoices: vi.fn().mockResolvedValue([]),
    };
    const mockScript: ScriptProvider = {
      generateScript: vi.fn().mockResolvedValue('mock script'),
    };

    setAIProviders({ video: mockVideo, voice: mockVoice, script: mockScript });

    const providers = getAIProviders();
    expect(providers.video).toBe(mockVideo);
    expect(providers.voice).toBe(mockVoice);
    expect(providers.script).toBe(mockScript);
  });

  it('setAIProviders preserves previous overrides when applying new ones', async () => {
    const { getAIProviders, setAIProviders } = await import('../services/ai/index.js');

    const mockVideo: VideoProvider = {
      generateVideo: vi.fn().mockResolvedValue({ jobId: 'mock-job' }),
      checkStatus: vi.fn().mockResolvedValue({ state: 'completed', downloadUri: 'mock' }),
      downloadResult: vi.fn().mockResolvedValue(Readable.from(Buffer.from('mock'))),
    };
    const mockScript: ScriptProvider = {
      generateScript: vi.fn().mockResolvedValue('mock script'),
    };

    setAIProviders({ video: mockVideo });
    setAIProviders({ script: mockScript });

    const providers = getAIProviders();
    // video override from first call should still be present
    expect(providers.video).toBe(mockVideo);
    expect(providers.script).toBe(mockScript);
  });
});

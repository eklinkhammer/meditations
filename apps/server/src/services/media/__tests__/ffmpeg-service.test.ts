import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

const { mockMkdir, mockRm, mockFfprobe, mockFfmpegInstances } = vi.hoisted(() => ({
  mockMkdir: vi.fn().mockResolvedValue(undefined),
  mockRm: vi.fn().mockResolvedValue(undefined),
  mockFfprobe: vi.fn(),
  mockFfmpegInstances: [] as any[],
}));

vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}));

vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs', () => ({
  createWriteStream: vi.fn().mockReturnValue({
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  }),
}));

vi.mock('fluent-ffmpeg', () => {
  function createInstance() {
    const instance: any = {
      input: vi.fn().mockReturnThis(),
      inputOptions: vi.fn().mockReturnThis(),
      complexFilter: vi.fn().mockReturnThis(),
      outputOptions: vi.fn().mockReturnThis(),
      output: vi.fn().mockReturnThis(),
      on: vi.fn(),
      run: vi.fn(),
      screenshots: vi.fn(),
      _endCb: null as Function | null,
      _errorCb: null as Function | null,
    };

    instance.on.mockImplementation(function (event: string, cb: Function) {
      if (event === 'end') instance._endCb = cb;
      if (event === 'error') instance._errorCb = cb;
      return instance;
    });

    // .run() triggers the end callback synchronously
    instance.run.mockImplementation(function () {
      if (instance._endCb) instance._endCb();
    });

    // .screenshots() auto-fires the end event (like real fluent-ffmpeg)
    instance.screenshots.mockImplementation(function () {
      queueMicrotask(() => {
        if (instance._endCb) instance._endCb();
      });
      return instance;
    });

    mockFfmpegInstances.push(instance);
    return instance;
  }

  function ffmpegFn() {
    return createInstance();
  }

  ffmpegFn.ffprobe = (...args: unknown[]) => mockFfprobe(...args);

  return { default: ffmpegFn };
});

vi.mock('@meditations/shared', () => ({
  AUDIO_MIX_LEVELS: {
    VOICEOVER: 1.0,
    AMBIENT: 0.3,
    MUSIC: 0.2,
  },
}));

vi.mock('../../../config.js', () => ({
  config: {},
}));

vi.mock('../../../jobs/queue.js', () => ({
  videoGenerateQueue: { add: vi.fn() },
  redisConnection: {},
}));

import { compose } from '../ffmpeg-service.js';

describe('FFmpeg composition service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFfmpegInstances.length = 0;

    mockFfprobe.mockImplementation((_file: string, cb: Function) => {
      cb(null, { format: { duration: 125.5 } });
    });
  });

  it('creates temp directory and writes input streams', async () => {
    const result = await compose({
      videoStream: Readable.from(['video']),
      voiceoverStream: Readable.from(['audio']),
    });

    expect(mockMkdir).toHaveBeenCalledOnce();
    expect(mockMkdir.mock.calls[0][1]).toEqual({ recursive: true });
    expect(result.durationSeconds).toBe(126); // Math.ceil(125.5)
    expect(result.videoPath).toContain('output.mp4');
    expect(result.thumbnailPath).toContain('thumbnail.jpg');
  });

  it('cleanupTempDir removes the work directory', async () => {
    const result = await compose({
      videoStream: Readable.from(['video']),
      voiceoverStream: Readable.from(['audio']),
    });

    await result.cleanupTempDir();
    expect(mockRm).toHaveBeenCalledOnce();
    expect(mockRm.mock.calls[0][1]).toEqual({ recursive: true, force: true });
  });

  it('creates ffmpeg command with video and voiceover inputs', async () => {
    await compose({
      videoStream: Readable.from(['video']),
      voiceoverStream: Readable.from(['audio']),
    });

    // First ffmpeg instance is for composition
    expect(mockFfmpegInstances.length).toBeGreaterThanOrEqual(1);
    const compositionInstance = mockFfmpegInstances[0];
    expect(compositionInstance.input).toHaveBeenCalled();
    expect(compositionInstance.complexFilter).toHaveBeenCalled();
    expect(compositionInstance.output).toHaveBeenCalled();
  });

  it('handles ambient and music streams when provided', async () => {
    await compose({
      videoStream: Readable.from(['video']),
      voiceoverStream: Readable.from(['audio']),
      ambientStream: Readable.from(['ambient']),
      musicStream: Readable.from(['music']),
    });

    const compositionInstance = mockFfmpegInstances[0];
    // Should have more inputs: video + voiceover + ambient + music
    expect(compositionInstance.input.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('returns correct duration from probe', async () => {
    mockFfprobe.mockImplementation((_file: string, cb: Function) => {
      cb(null, { format: { duration: 60.0 } });
    });

    const result = await compose({
      videoStream: Readable.from(['video']),
      voiceoverStream: Readable.from(['audio']),
    });

    expect(result.durationSeconds).toBe(60);
  });

  it('handles zero duration from probe', async () => {
    mockFfprobe.mockImplementation((_file: string, cb: Function) => {
      cb(null, { format: { duration: 0 } });
    });

    const result = await compose({
      videoStream: Readable.from(['video']),
      voiceoverStream: Readable.from(['audio']),
    });

    expect(result.durationSeconds).toBe(0);
  });

  it('propagates ffprobe errors', async () => {
    mockFfprobe.mockImplementation((_file: string, cb: Function) => {
      cb(new Error('ffprobe failed'));
    });

    await expect(
      compose({
        videoStream: Readable.from(['video']),
        voiceoverStream: Readable.from(['audio']),
      }),
    ).rejects.toThrow('ffprobe failed');
  });

  it('propagates ffmpeg composition error via run()', async () => {
    let instanceCount = 0;
    const origPush = mockFfmpegInstances.push.bind(mockFfmpegInstances);

    // We'll patch the next created instance's run to fire error
    mockFfmpegInstances.push = function (...items: any[]) {
      const result = origPush(...items);
      instanceCount++;
      if (instanceCount === 1) {
        // First instance (composition) - make run() fire error
        const inst = items[0];
        inst.run.mockImplementation(function () {
          if (inst._errorCb) inst._errorCb(new Error('ffmpeg encoding failed'));
        });
      }
      return result;
    } as any;

    await expect(
      compose({
        videoStream: Readable.from(['video']),
        voiceoverStream: Readable.from(['audio']),
      }),
    ).rejects.toThrow('ffmpeg encoding failed');

    // Restore
    mockFfmpegInstances.push = origPush;
  });

  it('propagates thumbnail generation error', async () => {
    let instanceCount = 0;
    const origPush = mockFfmpegInstances.push.bind(mockFfmpegInstances);

    mockFfmpegInstances.push = function (...items: any[]) {
      const result = origPush(...items);
      instanceCount++;
      if (instanceCount === 2) {
        // Second instance (thumbnail) - make screenshots fire error
        const inst = items[0];
        inst.screenshots.mockImplementation(function () {
          queueMicrotask(() => {
            if (inst._errorCb) inst._errorCb(new Error('thumbnail extraction failed'));
          });
          return inst;
        });
      }
      return result;
    } as any;

    await expect(
      compose({
        videoStream: Readable.from(['video']),
        voiceoverStream: Readable.from(['audio']),
      }),
    ).rejects.toThrow('thumbnail extraction failed');

    mockFfmpegInstances.push = origPush;
  });

  it('voiceover-only composition uses acopy in complexFilter', async () => {
    await compose({
      videoStream: Readable.from(['video']),
      voiceoverStream: Readable.from(['audio']),
    });

    const compositionInstance = mockFfmpegInstances[0];
    const filterArg = compositionInstance.complexFilter.mock.calls[0][0];
    expect(filterArg).toContain('acopy');
  });

  it('ambient+music composition uses amix with correct inputs count', async () => {
    await compose({
      videoStream: Readable.from(['video']),
      voiceoverStream: Readable.from(['audio']),
      ambientStream: Readable.from(['ambient']),
      musicStream: Readable.from(['music']),
    });

    const compositionInstance = mockFfmpegInstances[0];
    const filterArg = compositionInstance.complexFilter.mock.calls[0][0];
    expect(filterArg).toContain('amix');
    expect(filterArg).toContain('inputs=3');
  });

  it('applies -stream_loop -1 to video, ambient, and music inputs', async () => {
    await compose({
      videoStream: Readable.from(['video']),
      voiceoverStream: Readable.from(['audio']),
      ambientStream: Readable.from(['ambient']),
      musicStream: Readable.from(['music']),
    });

    const compositionInstance = mockFfmpegInstances[0];
    const inputOptionsCalls = compositionInstance.inputOptions.mock.calls;

    // Should have 3 inputOptions calls with stream_loop: video, ambient, music
    const streamLoopCalls = inputOptionsCalls.filter(
      (call: any) => call[0]?.includes('-stream_loop'),
    );
    expect(streamLoopCalls.length).toBe(3);
  });

  it('voiceover+ambient (no music) uses amix with inputs=2', async () => {
    await compose({
      videoStream: Readable.from(['video']),
      voiceoverStream: Readable.from(['audio']),
      ambientStream: Readable.from(['ambient']),
    });

    const compositionInstance = mockFfmpegInstances[0];
    const filterArg = compositionInstance.complexFilter.mock.calls[0][0];
    expect(filterArg).toContain('amix');
    expect(filterArg).toContain('inputs=2');
  });

  it('voiceover+music (no ambient) uses amix with inputs=2', async () => {
    await compose({
      videoStream: Readable.from(['video']),
      voiceoverStream: Readable.from(['audio']),
      musicStream: Readable.from(['music']),
    });

    const compositionInstance = mockFfmpegInstances[0];
    const filterArg = compositionInstance.complexFilter.mock.calls[0][0];
    expect(filterArg).toContain('amix');
    expect(filterArg).toContain('inputs=2');
  });
});

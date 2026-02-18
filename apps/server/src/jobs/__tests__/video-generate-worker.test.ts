import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';

// -------------------------------------------------------------------------
// Hoisted mocks — these must be declared before vi.mock() factories
// -------------------------------------------------------------------------

const {
  mockDbUpdate,
  mockDbSelect,
  mockDbInsert,
  mockScriptGenerate,
  mockVoiceSynthesize,
  mockVideoGenerate,
  mockVideoCheckStatus,
  mockVideoDownload,
  mockStorageUpload,
  mockStorageDownload,
  mockCompose,
  capturedRef,
} = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockScriptGenerate: vi.fn(),
  mockVoiceSynthesize: vi.fn(),
  mockVideoGenerate: vi.fn(),
  mockVideoCheckStatus: vi.fn(),
  mockVideoDownload: vi.fn(),
  mockStorageUpload: vi.fn(),
  mockStorageDownload: vi.fn(),
  mockCompose: vi.fn(),
  capturedRef: { processJob: null as Function | null, onFailed: null as Function | null },
}));

// -------------------------------------------------------------------------
// Module mocks
// -------------------------------------------------------------------------

vi.mock('../../db/index.js', () => ({
  db: {
    update: (...args: unknown[]) => mockDbUpdate(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
  generationRequests: { id: 'id' },
  videos: {},
  ambientSounds: { id: 'id', storageKey: 'storageKey' },
  musicTracks: { id: 'id', storageKey: 'storageKey' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
}));

vi.mock('../../services/ai/index.js', () => ({
  getAIProviders: () => ({
    script: { generateScript: mockScriptGenerate },
    voice: { synthesize: mockVoiceSynthesize },
    video: {
      generateVideo: mockVideoGenerate,
      checkStatus: mockVideoCheckStatus,
      downloadResult: mockVideoDownload,
    },
  }),
}));

vi.mock('../../services/storage/s3-service.js', () => ({
  upload: (...args: unknown[]) => mockStorageUpload(...args),
  download: (...args: unknown[]) => mockStorageDownload(...args),
}));

vi.mock('../../services/media/ffmpeg-service.js', () => ({
  compose: (...args: unknown[]) => mockCompose(...args),
}));

vi.mock('node:fs', () => ({
  createReadStream: vi.fn().mockReturnValue({ pipe: vi.fn() }),
}));

vi.mock('@meditations/shared', () => ({
  GENERATION_STATUS: {
    PENDING: 'pending',
    GENERATING_SCRIPT: 'generating_script',
    GENERATING_VOICE: 'generating_voice',
    GENERATING_VIDEO: 'generating_video',
    COMPOSITING: 'compositing',
    COMPLETED: 'completed',
    FAILED: 'failed',
  },
  SCRIPT_TYPE: {
    AI_GENERATED: 'ai_generated',
    USER_PROVIDED: 'user_provided',
  },
  VIDEO_VISIBILITY: {
    PENDING_REVIEW: 'pending_review',
  },
  MODERATION_STATUS: {
    PENDING: 'pending',
  },
}));

vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: Function) {
      capturedRef.processJob = processor;
    }
    on(event: string, handler: Function) {
      if (event === 'failed') {
        capturedRef.onFailed = handler;
      }
      return this;
    }
    close = vi.fn();
  },
}));

vi.mock('../queue.js', () => ({
  redisConnection: {},
}));

vi.mock('../../config.js', () => ({
  config: {
    redis: { url: 'redis://localhost:6379' },
  },
}));

// Import after mocks to trigger Worker constructor
import '../video-generate-worker.js';

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function capturedProcessJob(job: any) {
  if (!capturedRef.processJob) throw new Error('processJob not captured');
  return capturedRef.processJob(job);
}

function createMockJob(data: { generationRequestId: string }) {
  return {
    data,
    updateProgress: vi.fn(),
    attemptsMade: 1,
    opts: { attempts: 3 },
  };
}

function setupDbUpdateChain() {
  mockDbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

function setupDbInsertChain(result: unknown[]) {
  mockDbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  });
}

const BASE_GEN_REQUEST = {
  id: 'gen-123',
  userId: 'user-456',
  scriptType: 'ai_generated',
  scriptContent: null,
  durationSeconds: 120,
  visualPrompt: 'A peaceful mountain scene',
  ambientSoundId: null,
  musicTrackId: null,
};

function setupSuccessfulPipeline() {
  mockDbSelect
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([BASE_GEN_REQUEST]),
        }),
      }),
    });

  setupDbUpdateChain();
  mockScriptGenerate.mockResolvedValue('Welcome to your guided meditation...');
  mockVoiceSynthesize.mockResolvedValue(Readable.from(['audio-data']));
  mockStorageUpload.mockResolvedValue('generations/gen-123/voiceover.mp3');
  mockVideoGenerate.mockResolvedValue({ jobId: 'veo-job-1' });
  mockVideoCheckStatus.mockResolvedValue({
    state: 'completed',
    downloadUri: 'https://storage.example.com/video.mp4',
  });
  mockVideoDownload.mockResolvedValue(Readable.from(['video-data']));
  mockStorageDownload.mockResolvedValue(Readable.from(['voiceover-data']));
  mockCompose.mockResolvedValue({
    videoPath: '/tmp/meditation-xxx/output.mp4',
    thumbnailPath: '/tmp/meditation-xxx/thumbnail.jpg',
    durationSeconds: 120,
    cleanupTempDir: vi.fn().mockResolvedValue(undefined),
  });
  setupDbInsertChain([{ id: 'video-789', userId: 'user-456' }]);
}

describe('video-generate-worker processJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDbUpdateChain();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs full pipeline for AI-generated script', async () => {
    setupSuccessfulPipeline();

    const job = createMockJob({ generationRequestId: 'gen-123' });
    await capturedProcessJob(job);

    expect(mockScriptGenerate).toHaveBeenCalledWith(
      'guided',
      120,
      'A peaceful mountain scene',
    );
    expect(mockVoiceSynthesize).toHaveBeenCalled();
    expect(mockVideoGenerate).toHaveBeenCalledWith(
      'A peaceful mountain scene',
      120,
    );
    expect(mockCompose).toHaveBeenCalled();
    expect(mockStorageUpload).toHaveBeenCalled();
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('skips script generation when scriptContent already exists', async () => {
    const genReqWithScript = {
      ...BASE_GEN_REQUEST,
      scriptType: 'user_provided',
      scriptContent: 'My custom meditation script...',
    };

    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([genReqWithScript]),
        }),
      }),
    });

    mockVoiceSynthesize.mockResolvedValue(Readable.from(['audio']));
    mockStorageUpload.mockResolvedValue('key');
    mockVideoGenerate.mockResolvedValue({ jobId: 'veo-1' });
    mockVideoCheckStatus.mockResolvedValue({
      state: 'completed',
      downloadUri: 'https://example.com/video.mp4',
    });
    mockVideoDownload.mockResolvedValue(Readable.from(['video']));
    mockStorageDownload.mockResolvedValue(Readable.from(['audio']));
    mockCompose.mockResolvedValue({
      videoPath: '/tmp/output.mp4',
      thumbnailPath: '/tmp/thumb.jpg',
      durationSeconds: 120,
      cleanupTempDir: vi.fn().mockResolvedValue(undefined),
    });
    setupDbInsertChain([{ id: 'video-1' }]);

    const job = createMockJob({ generationRequestId: 'gen-123' });
    await capturedProcessJob(job);

    expect(mockScriptGenerate).not.toHaveBeenCalled();
    expect(mockVoiceSynthesize).toHaveBeenCalledWith(
      'My custom meditation script...',
      expect.any(String),
    );
  });

  it('throws when generation request not found', async () => {
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const job = createMockJob({ generationRequestId: 'nonexistent' });

    await expect(capturedProcessJob(job)).rejects.toThrow(
      'Generation request nonexistent not found',
    );
  });

  it('polls video status until completed', async () => {
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([BASE_GEN_REQUEST]),
        }),
      }),
    });

    mockScriptGenerate.mockResolvedValue('Script text');
    mockVoiceSynthesize.mockResolvedValue(Readable.from(['audio']));
    mockStorageUpload.mockResolvedValue('key');
    mockVideoGenerate.mockResolvedValue({ jobId: 'veo-1' });

    // Simulate polling: processing -> processing -> completed
    mockVideoCheckStatus
      .mockResolvedValueOnce({ state: 'processing' })
      .mockResolvedValueOnce({ state: 'processing' })
      .mockResolvedValueOnce({
        state: 'completed',
        downloadUri: 'https://example.com/video.mp4',
      });

    mockVideoDownload.mockResolvedValue(Readable.from(['video']));
    mockStorageDownload.mockResolvedValue(Readable.from(['audio']));
    mockCompose.mockResolvedValue({
      videoPath: '/tmp/output.mp4',
      thumbnailPath: '/tmp/thumb.jpg',
      durationSeconds: 120,
      cleanupTempDir: vi.fn().mockResolvedValue(undefined),
    });
    setupDbInsertChain([{ id: 'video-1' }]);

    vi.useFakeTimers();
    const job = createMockJob({ generationRequestId: 'gen-123' });
    const promise = capturedProcessJob(job);

    // Advance through the polling delays
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    await promise;

    // checkStatus called: initial + 2 polls in while loop + final completed
    expect(mockVideoCheckStatus.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('throws when Veo generation fails', async () => {
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([BASE_GEN_REQUEST]),
        }),
      }),
    });

    mockScriptGenerate.mockResolvedValue('Script');
    mockVoiceSynthesize.mockResolvedValue(Readable.from(['audio']));
    mockStorageUpload.mockResolvedValue('key');
    mockVideoGenerate.mockResolvedValue({ jobId: 'veo-1' });

    mockVideoCheckStatus.mockResolvedValue({
      state: 'failed',
      error: 'Content policy violation',
    });

    const job = createMockJob({ generationRequestId: 'gen-123' });

    await expect(capturedProcessJob(job)).rejects.toThrow(
      'Veo generation failed: Content policy violation',
    );
  });

  it('cleans up temp directory even on upload failure', async () => {
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([BASE_GEN_REQUEST]),
        }),
      }),
    });

    mockScriptGenerate.mockResolvedValue('Script');
    mockVoiceSynthesize.mockResolvedValue(Readable.from(['audio']));
    mockStorageUpload
      .mockResolvedValueOnce('voiceover-key')
      .mockRejectedValueOnce(new Error('Upload failed'));
    mockVideoGenerate.mockResolvedValue({ jobId: 'veo-1' });
    mockVideoCheckStatus.mockResolvedValue({
      state: 'completed',
      downloadUri: 'https://example.com/video.mp4',
    });
    mockVideoDownload.mockResolvedValue(Readable.from(['video']));
    mockStorageDownload.mockResolvedValue(Readable.from(['audio']));

    const mockCleanup = vi.fn().mockResolvedValue(undefined);
    mockCompose.mockResolvedValue({
      videoPath: '/tmp/output.mp4',
      thumbnailPath: '/tmp/thumb.jpg',
      durationSeconds: 120,
      cleanupTempDir: mockCleanup,
    });

    const job = createMockJob({ generationRequestId: 'gen-123' });

    await expect(capturedProcessJob(job)).rejects.toThrow('Upload failed');
    expect(mockCleanup).toHaveBeenCalled();
  });

  it('loads ambient sound from DB when ambientSoundId is set', async () => {
    const genReqWithAmbient = {
      ...BASE_GEN_REQUEST,
      ambientSoundId: 'ambient-1',
    };

    mockDbSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([genReqWithAmbient]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'ambient-1', storageKey: 'ambient/rain.mp3' }]),
          }),
        }),
      });

    mockScriptGenerate.mockResolvedValue('Script');
    mockVoiceSynthesize.mockResolvedValue(Readable.from(['audio']));
    mockStorageUpload.mockResolvedValue('key');
    mockVideoGenerate.mockResolvedValue({ jobId: 'veo-1' });
    mockVideoCheckStatus.mockResolvedValue({
      state: 'completed',
      downloadUri: 'https://example.com/video.mp4',
    });
    mockVideoDownload.mockResolvedValue(Readable.from(['video']));
    mockStorageDownload
      .mockResolvedValueOnce(Readable.from(['voiceover-data']))
      .mockResolvedValueOnce(Readable.from(['ambient-data']));
    mockCompose.mockResolvedValue({
      videoPath: '/tmp/output.mp4',
      thumbnailPath: '/tmp/thumb.jpg',
      durationSeconds: 120,
      cleanupTempDir: vi.fn().mockResolvedValue(undefined),
    });
    setupDbInsertChain([{ id: 'video-1' }]);

    const job = createMockJob({ generationRequestId: 'gen-123' });
    await capturedProcessJob(job);

    expect(mockStorageDownload).toHaveBeenCalledTimes(2);
    expect(mockStorageDownload).toHaveBeenCalledWith('ambient/rain.mp3');
  });

  it('loads music track from DB when musicTrackId is set', async () => {
    const genReqWithMusic = {
      ...BASE_GEN_REQUEST,
      musicTrackId: 'music-1',
    };

    mockDbSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([genReqWithMusic]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'music-1', storageKey: 'music/calm.mp3' }]),
          }),
        }),
      });

    mockScriptGenerate.mockResolvedValue('Script');
    mockVoiceSynthesize.mockResolvedValue(Readable.from(['audio']));
    mockStorageUpload.mockResolvedValue('key');
    mockVideoGenerate.mockResolvedValue({ jobId: 'veo-1' });
    mockVideoCheckStatus.mockResolvedValue({
      state: 'completed',
      downloadUri: 'https://example.com/video.mp4',
    });
    mockVideoDownload.mockResolvedValue(Readable.from(['video']));
    mockStorageDownload
      .mockResolvedValueOnce(Readable.from(['voiceover-data']))
      .mockResolvedValueOnce(Readable.from(['music-data']));
    mockCompose.mockResolvedValue({
      videoPath: '/tmp/output.mp4',
      thumbnailPath: '/tmp/thumb.jpg',
      durationSeconds: 120,
      cleanupTempDir: vi.fn().mockResolvedValue(undefined),
    });
    setupDbInsertChain([{ id: 'video-1' }]);

    const job = createMockJob({ generationRequestId: 'gen-123' });
    await capturedProcessJob(job);

    expect(mockStorageDownload).toHaveBeenCalledWith('music/calm.mp3');
  });

  it('updates progress through all stages', async () => {
    setupSuccessfulPipeline();

    const job = createMockJob({ generationRequestId: 'gen-123' });
    await capturedProcessJob(job);

    const progressValues = job.updateProgress.mock.calls.map(
      (call: number[]) => call[0],
    );

    // Should hit key milestones
    expect(progressValues).toContain(5);
    expect(progressValues).toContain(20);
    expect(progressValues).toContain(40);
    expect(progressValues).toContain(100);

    // Progress should be monotonically non-decreasing
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }
  });

  it('times out after VEO_MAX_POLLS polls', async () => {
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([BASE_GEN_REQUEST]),
        }),
      }),
    });

    mockScriptGenerate.mockResolvedValue('Script');
    mockVoiceSynthesize.mockResolvedValue(Readable.from(['audio']));
    mockStorageUpload.mockResolvedValue('key');
    mockVideoGenerate.mockResolvedValue({ jobId: 'veo-1' });
    mockVideoCheckStatus.mockResolvedValue({ state: 'processing' });

    vi.useFakeTimers();
    const job = createMockJob({ generationRequestId: 'gen-123' });
    const promise = capturedProcessJob(job).catch((e: Error) => e);

    // Advance enough time for all 48+ polls (10s each)
    await vi.advanceTimersByTimeAsync(500_000);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('Veo video generation timed out after 8 minutes');
  });

  it('inserts video record with correct fields', async () => {
    setupSuccessfulPipeline();

    const job = createMockJob({ generationRequestId: 'gen-123' });
    await capturedProcessJob(job);

    expect(mockDbInsert).toHaveBeenCalled();
    const valuesCall = mockDbInsert.mock.results[0].value.values;
    const insertedValues = valuesCall.mock.calls[0][0];
    expect(insertedValues).toMatchObject({
      userId: 'user-456',
      title: 'A peaceful mountain scene',
      visibility: 'pending_review',
      moderationStatus: 'pending',
      visualPrompt: 'A peaceful mountain scene',
    });
    expect(insertedValues.storageKey).toContain('videos/gen-123/final.mp4');
    expect(insertedValues.thumbnailKey).toContain('videos/gen-123/thumbnail.jpg');
  });

  it('calls updateGeneration with status transitions in order', async () => {
    setupSuccessfulPipeline();

    // Override mockDbUpdate AFTER setupSuccessfulPipeline so it captures set args
    const setArgs: any[] = [];
    mockDbUpdate.mockImplementation(() => ({
      set: vi.fn().mockImplementation((arg: any) => {
        setArgs.push(arg);
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    }));

    const job = createMockJob({ generationRequestId: 'gen-123' });
    await capturedProcessJob(job);

    const statuses = setArgs.map((c: any) => c.status);

    expect(statuses).toContain('generating_script');
    expect(statuses).toContain('generating_voice');
    expect(statuses).toContain('generating_video');
    expect(statuses).toContain('compositing');
    expect(statuses).toContain('completed');

    // Verify order: generating_script before generating_voice before generating_video
    const scriptIdx = statuses.indexOf('generating_script');
    const voiceIdx = statuses.indexOf('generating_voice');
    const videoIdx = statuses.indexOf('generating_video');
    const compositingIdx = statuses.indexOf('compositing');
    const completedIdx = statuses.indexOf('completed');
    expect(scriptIdx).toBeLessThan(voiceIdx);
    expect(voiceIdx).toBeLessThan(videoIdx);
    expect(videoIdx).toBeLessThan(compositingIdx);
    expect(compositingIdx).toBeLessThan(completedIdx);
  });

  it('calls createReadStream with composition result paths', async () => {
    const { createReadStream } = await import('node:fs');
    setupSuccessfulPipeline();

    const job = createMockJob({ generationRequestId: 'gen-123' });
    await capturedProcessJob(job);

    expect(createReadStream).toHaveBeenCalledWith('/tmp/meditation-xxx/output.mp4');
    expect(createReadStream).toHaveBeenCalledWith('/tmp/meditation-xxx/thumbnail.jpg');
  });
});

describe('video-generate-worker failed event handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDbUpdateChain();
  });

  function capturedOnFailed(job: any, err: Error) {
    if (!capturedRef.onFailed) throw new Error('onFailed not captured');
    return capturedRef.onFailed(job, err);
  }

  it('marks generation as FAILED when all retries exhausted', async () => {
    const job = {
      data: { generationRequestId: 'gen-999' },
      id: 'job-1',
      attemptsMade: 3,
      opts: { attempts: 3 },
    };

    await capturedOnFailed(job, new Error('Some error'));

    expect(mockDbUpdate).toHaveBeenCalled();
    const setCall = mockDbUpdate.mock.results[0].value.set.mock.calls[0][0];
    expect(setCall.status).toBe('failed');
  });

  it('does NOT mark failed on intermediate retry', async () => {
    const job = {
      data: { generationRequestId: 'gen-999' },
      id: 'job-1',
      attemptsMade: 1,
      opts: { attempts: 3 },
    };

    // Reset so we can verify no calls happen
    mockDbUpdate.mockClear();
    setupDbUpdateChain();

    await capturedOnFailed(job, new Error('Some error'));

    // mockDbUpdate should NOT have been called because attemptsMade < attempts
    // The handler only calls updateGeneration when attemptsMade >= attempts
    const setCalls = mockDbUpdate.mock.results.map(
      (r: any) => r.value.set.mock.calls[0]?.[0],
    ).filter(Boolean);
    const failedCalls = setCalls.filter((c: any) => c.status === 'failed');
    expect(failedCalls).toHaveLength(0);
  });

  it('returns early when job is null', async () => {
    // Should not throw
    await capturedOnFailed(null, new Error('Some error'));

    // No DB update should have been attempted
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});

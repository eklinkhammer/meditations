import { Readable } from 'node:stream';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SCRIPT_TYPE } from '@meditations/shared';

// ---------------------------------------------------------------------------
// Capture the processJob callback from the Worker constructor
// ---------------------------------------------------------------------------
let capturedProcessor: ((job: unknown) => Promise<void>) | null = null;
let capturedFailHandler: ((job: unknown, err: Error) => Promise<void>) | null = null;

vi.mock('bullmq', () => {
  function MockWorker(this: Record<string, unknown>, _name: string, processor: Function) {
    capturedProcessor = processor as (job: unknown) => Promise<void>;
    this.close = vi.fn();
    this.on = vi.fn().mockImplementation((event: string, handler: Function) => {
      if (event === 'failed') capturedFailHandler = handler as (job: unknown, err: Error) => Promise<void>;
      return this;
    });
  }
  function MockQueue(this: Record<string, unknown>) {
    this.add = vi.fn();
  }
  return { Worker: MockWorker, Queue: MockQueue };
});

vi.mock('ioredis', () => {
  const IORedis = function(this: Record<string, unknown>) {
    this.quit = vi.fn();
  };
  return { default: IORedis };
});

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------
const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();

vi.mock('../db/index.js', async () => {
  const { mockTables } = await import('./helpers/setup.js');
  return {
    db: {
      select: (...args: unknown[]) => mockDbSelect(...args),
      update: (...args: unknown[]) => mockDbUpdate(...args),
      insert: (...args: unknown[]) => mockDbInsert(...args),
    },
    generationRequests: mockTables.generationRequests,
    videos: mockTables.videos,
    ambientSounds: mockTables.ambientSounds,
    musicTracks: mockTables.musicTracks,
  };
});

// ---------------------------------------------------------------------------
// Mock AI providers
// ---------------------------------------------------------------------------
const mockGenerateScript = vi.fn();
const mockSynthesize = vi.fn();
const mockGenerateVideo = vi.fn();
const mockCheckStatus = vi.fn();
const mockDownloadResult = vi.fn();

vi.mock('../services/ai/index.js', () => ({
  getAIProviders: () => ({
    script: { generateScript: mockGenerateScript },
    voice: { synthesize: mockSynthesize },
    video: {
      generateVideo: mockGenerateVideo,
      checkStatus: mockCheckStatus,
      downloadResult: mockDownloadResult,
    },
  }),
}));

// ---------------------------------------------------------------------------
// Mock storage
// ---------------------------------------------------------------------------
const mockUpload = vi.fn().mockResolvedValue('key');
const mockDownload = vi.fn();

vi.mock('../services/storage/s3-service.js', () => ({
  upload: (...args: unknown[]) => mockUpload(...args),
  download: (...args: unknown[]) => mockDownload(...args),
}));

// ---------------------------------------------------------------------------
// Mock FFmpeg
// ---------------------------------------------------------------------------
const mockCleanup = vi.fn().mockResolvedValue(undefined);
const mockCompose = vi.fn();

vi.mock('../services/media/ffmpeg-service.js', () => ({
  compose: (...args: unknown[]) => mockCompose(...args),
}));

// ---------------------------------------------------------------------------
// Mock config
// ---------------------------------------------------------------------------
vi.mock('../config.js', () => ({
  config: {
    redis: { url: 'redis://localhost:6379' },
    ai: {},
  },
}));

// Mock createReadStream (used by worker for upload)
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    createReadStream: vi.fn().mockReturnValue(Readable.from(Buffer.from('fake-file-data'))),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockJob(overrides = {}) {
  return {
    data: { generationRequestId: 'gen-req-1' },
    updateProgress: vi.fn().mockResolvedValue(undefined),
    attemptsMade: 1,
    opts: { attempts: 3 },
    id: 'job-1',
    ...overrides,
  };
}

function createGenRequest(overrides = {}) {
  return {
    id: 'gen-req-1',
    userId: 'user-1',
    status: 'pending',
    visualPrompt: 'A peaceful mountain scene',
    scriptType: SCRIPT_TYPE.AI_GENERATED,
    scriptContent: null,
    durationSeconds: 60,
    ambientSoundId: null,
    musicTrackId: null,
    creditsCharged: 5,
    progress: 0,
    ...overrides,
  };
}

function mockReadableStream() {
  return Readable.from(Buffer.from('mock-stream-data'));
}

function setupDbUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: (val: unknown) => void) => resolve(undefined);
  mockDbUpdate.mockReturnValue(chain);
}

function setupDbSelectForGenRequest(genReq: unknown) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([genReq]),
      }),
    }),
  });
}

function setupDbInsertReturning(result: unknown) {
  mockDbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([result]),
    }),
  });
}

function setupFullPipeline(genReq = createGenRequest()) {
  setupDbSelectForGenRequest(genReq);
  setupDbUpdateChain();

  mockGenerateScript.mockResolvedValue('Welcome to your meditation...');
  mockSynthesize.mockResolvedValue(mockReadableStream());
  mockGenerateVideo.mockResolvedValue({ jobId: 'veo-job-1' });
  mockCheckStatus.mockResolvedValue({ state: 'completed', downloadUri: 'https://veo.test/video.mp4' });
  mockDownloadResult.mockResolvedValue(mockReadableStream());
  mockDownload.mockResolvedValue(mockReadableStream());

  mockCompose.mockResolvedValue({
    videoPath: '/tmp/output.mp4',
    thumbnailPath: '/tmp/thumbnail.jpg',
    durationSeconds: 60,
    cleanupTempDir: mockCleanup,
  });

  setupDbInsertReturning({ id: 'video-1' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Worker Pipeline Integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailHandler = null;

    // Dynamic import to trigger Worker constructor each time
    vi.resetModules();
    await import('../jobs/video-generate-worker.js');
  });

  it('registers a processor and fail handler with the Worker', async () => {
    expect(capturedProcessor).toBeTypeOf('function');
    expect(capturedFailHandler).toBeTypeOf('function');
  });

  // -----------------------------------------------------------------------
  // Full pipeline — AI-generated script
  // -----------------------------------------------------------------------
  describe('full pipeline with AI-generated script', () => {
    it('executes all 5 stages: script → voice → video → compose → upload', async () => {
      setupFullPipeline();
      const job = createMockJob();

      await capturedProcessor!(job);

      // Stage 1: Script generation
      expect(mockGenerateScript).toHaveBeenCalledWith('guided', 60, 'A peaceful mountain scene');

      // Stage 2: Voice synthesis
      expect(mockSynthesize).toHaveBeenCalledWith('Welcome to your meditation...', '21m00Tcm4TlvDq8ikWAM');
      expect(mockUpload).toHaveBeenCalledWith(
        'generations/gen-req-1/voiceover.mp3',
        expect.anything(),
        'audio/mpeg',
      );

      // Stage 3: Video generation
      expect(mockGenerateVideo).toHaveBeenCalledWith('A peaceful mountain scene', 60);
      expect(mockCheckStatus).toHaveBeenCalledWith('veo-job-1');

      // Stage 4: FFmpeg composition
      expect(mockCompose).toHaveBeenCalledWith({
        videoStream: expect.anything(),
        voiceoverStream: expect.anything(),
        ambientStream: undefined,
        musicStream: undefined,
      });

      // Stage 5: Upload + DB
      expect(mockUpload).toHaveBeenCalledWith(
        'videos/gen-req-1/final.mp4',
        expect.anything(),
        'video/mp4',
      );
      expect(mockUpload).toHaveBeenCalledWith(
        'videos/gen-req-1/thumbnail.jpg',
        expect.anything(),
        'image/jpeg',
      );
      expect(mockDbInsert).toHaveBeenCalled();

      // Cleanup
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('updates progress through all stages', async () => {
      setupFullPipeline();
      const job = createMockJob();

      await capturedProcessor!(job);

      const progressCalls = job.updateProgress.mock.calls.map((c: number[][]) => c[0]);
      expect(progressCalls).toContain(5);   // script start
      expect(progressCalls).toContain(15);  // script done
      expect(progressCalls).toContain(20);  // voice start
      expect(progressCalls).toContain(35);  // voice done
      expect(progressCalls).toContain(40);  // video start
      expect(progressCalls).toContain(75);  // video done
      expect(progressCalls).toContain(78);  // compose start
      expect(progressCalls).toContain(95);  // compose done
      expect(progressCalls).toContain(100); // upload done
    });
  });

  // -----------------------------------------------------------------------
  // User-provided script skips AI generation
  // -----------------------------------------------------------------------
  describe('user-provided script', () => {
    it('skips script generation and uses provided content', async () => {
      const genReq = createGenRequest({
        scriptType: SCRIPT_TYPE.USER_PROVIDED,
        scriptContent: 'My custom meditation script...',
      });
      setupFullPipeline(genReq);
      const job = createMockJob();

      await capturedProcessor!(job);

      expect(mockGenerateScript).not.toHaveBeenCalled();
      expect(mockSynthesize).toHaveBeenCalledWith('My custom meditation script...', '21m00Tcm4TlvDq8ikWAM');
    });
  });

  // -----------------------------------------------------------------------
  // Ambient sound + music streams
  // -----------------------------------------------------------------------
  describe('optional audio layers', () => {
    it('includes ambient sound when ambientSoundId is set', async () => {
      const genReq = createGenRequest({ ambientSoundId: 'ambient-1' });
      setupFullPipeline(genReq);

      // Override select to return ambient sound on second call
      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // First call: load generation request
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([genReq]),
              }),
            }),
          };
        }
        // Subsequent call: load ambient sound
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'ambient-1', storageKey: 'audio/rain.mp3' }]),
            }),
          }),
        };
      });

      const job = createMockJob();
      await capturedProcessor!(job);

      expect(mockDownload).toHaveBeenCalledWith('audio/rain.mp3');
      expect(mockCompose).toHaveBeenCalledWith(
        expect.objectContaining({
          ambientStream: expect.anything(),
        }),
      );
    });

    it('includes music track when musicTrackId is set', async () => {
      const genReq = createGenRequest({ musicTrackId: 'music-1' });
      setupFullPipeline(genReq);

      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([genReq]),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'music-1', storageKey: 'audio/calm.mp3' }]),
            }),
          }),
        };
      });

      const job = createMockJob();
      await capturedProcessor!(job);

      expect(mockDownload).toHaveBeenCalledWith('audio/calm.mp3');
      expect(mockCompose).toHaveBeenCalledWith(
        expect.objectContaining({
          musicStream: expect.anything(),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Veo polling
  // -----------------------------------------------------------------------
  describe('Veo video polling', () => {
    it('polls until Veo reports completed', async () => {
      const genReq = createGenRequest();
      setupFullPipeline(genReq);

      // First check returns processing, second returns completed
      mockCheckStatus
        .mockResolvedValueOnce({ state: 'processing' })
        .mockResolvedValueOnce({ state: 'completed', downloadUri: 'https://veo.test/done.mp4' });

      const job = createMockJob();

      // Speed up setTimeout
      vi.useFakeTimers();
      const promise = capturedProcessor!(job);
      // Advance past the poll interval (10s)
      await vi.advanceTimersByTimeAsync(10_000);
      await promise;
      vi.useRealTimers();

      expect(mockCheckStatus).toHaveBeenCalledTimes(2);
    });

    it('throws when Veo reports failed', async () => {
      const genReq = createGenRequest();
      setupFullPipeline(genReq);

      mockCheckStatus.mockResolvedValue({ state: 'failed', error: 'Content policy violation' });

      const job = createMockJob();
      await expect(capturedProcessor!(job)).rejects.toThrow('Veo generation failed: Content policy violation');
    });
  });

  // -----------------------------------------------------------------------
  // Generation request not found
  // -----------------------------------------------------------------------
  describe('missing generation request', () => {
    it('throws when generation request is not in DB', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const job = createMockJob();
      await expect(capturedProcessor!(job)).rejects.toThrow('Generation request gen-req-1 not found');
    });
  });

  // -----------------------------------------------------------------------
  // Cleanup always runs
  // -----------------------------------------------------------------------
  describe('temp directory cleanup', () => {
    it('cleans up temp directory even if upload fails', async () => {
      setupFullPipeline();

      // Make the final upload fail
      mockUpload
        .mockResolvedValueOnce('key') // voiceover upload OK
        .mockRejectedValueOnce(new Error('S3 upload failed')) // video upload fails
        .mockRejectedValueOnce(new Error('S3 upload failed')); // thumbnail upload fails

      const job = createMockJob();
      await expect(capturedProcessor!(job)).rejects.toThrow('S3 upload failed');
      expect(mockCleanup).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Fail handler
  // -----------------------------------------------------------------------
  describe('fail handler', () => {
    it('marks generation as failed when retries are exhausted', async () => {
      setupDbUpdateChain();

      const job = {
        data: { generationRequestId: 'gen-fail-1' },
        attemptsMade: 3,
        opts: { attempts: 3 },
        id: 'job-fail-1',
      };

      await capturedFailHandler!(job, new Error('Pipeline crashed'));

      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('does not mark generation as failed when retries remain', async () => {
      const job = {
        data: { generationRequestId: 'gen-retry-1' },
        attemptsMade: 1,
        opts: { attempts: 3 },
        id: 'job-retry-1',
      };

      await capturedFailHandler!(job, new Error('Temporary failure'));

      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it('handles null job gracefully', async () => {
      // Should not throw
      await capturedFailHandler!(null, new Error('Unknown failure'));
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockGetUser,
  mockDbSelect,
  mockDbUpdate,
  mockDbInsert,
  mockDbTransaction,
  mockSql,
  mockQueueAdd,
} = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockGetUser: fn(),
    mockDbSelect: fn(),
    mockDbUpdate: fn(),
    mockDbInsert: fn(),
    mockDbTransaction: fn(),
    mockSql: fn().mockResolvedValue([{ '?column?': 1 }]),
    mockQueueAdd: fn().mockResolvedValue({ id: 'job-1' }),
  };
});

vi.mock('../db/index.js', async () => {
  const { mockTables } = await import('./helpers/setup.js');
  return {
    db: {
      select: (...args: unknown[]) => mockDbSelect(...args),
      update: (...args: unknown[]) => mockDbUpdate(...args),
      insert: (...args: unknown[]) => mockDbInsert(...args),
      transaction: (...args: unknown[]) => mockDbTransaction(...args),
    },
    sql: mockSql,
    ...mockTables,
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock('../jobs/queue.js', () => ({
  videoGenerateQueue: {
    add: (...args: unknown[]) => mockQueueAdd(...args),
  },
}));

vi.mock('../config.js', async () => {
  const { mockConfig } = await import('./helpers/setup.js');
  return mockConfig;
});

import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { VALID_USER, VALID_GENERATION, ZERO_CREDIT_USER } from '../test-helpers/fixtures.js';
import { chainableSelectMock, mockValidAuth, resetAllMocks, AUTH_HEADER } from './helpers/setup.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createSuccessfulTxMock(returnedGeneration: unknown, returnedBalance = 95) {
  return async (fn: Function) => {
    const txInsert = vi.fn();
    txInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });
    txInsert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([returnedGeneration]),
      }),
    });

    const tx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ creditsBalance: returnedBalance }]),
          }),
        }),
      }),
      insert: txInsert,
    };
    return fn(tx);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Generation Pipeline Integration', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    resetAllMocks({ mockGetUser, mockDbSelect, mockDbUpdate, mockDbInsert, mockDbTransaction, mockSql });
    mockQueueAdd.mockReset().mockResolvedValue({ id: 'job-1' });
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // Queue enqueue verification
  // -------------------------------------------------------------------------
  it('POST /api/generations enqueues a BullMQ job with the generation request ID', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);

    const genResult = { ...VALID_GENERATION, id: 'gen-queue-test-1' };
    mockDbTransaction.mockImplementation(createSuccessfulTxMock(genResult));

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: AUTH_HEADER,
      payload: {
        visualPrompt: 'A peaceful mountain scene',
        scriptType: 'ai_generated',
        durationSeconds: 60,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(mockQueueAdd).toHaveBeenCalledOnce();
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'generate',
      { generationRequestId: 'gen-queue-test-1' },
      { jobId: 'gen-queue-test-1' },
    );
  });

  it('queue job uses the generation ID as the BullMQ jobId for idempotency', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);

    const genResult = { ...VALID_GENERATION, id: 'idempotent-id-123' };
    mockDbTransaction.mockImplementation(createSuccessfulTxMock(genResult));

    await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: AUTH_HEADER,
      payload: {
        visualPrompt: 'Ocean waves',
        scriptType: 'ai_generated',
        durationSeconds: 120,
      },
    });

    const [, , opts] = mockQueueAdd.mock.calls[0];
    expect(opts.jobId).toBe('idempotent-id-123');
  });

  // -------------------------------------------------------------------------
  // Generation → Progress tracking flow
  // -------------------------------------------------------------------------
  it('tracks generation through pending → in-progress → completed states', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);

    const genResult = { ...VALID_GENERATION, id: 'progress-test-1' };
    mockDbTransaction.mockImplementation(createSuccessfulTxMock(genResult));

    // Step 1: Create generation
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: AUTH_HEADER,
      payload: {
        visualPrompt: 'A forest path',
        scriptType: 'ai_generated',
        durationSeconds: 60,
      },
    });
    expect(createRes.statusCode).toBe(201);

    // Step 2: Check progress — pending
    const pendingSelect = chainableSelectMock([{
      id: 'progress-test-1',
      status: 'pending',
      progress: 0,
      videoId: null,
    }]);
    mockDbSelect.mockImplementation((...args: unknown[]) => pendingSelect(...args));

    const pendingRes = await app.inject({
      method: 'GET',
      url: '/api/generations/progress-test-1/progress',
      headers: AUTH_HEADER,
    });
    expect(pendingRes.statusCode).toBe(200);
    expect(pendingRes.json().status).toBe('pending');
    expect(pendingRes.json().progress).toBe(0);

    // Step 3: Check progress — generating_video (mid-pipeline)
    const videoSelect = chainableSelectMock([{
      id: 'progress-test-1',
      status: 'generating_video',
      progress: 55,
      videoId: null,
    }]);
    mockDbSelect.mockImplementation((...args: unknown[]) => videoSelect(...args));

    const videoRes = await app.inject({
      method: 'GET',
      url: '/api/generations/progress-test-1/progress',
      headers: AUTH_HEADER,
    });
    expect(videoRes.statusCode).toBe(200);
    expect(videoRes.json().status).toBe('generating_video');
    expect(videoRes.json().progress).toBe(55);

    // Step 4: Check progress — completed
    const doneSelect = chainableSelectMock([{
      id: 'progress-test-1',
      status: 'completed',
      progress: 100,
      videoId: 'video-abc-123',
    }]);
    mockDbSelect.mockImplementation((...args: unknown[]) => doneSelect(...args));

    const doneRes = await app.inject({
      method: 'GET',
      url: '/api/generations/progress-test-1/progress',
      headers: AUTH_HEADER,
    });
    expect(doneRes.statusCode).toBe(200);
    expect(doneRes.json().status).toBe('completed');
    expect(doneRes.json().progress).toBe(100);
    expect(doneRes.json().videoId).toBe('video-abc-123');
  });

  // -------------------------------------------------------------------------
  // Failed generation progress
  // -------------------------------------------------------------------------
  it('reports failed status when generation fails', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);

    const failedSelect = chainableSelectMock([{
      id: 'failed-gen-1',
      status: 'failed',
      progress: 0,
      videoId: null,
    }]);
    mockDbSelect.mockImplementation((...args: unknown[]) => failedSelect(...args));

    const res = await app.inject({
      method: 'GET',
      url: '/api/generations/failed-gen-1/progress',
      headers: AUTH_HEADER,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('failed');
    expect(res.json().progress).toBe(0);
    expect(res.json().videoId).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Insufficient credits prevents queue enqueue
  // -------------------------------------------------------------------------
  it('does not enqueue a job when credits are insufficient', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, ZERO_CREDIT_USER);

    mockDbTransaction.mockImplementation(async (fn: Function) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
      return fn(tx);
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: AUTH_HEADER,
      payload: {
        visualPrompt: 'A scene',
        scriptType: 'ai_generated',
        durationSeconds: 60,
      },
    });

    expect(res.statusCode).toBe(402);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Private visibility surcharge + queue
  // -------------------------------------------------------------------------
  it('private visibility adds surcharge and still enqueues job', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);

    const genResult = { ...VALID_GENERATION, id: 'private-gen-1', creditsCharged: 8 };
    mockDbTransaction.mockImplementation(createSuccessfulTxMock(genResult, 92));

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: AUTH_HEADER,
      payload: {
        visualPrompt: 'A private garden',
        scriptType: 'ai_generated',
        durationSeconds: 60,
        visibility: 'private',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().creditsCharged).toBe(8);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'generate',
      { generationRequestId: 'private-gen-1' },
      { jobId: 'private-gen-1' },
    );
  });

  // -------------------------------------------------------------------------
  // Listing generations reflects queue state
  // -------------------------------------------------------------------------
  it('GET /api/generations lists all user generations with their statuses', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);

    const generations = [
      { ...VALID_GENERATION, id: 'gen-1', status: 'completed', progress: 100 },
      { ...VALID_GENERATION, id: 'gen-2', status: 'generating_video', progress: 55 },
      { ...VALID_GENERATION, id: 'gen-3', status: 'pending', progress: 0 },
    ];

    const listSelect = chainableSelectMock(generations);
    mockDbSelect.mockImplementation((...args: unknown[]) => listSelect(...args));

    const res = await app.inject({
      method: 'GET',
      url: '/api/generations',
      headers: AUTH_HEADER,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(3);
    expect(body.data[0].status).toBe('completed');
    expect(body.data[1].status).toBe('generating_video');
    expect(body.data[2].status).toBe('pending');
  });

  // -------------------------------------------------------------------------
  // User-provided script bypasses AI generation
  // -------------------------------------------------------------------------
  it('user_provided scriptType still enqueues job with script content', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);

    const genResult = {
      ...VALID_GENERATION,
      id: 'user-script-gen-1',
      scriptType: 'user_provided',
      scriptContent: 'Welcome to your meditation journey...',
    };
    mockDbTransaction.mockImplementation(createSuccessfulTxMock(genResult));

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: AUTH_HEADER,
      payload: {
        visualPrompt: 'A calm lake',
        scriptType: 'user_provided',
        scriptContent: 'Welcome to your meditation journey...',
        durationSeconds: 60,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().scriptType).toBe('user_provided');
    expect(res.json().scriptContent).toBe('Welcome to your meditation journey...');
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'generate',
      { generationRequestId: 'user-script-gen-1' },
      { jobId: 'user-script-gen-1' },
    );
  });

  // -------------------------------------------------------------------------
  // Progress for another user's generation → 404
  // -------------------------------------------------------------------------
  it('returns 404 when checking progress of another user\'s generation', async () => {
    // Auth returns user on first call, then progress query returns empty
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          email: VALID_USER.email,
          user_metadata: { full_name: VALID_USER.displayName },
          app_metadata: { provider: 'google' },
        },
      },
      error: null,
    });

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Auth middleware: return the user
        return chainableSelectMock([VALID_USER])();
      }
      // Progress query: return empty (generation not found / belongs to other user)
      return chainableSelectMock([])();
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/generations/other-user-gen/progress',
      headers: AUTH_HEADER,
    });

    expect(res.statusCode).toBe(404);
  });

  // -------------------------------------------------------------------------
  // All duration tiers enqueue correctly
  // -------------------------------------------------------------------------
  it.each([
    [60, 5],
    [120, 8],
    [180, 12],
    [300, 15],
  ])('duration %ds (cost %d) enqueues job after credit deduction', async (duration, credits) => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);

    const genResult = {
      ...VALID_GENERATION,
      id: `dur-${duration}-gen`,
      durationSeconds: duration,
      creditsCharged: credits,
    };
    mockDbTransaction.mockImplementation(createSuccessfulTxMock(genResult, VALID_USER.creditsBalance - credits));

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: AUTH_HEADER,
      payload: {
        visualPrompt: 'A serene meadow',
        scriptType: 'ai_generated',
        durationSeconds: duration,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().creditsCharged).toBe(credits);
    expect(mockQueueAdd).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Invalid duration rejected by Zod schema
  // -------------------------------------------------------------------------
  it('rejects invalid durationSeconds with 400', async () => {
    mockValidAuth(mockGetUser, mockDbSelect, VALID_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/api/generations',
      headers: AUTH_HEADER,
      payload: {
        visualPrompt: 'A peaceful scene',
        scriptType: 'ai_generated',
        durationSeconds: 90,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});

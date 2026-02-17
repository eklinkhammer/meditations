import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
}));

// Mock db/index.js so the sql tagged template resolves successfully
vi.mock('../../db/index.js', () => ({
  sql: mockSql,
  db: {},
}));

import { healthRoutes } from '../health.js';

describe('health routes', () => {
  it('GET /health returns status ok with timestamp', async () => {
    mockSql.mockResolvedValue([{ '?column?': 1 }]);

    const app = Fastify();
    await app.register(healthRoutes);

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /health returns degraded when DB is unreachable', async () => {
    mockSql.mockRejectedValue(new Error('Connection failed'));

    const app = Fastify();
    await app.register(healthRoutes);

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('error');
  });
});

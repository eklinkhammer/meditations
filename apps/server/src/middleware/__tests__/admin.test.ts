import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { requireAdmin } from '../../middleware/admin.js';
import type { AuthUser } from '../../middleware/auth.js';

function buildApp(user: AuthUser) {
  const app = Fastify();
  // Simulate authentication by setting request.user
  app.addHook('onRequest', async (request) => {
    request.user = user;
  });
  app.get('/admin-test', { onRequest: [requireAdmin] }, async () => {
    return { ok: true };
  });
  return app;
}

describe('requireAdmin middleware', () => {
  it('passes through for admin role', async () => {
    const app = buildApp({
      id: '1',
      email: 'admin@test.com',
      displayName: 'Admin',
      role: 'admin',
      creditsBalance: 0,
      isPremium: false,
    });

    const res = await app.inject({ method: 'GET', url: '/admin-test' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('returns 403 for non-admin role', async () => {
    const app = buildApp({
      id: '2',
      email: 'user@test.com',
      displayName: 'User',
      role: 'user',
      creditsBalance: 0,
      isPremium: false,
    });

    const res = await app.inject({ method: 'GET', url: '/admin-test' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/admin/i);
  });
});

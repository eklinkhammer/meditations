import { vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../middleware/auth.js';
import { VALID_USER } from './fixtures.js';

/**
 * Adds a preHandler hook that sets request.user to the given fixture user,
 * bypassing real Supabase authentication.
 */
export function addMockAuth(app: FastifyInstance, user: AuthUser = VALID_USER as AuthUser) {
  app.addHook('onRequest', async (request) => {
    request.user = user;
  });
}

/**
 * Mock for @supabase/supabase-js createClient.
 * Returns a mock client with auth.getUser() that can be controlled.
 */
export function createMockSupabaseClient(options?: {
  user?: { email: string; user_metadata?: Record<string, string>; app_metadata?: Record<string, string> } | null;
  error?: Error | null;
}) {
  const user = options?.user ?? null;
  const error = options?.error ?? (user ? null : new Error('Invalid token'));

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error,
      }),
    },
  };
}

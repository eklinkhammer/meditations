import { FastifyPluginAsync } from 'fastify';
import { sql } from '../db/index.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    let dbStatus = 'ok';
    try {
      await sql`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    const status = dbStatus === 'ok' ? 'ok' : 'degraded';

    return { status, db: dbStatus, timestamp: new Date().toISOString() };
  });
};

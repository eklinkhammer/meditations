import Fastify, { FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { userRoutes } from './routes/users.js';
import { videoRoutes } from './routes/videos.js';
import { generationRoutes } from './routes/generations.js';
import { creditRoutes } from './routes/credits.js';
import { adminRoutes } from './routes/admin.js';
import { mediaRoutes } from './routes/media.js';

export async function buildApp(opts?: FastifyServerOptions) {
  const app = Fastify(opts);

  await app.register(helmet);

  await app.register(cors, {
    origin: config.corsOrigins,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: 60000,
  });

  // Routes
  await app.register(healthRoutes);
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(videoRoutes, { prefix: '/api/videos' });
  await app.register(generationRoutes, { prefix: '/api/generations' });
  await app.register(creditRoutes, { prefix: '/api/credits' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(mediaRoutes, { prefix: '/api/media' });

  return app;
}

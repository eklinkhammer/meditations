import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { sql } from './db/index.js';
import { healthRoutes } from './routes/health.js';
import { userRoutes } from './routes/users.js';
import { videoRoutes } from './routes/videos.js';
import { generationRoutes } from './routes/generations.js';
import { creditRoutes } from './routes/credits.js';
import { adminRoutes } from './routes/admin.js';
import { mediaRoutes } from './routes/media.js';

const app = Fastify({
  logger: {
    level: config.logLevel,
  },
});

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

// Graceful shutdown
const shutdown = async () => {
  app.log.info('Shutting down gracefully...');
  await app.close();
  await sql.end();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Server listening on http://0.0.0.0:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export { app };

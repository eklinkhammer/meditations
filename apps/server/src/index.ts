import { sql } from './db/index.js';
import { config } from './config.js';
import { buildApp } from './app.js';
import { videoGenerateWorker } from './jobs/video-generate-worker.js';
import { redisConnection } from './jobs/queue.js';

const app = await buildApp({
  logger: {
    level: config.logLevel,
  },
});

// Graceful shutdown
const shutdown = async () => {
  app.log.info('Shutting down gracefully...');
  await videoGenerateWorker.close();
  await app.close();
  await sql.end();
  await redisConnection.quit();
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

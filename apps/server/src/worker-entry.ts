import 'dotenv/config';
import { videoGenerateWorker } from './jobs/video-generate-worker.js';
import { redisConnection } from './jobs/queue.js';

console.log('Video generation worker started');

videoGenerateWorker.on('error', (err) => {
  console.error('Worker error:', err);
});

const shutdown = async () => {
  console.log('Worker shutting down...');
  setTimeout(() => process.exit(1), 30_000).unref();
  await videoGenerateWorker.close();
  await redisConnection.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

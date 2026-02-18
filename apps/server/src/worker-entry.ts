import 'dotenv/config';
import { videoGenerateWorker } from './jobs/video-generate-worker.js';
import { redisConnection } from './jobs/queue.js';

console.log('Video generation worker started');

const shutdown = async () => {
  console.log('Worker shutting down...');
  await videoGenerateWorker.close();
  await redisConnection.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

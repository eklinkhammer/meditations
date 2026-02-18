import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config.js';

export interface VideoGenerateJobData {
  generationRequestId: string;
}

export const redisConnection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
});

export const videoGenerateQueue = new Queue<VideoGenerateJobData>(
  'video-generate',
  {
    connection: redisConnection as unknown as ConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30_000,
      },
      removeOnComplete: {
        age: 86_400, // 24 hours
      },
      removeOnFail: {
        age: 604_800, // 7 days
      },
    },
  },
);

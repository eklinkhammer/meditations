import { createReadStream } from 'node:fs';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { GENERATION_STATUS, SCRIPT_TYPE, VIDEO_VISIBILITY, MODERATION_STATUS } from '@meditations/shared';
import { db, generationRequests, videos, ambientSounds, musicTracks } from '../db/index.js';
import { getAIProviders } from '../services/ai/index.js';
import type { MeditationType } from '../services/ai/types.js';
import * as storage from '../services/storage/s3-service.js';
import { compose } from '../services/media/ffmpeg-service.js';
import { redisConnection, type VideoGenerateJobData } from './queue.js';

const VEO_POLL_INTERVAL_MS = 10_000;
const VEO_MAX_POLLS = 48; // ~8 minutes
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // ElevenLabs "Rachel"

async function updateGeneration(
  id: string,
  status: string,
  progress: number,
  extra?: Record<string, unknown>,
) {
  await db
    .update(generationRequests)
    .set({ status, progress, updatedAt: new Date(), ...extra })
    .where(eq(generationRequests.id, id));
}

async function processJob(job: Job<VideoGenerateJobData>) {
  const { generationRequestId } = job.data;
  const providers = getAIProviders();

  // Load the generation request
  const [genReq] = await db
    .select()
    .from(generationRequests)
    .where(eq(generationRequests.id, generationRequestId))
    .limit(1);

  if (!genReq) {
    throw new Error(`Generation request ${generationRequestId} not found`);
  }

  const meditationType: MeditationType = 'guided';

  // -----------------------------------------------------------------------
  // Stage 1: Script generation (5→15%)
  // -----------------------------------------------------------------------
  let scriptText = genReq.scriptContent;

  if (genReq.scriptType === SCRIPT_TYPE.AI_GENERATED || !scriptText) {
    await updateGeneration(generationRequestId, GENERATION_STATUS.GENERATING_SCRIPT, 5);
    await job.updateProgress(5);

    scriptText = await providers.script.generateScript(
      meditationType,
      genReq.durationSeconds,
      genReq.visualPrompt, // use visual prompt as theme hint
    );

    await updateGeneration(generationRequestId, GENERATION_STATUS.GENERATING_SCRIPT, 15, {
      scriptContent: scriptText,
    });
    await job.updateProgress(15);
  }

  // -----------------------------------------------------------------------
  // Stage 2: Voiceover synthesis (20→35%)
  // -----------------------------------------------------------------------
  await updateGeneration(generationRequestId, GENERATION_STATUS.GENERATING_VOICE, 20);
  await job.updateProgress(20);

  const voiceoverStream = await providers.voice.synthesize(scriptText!, DEFAULT_VOICE_ID);

  // Buffer voiceover to S3 as intermediate artifact
  const voiceoverKey = `generations/${generationRequestId}/voiceover.mp3`;
  await storage.upload(voiceoverKey, voiceoverStream, 'audio/mpeg');

  await updateGeneration(generationRequestId, GENERATION_STATUS.GENERATING_VOICE, 35);
  await job.updateProgress(35);

  // -----------------------------------------------------------------------
  // Stage 3: Video generation + polling (40→75%)
  // -----------------------------------------------------------------------
  await updateGeneration(generationRequestId, GENERATION_STATUS.GENERATING_VIDEO, 40);
  await job.updateProgress(40);

  const { jobId: veoJobId } = await providers.video.generateVideo(
    genReq.visualPrompt,
    genReq.durationSeconds,
  );

  // Poll until done
  let videoStatus = await providers.video.checkStatus(veoJobId);
  let polls = 0;

  while (videoStatus.state !== 'completed' && videoStatus.state !== 'failed') {
    if (polls >= VEO_MAX_POLLS) {
      throw new Error('Veo video generation timed out after 8 minutes');
    }
    await new Promise((r) => setTimeout(r, VEO_POLL_INTERVAL_MS));
    videoStatus = await providers.video.checkStatus(veoJobId);
    polls++;

    // Interpolate progress 40→75 across polls
    const pollProgress = 40 + Math.round((polls / VEO_MAX_POLLS) * 35);
    await job.updateProgress(Math.min(pollProgress, 75));
  }

  if (videoStatus.state === 'failed') {
    throw new Error(`Veo generation failed: ${videoStatus.error}`);
  }

  await updateGeneration(generationRequestId, GENERATION_STATUS.GENERATING_VIDEO, 75);
  await job.updateProgress(75);

  // -----------------------------------------------------------------------
  // Stage 4: FFmpeg composition (78→95%)
  // -----------------------------------------------------------------------
  await updateGeneration(generationRequestId, GENERATION_STATUS.COMPOSITING, 78);
  await job.updateProgress(78);

  // Download video from Veo
  const videoStream = await providers.video.downloadResult(veoJobId);

  // Download voiceover from S3
  const voiceoverDownload = await storage.download(voiceoverKey);

  // Load optional ambient/music from DB → S3
  let ambientStream;
  if (genReq.ambientSoundId) {
    const [ambient] = await db
      .select()
      .from(ambientSounds)
      .where(eq(ambientSounds.id, genReq.ambientSoundId))
      .limit(1);
    if (ambient) {
      ambientStream = await storage.download(ambient.storageKey);
    }
  }

  let musicStream;
  if (genReq.musicTrackId) {
    const [track] = await db
      .select()
      .from(musicTracks)
      .where(eq(musicTracks.id, genReq.musicTrackId))
      .limit(1);
    if (track) {
      musicStream = await storage.download(track.storageKey);
    }
  }

  const compositionResult = await compose({
    videoStream,
    voiceoverStream: voiceoverDownload,
    ambientStream,
    musicStream,
  });

  try {
    await updateGeneration(generationRequestId, GENERATION_STATUS.COMPOSITING, 95);
    await job.updateProgress(95);

    // -------------------------------------------------------------------
    // Stage 5: Upload + DB insert (95→100%)
    // -------------------------------------------------------------------
    const videoKey = `videos/${generationRequestId}/final.mp4`;
    const thumbKey = `videos/${generationRequestId}/thumbnail.jpg`;

    await Promise.all([
      storage.upload(videoKey, createReadStream(compositionResult.videoPath), 'video/mp4'),
      storage.upload(thumbKey, createReadStream(compositionResult.thumbnailPath), 'image/jpeg'),
    ]);

    // Insert video record
    const [video] = await db
      .insert(videos)
      .values({
        userId: genReq.userId,
        title: genReq.visualPrompt.slice(0, 200),
        storageKey: videoKey,
        thumbnailKey: thumbKey,
        durationSeconds: compositionResult.durationSeconds,
        visibility: VIDEO_VISIBILITY.PENDING_REVIEW,
        moderationStatus: MODERATION_STATUS.PENDING,
        visualPrompt: genReq.visualPrompt,
      })
      .returning();

    // Link video to generation request
    await updateGeneration(generationRequestId, GENERATION_STATUS.COMPLETED, 100, {
      videoId: video.id,
    });
    await job.updateProgress(100);
  } finally {
    await compositionResult.cleanupTempDir();
  }
}

export const videoGenerateWorker = new Worker<VideoGenerateJobData>(
  'video-generate',
  processJob,
  {
    connection: redisConnection as unknown as ConnectionOptions,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 60_000,
    },
  },
);

videoGenerateWorker.on('failed', async (job, err) => {
  if (!job) return;
  const { generationRequestId } = job.data;

  // Only mark failed when all retries are exhausted
  if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
    await updateGeneration(generationRequestId, GENERATION_STATUS.FAILED, 0);
  }

  console.error(
    `Job ${job.id} failed (attempt ${job.attemptsMade}): ${err.message}`,
  );
});

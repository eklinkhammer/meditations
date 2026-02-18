import { Readable } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import ffmpeg from 'fluent-ffmpeg';
import { AUDIO_MIX_LEVELS } from '@meditations/shared';

export interface CompositionInput {
  videoStream: Readable;
  voiceoverStream: Readable;
  ambientStream?: Readable;
  musicStream?: Readable;
}

export interface CompositionOutput {
  videoPath: string;
  thumbnailPath: string;
  durationSeconds: number;
  cleanupTempDir: () => Promise<void>;
}

function writeStreamToFile(stream: Readable, path: string): Promise<void> {
  return pipeline(stream, createWriteStream(path));
}

function probe(filePath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function runFfmpeg(cmd: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    cmd.on('end', () => resolve()).on('error', reject).run();
  });
}

export async function compose(input: CompositionInput): Promise<CompositionOutput> {
  const workDir = join(tmpdir(), `meditation-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const videoFile = join(workDir, 'video.mp4');
  const voiceFile = join(workDir, 'voiceover.mp3');
  const ambientFile = join(workDir, 'ambient.mp3');
  const musicFile = join(workDir, 'music.mp3');
  const outputFile = join(workDir, 'output.mp4');
  const thumbFile = join(workDir, 'thumbnail.jpg');

  // Write input streams to temp files in parallel
  const writes: Promise<void>[] = [
    writeStreamToFile(input.videoStream, videoFile),
    writeStreamToFile(input.voiceoverStream, voiceFile),
  ];
  if (input.ambientStream) writes.push(writeStreamToFile(input.ambientStream, ambientFile));
  if (input.musicStream) writes.push(writeStreamToFile(input.musicStream, musicFile));
  await Promise.all(writes);

  // Probe voiceover to determine target duration
  const voiceProbe = await probe(voiceFile);
  const durationSeconds = Math.ceil(voiceProbe.format.duration ?? 0);
  if (durationSeconds < 1) {
    throw new Error('Invalid voiceover duration');
  }

  // Build FFmpeg command
  const cmd = ffmpeg();

  // Video input — loop and trim to voiceover duration
  cmd.input(videoFile).inputOptions(['-stream_loop', '-1']);

  // Audio inputs
  cmd.input(voiceFile);

  const filterParts: string[] = [];
  let audioInputIndex = 1; // 0 = video, 1 = voiceover
  const mixInputs: string[] = ['[voice]'];

  // Voiceover — always present, volume 1.0
  filterParts.push(
    `[${audioInputIndex}:a]volume=${AUDIO_MIX_LEVELS.VOICEOVER}[voice]`,
  );

  if (input.ambientStream) {
    audioInputIndex++;
    cmd.input(ambientFile).inputOptions(['-stream_loop', '-1']);
    filterParts.push(
      `[${audioInputIndex}:a]volume=${AUDIO_MIX_LEVELS.AMBIENT}[ambient]`,
    );
    mixInputs.push('[ambient]');
  }

  if (input.musicStream) {
    audioInputIndex++;
    cmd.input(musicFile).inputOptions(['-stream_loop', '-1']);
    filterParts.push(
      `[${audioInputIndex}:a]volume=${AUDIO_MIX_LEVELS.MUSIC}[music]`,
    );
    mixInputs.push('[music]');
  }

  // Mix audio streams
  if (mixInputs.length > 1) {
    filterParts.push(
      `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first[aout]`,
    );
  } else {
    // Only voiceover — rename
    filterParts.push('[voice]acopy[aout]');
  }

  cmd
    .complexFilter(filterParts.join(';'))
    .outputOptions([
      '-map', '0:v',
      '-map', '[aout]',
      '-t', String(durationSeconds),
      '-c:v', 'libx264',
      '-crf', '23',
      '-preset', 'medium',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-shortest',
    ])
    .output(outputFile);

  await runFfmpeg(cmd);

  // Extract thumbnail at 2s mark
  const thumbCmd = ffmpeg(outputFile)
    .screenshots({
      timestamps: ['00:00:02'],
      filename: 'thumbnail.jpg',
      folder: workDir,
      size: '1280x720',
    });

  await new Promise<void>((resolve, reject) => {
    thumbCmd.on('end', () => resolve()).on('error', reject);
  });

  return {
    videoPath: outputFile,
    thumbnailPath: thumbFile,
    durationSeconds,
    cleanupTempDir: () => rm(workDir, { recursive: true, force: true }),
  };
}

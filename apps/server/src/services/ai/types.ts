import { Readable } from 'node:stream';

// ---------------------------------------------------------------------------
// Meditation types
// ---------------------------------------------------------------------------
export type MeditationType =
  | 'guided'
  | 'breathing'
  | 'body_scan'
  | 'visualization'
  | 'affirmation';

// ---------------------------------------------------------------------------
// Video provider
// ---------------------------------------------------------------------------
export type VideoJobStatus =
  | { state: 'pending' }
  | { state: 'processing' }
  | { state: 'completed'; downloadUri: string }
  | { state: 'failed'; error: string };

export interface VideoProvider {
  generateVideo(prompt: string, durationSeconds: number): Promise<{ jobId: string }>;
  checkStatus(jobId: string): Promise<VideoJobStatus>;
  downloadResult(jobId: string): Promise<Readable>;
}

// ---------------------------------------------------------------------------
// Voice provider
// ---------------------------------------------------------------------------
export interface Voice {
  id: string;
  name: string;
  previewUrl?: string;
}

export interface VoiceProvider {
  synthesize(text: string, voiceId: string): Promise<Readable>;
  listVoices(): Promise<Voice[]>;
}

// ---------------------------------------------------------------------------
// Script provider
// ---------------------------------------------------------------------------
export interface ScriptProvider {
  generateScript(
    type: MeditationType,
    durationSeconds: number,
    theme?: string,
    userPrompt?: string,
  ): Promise<string>;
}

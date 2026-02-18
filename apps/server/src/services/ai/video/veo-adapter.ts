import { Readable } from 'node:stream';
import type { VideoProvider, VideoJobStatus } from '../types.js';
import { config } from '../../../config.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'veo-3.1-generate-preview';

export class VeoVideoAdapter implements VideoProvider {
  private apiKey: string;

  constructor() {
    if (!config.ai.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.apiKey = config.ai.geminiApiKey;
  }

  async generateVideo(prompt: string): Promise<{ jobId: string }> {
    const res = await fetch(
      `${GEMINI_BASE}/models/${MODEL}:predictLongRunning?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [
            {
              prompt,
            },
          ],
          parameters: {
            aspectRatio: '16:9',
            personGeneration: 'dont_allow',
            durationSeconds: 8,
            resolution: '720p',
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Veo generateVideo failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { name: string };
    return { jobId: data.name };
  }

  async checkStatus(jobId: string): Promise<VideoJobStatus> {
    const res = await fetch(
      `${GEMINI_BASE}/${jobId}?key=${this.apiKey}`,
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Veo checkStatus failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      done?: boolean;
      error?: { message: string };
      response?: {
        predictions?: Array<{ videoUri?: string }>;
      };
    };

    if (data.error) {
      return { state: 'failed', error: data.error.message };
    }

    if (!data.done) {
      return { state: 'processing' };
    }

    const videoUri = data.response?.predictions?.[0]?.videoUri;
    if (!videoUri) {
      return { state: 'failed', error: 'Veo completed but returned no video URI' };
    }

    return { state: 'completed', downloadUri: videoUri };
  }

  async downloadResult(jobId: string): Promise<Readable> {
    const status = await this.checkStatus(jobId);

    if (status.state !== 'completed') {
      throw new Error(`Cannot download: job is ${status.state}`);
    }

    const res = await fetch(status.downloadUri, {
      headers: { 'x-goog-api-key': this.apiKey },
    });

    if (!res.ok) {
      throw new Error(`Veo download failed (${res.status})`);
    }

    return Readable.fromWeb(res.body! as import('node:stream/web').ReadableStream);
  }
}

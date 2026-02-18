import { Readable } from 'node:stream';
import type { Voice, VoiceProvider } from '../types.js';
import { config } from '../../../config.js';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

export class ElevenLabsVoiceAdapter implements VoiceProvider {
  private apiKey: string;

  constructor() {
    if (!config.ai.elevenLabsApiKey) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }
    this.apiKey = config.ai.elevenLabsApiKey;
  }

  async synthesize(text: string, voiceId: string): Promise<Readable> {
    const res = await fetch(
      `${ELEVENLABS_BASE}/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          output_format: 'mp3_44100_128',
          voice_settings: {
            stability: 0.7,
            similarity_boost: 0.75,
            speed: 0.9,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ElevenLabs synthesis failed (${res.status}): ${body}`);
    }

    return Readable.fromWeb(res.body! as import('node:stream/web').ReadableStream);
  }

  async listVoices(): Promise<Voice[]> {
    const res = await fetch(`${ELEVENLABS_BASE}/voices`, {
      headers: { 'xi-api-key': this.apiKey },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ElevenLabs listVoices failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      voices: Array<{
        voice_id: string;
        name: string;
        preview_url?: string;
      }>;
    };

    return data.voices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      previewUrl: v.preview_url,
    }));
  }
}

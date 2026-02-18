import type { VideoProvider, VoiceProvider, ScriptProvider } from './types.js';
import { VeoVideoAdapter } from './video/veo-adapter.js';
import { ElevenLabsVoiceAdapter } from './voice/elevenlabs-adapter.js';
import { GeminiScriptAdapter } from './text/gemini-adapter.js';

export type { VideoProvider, VoiceProvider, ScriptProvider } from './types.js';
export type { VideoJobStatus, Voice, MeditationType } from './types.js';

interface AIProviders {
  video: VideoProvider;
  voice: VoiceProvider;
  script: ScriptProvider;
}

let providers: AIProviders | null = null;

export function getAIProviders(): AIProviders {
  if (!providers) {
    providers = {
      video: new VeoVideoAdapter(),
      voice: new ElevenLabsVoiceAdapter(),
      script: new GeminiScriptAdapter(),
    };
  }
  return providers;
}

/** Override providers for testing */
export function setAIProviders(overrides: Partial<AIProviders>): void {
  const current = providers ?? getAIProviders();
  providers = { ...current, ...overrides };
}

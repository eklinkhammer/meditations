import type { MeditationType, ScriptProvider } from '../types.js';
import { config } from '../../../config.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-2.5-flash';
const WORDS_PER_MINUTE = 130;

const TYPE_GUIDANCE: Record<MeditationType, string> = {
  guided:
    'Write a guided meditation with vivid imagery. Guide the listener through a calming scene, engaging all senses.',
  breathing:
    'Write a breathing exercise. Include clear inhale/hold/exhale timing cues (e.g., "breathe in for 4 counts"). Use pauses between instructions.',
  body_scan:
    'Write a body scan meditation. Progress systematically from feet to head, inviting the listener to notice and release tension in each area.',
  visualization:
    'Write a visualization meditation. Paint a detailed mental scene the listener can step into, using rich sensory language.',
  affirmation:
    'Write an affirmation meditation. Weave positive affirmations naturally into a calming narrative. Use second-person ("you") for direct connection.',
};

export class GeminiScriptAdapter implements ScriptProvider {
  private apiKey: string;

  constructor() {
    if (!config.ai.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.apiKey = config.ai.geminiApiKey;
  }

  async generateScript(
    type: MeditationType,
    durationSeconds: number,
    theme?: string,
    userPrompt?: string,
  ): Promise<string> {
    const targetWords = Math.round((durationSeconds / 60) * WORDS_PER_MINUTE);

    const systemPrompt = [
      'You are a professional meditation script writer.',
      `Write a meditation script that is approximately ${targetWords} words long (about ${Math.round(durationSeconds / 60)} minutes at ${WORDS_PER_MINUTE} words per minute).`,
      TYPE_GUIDANCE[type],
      'Use a calm, soothing tone. Include natural pauses indicated by "..." between sections.',
      'Do NOT include stage directions, titles, or metadata — only the spoken script text.',
      theme ? `Theme/setting: ${theme}` : '',
      userPrompt ? `Additional guidance from the user: ${userPrompt}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const res = await fetch(
      `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [
            {
              role: 'user',
              parts: [{ text: `Write a ${type} meditation script.` }],
            },
          ],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 2048,
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini script generation failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini returned empty script');
    }

    return text.trim();
  }
}

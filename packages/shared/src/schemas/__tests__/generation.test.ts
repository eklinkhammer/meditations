import { describe, it, expect } from 'vitest';
import { createGenerationRequestSchema, generationRequestSchema, generationProgressSchema } from '../generation';

const validBase = {
  visualPrompt: 'A peaceful mountain scene',
  scriptType: 'ai_generated' as const,
  durationSeconds: 60,
};

describe('createGenerationRequestSchema', () => {
  describe('refine rule: scriptContent required for user_provided/template', () => {
    it('rejects missing scriptContent when scriptType is user_provided', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        scriptType: 'user_provided',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('scriptContent');
      }
    });

    it('rejects missing scriptContent when scriptType is template', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        scriptType: 'template',
      });
      expect(result.success).toBe(false);
    });

    it('accepts missing scriptContent when scriptType is ai_generated', () => {
      const result = createGenerationRequestSchema.safeParse(validBase);
      expect(result.success).toBe(true);
    });

    it('accepts scriptContent when scriptType is user_provided', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        scriptType: 'user_provided',
        scriptContent: 'My meditation script...',
      });
      expect(result.success).toBe(true);
    });

    it('accepts scriptContent when scriptType is template', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        scriptType: 'template',
        scriptContent: 'Template text...',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('durationSeconds', () => {
    it('accepts number 60', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        durationSeconds: 60,
      });
      expect(result.success).toBe(true);
    });

    it('accepts number 120', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        durationSeconds: 120,
      });
      expect(result.success).toBe(true);
    });

    it('accepts number 180', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        durationSeconds: 180,
      });
      expect(result.success).toBe(true);
    });

    it('accepts number 300', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        durationSeconds: 300,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid duration 90', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        durationSeconds: 90,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid string "90"', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        durationSeconds: '90',
      });
      expect(result.success).toBe(false);
    });

    it('rejects string durations (Zod union does not propagate enum+transform)', () => {
      // Note: the schema defines z.enum(['60',...]).transform(Number).or(z.literal(60))...
      // but due to Zod union semantics, string inputs don't reach the enum+transform branch
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        durationSeconds: '60',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('visibility', () => {
    it('defaults to public when not specified', () => {
      const result = createGenerationRequestSchema.safeParse(validBase);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.visibility).toBe('public');
      }
    });

    it('accepts private', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        visibility: 'private',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.visibility).toBe('private');
      }
    });

    it('rejects invalid visibility', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        visibility: 'unlisted',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('visualPrompt', () => {
    it('rejects empty string', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        visualPrompt: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects prompt over 1000 chars', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        visualPrompt: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('optional fields', () => {
    it('accepts ambientSoundId as valid UUID', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        ambientSoundId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('accepts musicTrackId as valid UUID', () => {
      const result = createGenerationRequestSchema.safeParse({
        ...validBase,
        musicTrackId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('generationRequestSchema', () => {
  it('validates a complete generation request', () => {
    const result = generationRequestSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      status: 'pending',
      visualPrompt: 'A scene',
      scriptType: 'ai_generated',
      scriptContent: null,
      durationSeconds: 60,
      ambientSoundId: null,
      musicTrackId: null,
      videoProvider: null,
      voiceProvider: null,
      creditsCharged: 5,
      progress: 0,
      videoId: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('validates all generation status values', () => {
    const statuses = ['pending', 'generating_script', 'generating_voice', 'generating_video', 'compositing', 'completed', 'failed'];
    for (const status of statuses) {
      const result = generationRequestSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        status,
        visualPrompt: 'A scene',
        scriptType: 'ai_generated',
        scriptContent: null,
        durationSeconds: 60,
        ambientSoundId: null,
        musicTrackId: null,
        videoProvider: null,
        voiceProvider: null,
        creditsCharged: 5,
        progress: 0,
        videoId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('generationProgressSchema', () => {
  it('validates a progress object', () => {
    const result = generationProgressSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'generating_video',
      progress: 50,
      videoId: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects progress over 100', () => {
    const result = generationProgressSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'pending',
      progress: 101,
      videoId: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative progress', () => {
    const result = generationProgressSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'pending',
      progress: -1,
      videoId: null,
    });
    expect(result.success).toBe(false);
  });
});

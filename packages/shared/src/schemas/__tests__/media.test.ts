import { describe, it, expect } from 'vitest';
import { ambientSoundSchema, musicTrackSchema, scriptTemplateSchema } from '../media';

describe('ambientSoundSchema', () => {
  it('validates a valid ambient sound', () => {
    const result = ambientSoundSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Rain',
      storageKey: 'sounds/rain.mp3',
      category: 'nature',
      isLoopable: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = ambientSoundSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      storageKey: 'sounds/rain.mp3',
      category: 'nature',
      isLoopable: true,
    });
    expect(result.success).toBe(false);
  });

  it('requires isLoopable to be boolean', () => {
    const result = ambientSoundSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Rain',
      storageKey: 'sounds/rain.mp3',
      category: 'nature',
      isLoopable: 'yes',
    });
    expect(result.success).toBe(false);
  });
});

describe('musicTrackSchema', () => {
  it('validates a valid music track', () => {
    const result = musicTrackSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Calm Piano',
      storageKey: 'music/calm-piano.mp3',
      mood: 'relaxing',
      licenseType: 'royalty-free',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing mood', () => {
    const result = musicTrackSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Calm Piano',
      storageKey: 'music/calm-piano.mp3',
      licenseType: 'royalty-free',
    });
    expect(result.success).toBe(false);
  });
});

describe('scriptTemplateSchema', () => {
  it('validates a valid script template', () => {
    const result = scriptTemplateSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Morning Meditation',
      category: 'mindfulness',
      scriptText: 'Take a deep breath...',
      durationHint: 60,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-integer durationHint', () => {
    const result = scriptTemplateSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Morning Meditation',
      category: 'mindfulness',
      scriptText: 'Take a deep breath...',
      durationHint: 60.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing scriptText', () => {
    const result = scriptTemplateSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Morning Meditation',
      category: 'mindfulness',
      durationHint: 60,
    });
    expect(result.success).toBe(false);
  });
});

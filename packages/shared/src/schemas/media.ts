import { z } from 'zod';

export const ambientSoundSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  storageKey: z.string(),
  category: z.string(),
  isLoopable: z.boolean(),
});

export const musicTrackSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  storageKey: z.string(),
  mood: z.string(),
  licenseType: z.string(),
});

export const scriptTemplateSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  category: z.string(),
  scriptText: z.string(),
  durationHint: z.number().int(),
});

export type AmbientSound = z.infer<typeof ambientSoundSchema>;
export type MusicTrack = z.infer<typeof musicTrackSchema>;
export type ScriptTemplate = z.infer<typeof scriptTemplateSchema>;

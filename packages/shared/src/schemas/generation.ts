import { z } from 'zod';
import {
  SCRIPT_TYPE,
  GENERATION_STATUS,
  VIDEO_VISIBILITY,
} from '../constants';

const scriptTypeValues = [
  SCRIPT_TYPE.AI_GENERATED,
  SCRIPT_TYPE.USER_PROVIDED,
  SCRIPT_TYPE.TEMPLATE,
] as const;

const generationStatusValues = [
  GENERATION_STATUS.PENDING,
  GENERATION_STATUS.GENERATING_SCRIPT,
  GENERATION_STATUS.GENERATING_VOICE,
  GENERATION_STATUS.GENERATING_VIDEO,
  GENERATION_STATUS.COMPOSITING,
  GENERATION_STATUS.COMPLETED,
  GENERATION_STATUS.FAILED,
] as const;

export const createGenerationRequestSchema = z
  .object({
    visualPrompt: z.string().min(1).max(1000),
    scriptType: z.enum(scriptTypeValues),
    scriptContent: z.string().optional(),
    durationSeconds: z.enum(['60', '120', '180', '300']).transform(Number).or(z.literal(60)).or(z.literal(120)).or(z.literal(180)).or(z.literal(300)),
    ambientSoundId: z.string().uuid().optional(),
    musicTrackId: z.string().uuid().optional(),
    visibility: z
      .enum([VIDEO_VISIBILITY.PUBLIC, VIDEO_VISIBILITY.PRIVATE])
      .default(VIDEO_VISIBILITY.PUBLIC),
  })
  .refine(
    (data) => {
      if (
        data.scriptType === SCRIPT_TYPE.USER_PROVIDED ||
        data.scriptType === SCRIPT_TYPE.TEMPLATE
      ) {
        return !!data.scriptContent;
      }
      return true;
    },
    {
      message:
        'scriptContent is required when scriptType is user_provided or template',
      path: ['scriptContent'],
    },
  );

export const generationRequestSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  status: z.enum(generationStatusValues),
  visualPrompt: z.string(),
  scriptType: z.enum(scriptTypeValues),
  scriptContent: z.string().nullable(),
  durationSeconds: z.number().int(),
  ambientSoundId: z.string().uuid().nullable(),
  musicTrackId: z.string().uuid().nullable(),
  videoProvider: z.string().nullable(),
  voiceProvider: z.string().nullable(),
  creditsCharged: z.number().int(),
  progress: z.number().int().min(0).max(100),
  videoId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const generationProgressSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(generationStatusValues),
  progress: z.number().int().min(0).max(100),
  videoId: z.string().uuid().nullable(),
});

export type CreateGenerationRequest = z.infer<typeof createGenerationRequestSchema>;
export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type GenerationProgress = z.infer<typeof generationProgressSchema>;

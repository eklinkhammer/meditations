import { z } from 'zod';
import { VIDEO_VISIBILITY, MODERATION_STATUS } from '../constants';

const videoVisibilityValues = [
  VIDEO_VISIBILITY.PUBLIC,
  VIDEO_VISIBILITY.PRIVATE,
  VIDEO_VISIBILITY.PENDING_REVIEW,
  VIDEO_VISIBILITY.REJECTED,
] as const;

const moderationStatusValues = [
  MODERATION_STATUS.PENDING,
  MODERATION_STATUS.APPROVED,
  MODERATION_STATUS.REJECTED,
] as const;

export const videoSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().min(1).max(200),
  storageKey: z.string(),
  thumbnailKey: z.string().optional(),
  durationSeconds: z.number().int().positive(),
  visibility: z.enum(videoVisibilityValues),
  moderationStatus: z.enum(moderationStatusValues),
  visualPrompt: z.string(),
  tags: z.array(z.string()),
  viewCount: z.number().int().min(0),
  likeCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const videoListItemSchema = videoSchema
  .pick({
    id: true,
    title: true,
    thumbnailKey: true,
    durationSeconds: true,
    visibility: true,
    viewCount: true,
    likeCount: true,
    createdAt: true,
  })
  .extend({
    user: z.object({
      id: z.string().uuid(),
      displayName: z.string(),
    }),
  });

export const videoFilterSchema = z.object({
  search: z.string().optional(),
  visibility: z.enum(videoVisibilityValues).optional(),
  tags: z.array(z.string()).optional(),
  sortBy: z.enum(['recent', 'popular', 'duration']).optional(),
  page: z.number().int().min(1).default(1).optional(),
  limit: z.number().int().min(1).max(50).default(20).optional(),
});

export type Video = z.infer<typeof videoSchema>;
export type VideoListItem = z.infer<typeof videoListItemSchema>;
export type VideoFilter = z.infer<typeof videoFilterSchema>;

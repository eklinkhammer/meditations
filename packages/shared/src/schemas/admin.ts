import { z } from 'zod';

export const pricingConfigSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  value: z.any(),
  updatedAt: z.string().datetime(),
});

export const updatePricingConfigSchema = z.object({
  key: z.string(),
  value: z.any(),
});

export const moderationActionSchema = z.object({
  videoId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
});

export type PricingConfig = z.infer<typeof pricingConfigSchema>;
export type UpdatePricingConfig = z.infer<typeof updatePricingConfigSchema>;
export type ModerationAction = z.infer<typeof moderationActionSchema>;

import { z } from 'zod';
import { USER_ROLES } from '../constants';

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  role: z.enum([USER_ROLES.USER, USER_ROLES.ADMIN]),
  authProvider: z.string(),
  creditsBalance: z.number().int().min(0),
  isPremium: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const updateUserSchema = userSchema.pick({ displayName: true }).partial();

export const userProfileSchema = userSchema.omit({ authProvider: true });

export type User = z.infer<typeof userSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;

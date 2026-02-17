import { describe, it, expect } from 'vitest';
import { userSchema, updateUserSchema, userProfileSchema } from '../user';

const validUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'user' as const,
  authProvider: 'google',
  creditsBalance: 100,
  isPremium: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('userSchema', () => {
  it('accepts a valid user', () => {
    const result = userSchema.safeParse(validUser);
    expect(result.success).toBe(true);
  });

  it('accepts admin role', () => {
    const result = userSchema.safeParse({ ...validUser, role: 'admin' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = userSchema.safeParse({ ...validUser, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects negative creditsBalance', () => {
    const result = userSchema.safeParse({ ...validUser, creditsBalance: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = userSchema.safeParse({ ...validUser, role: 'superadmin' });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer creditsBalance', () => {
    const result = userSchema.safeParse({ ...validUser, creditsBalance: 10.5 });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = userSchema.safeParse({ id: validUser.id });
    expect(result.success).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('accepts displayName', () => {
    const result = updateUserSchema.safeParse({ displayName: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (all fields optional)', () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('userProfileSchema', () => {
  it('validates a profile without authProvider', () => {
    const { authProvider: _, ...profile } = validUser;
    const result = userProfileSchema.safeParse(profile);
    expect(result.success).toBe(true);
  });
});

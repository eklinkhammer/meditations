import { describe, it, expect } from 'vitest';
import { moderationActionSchema, pricingConfigSchema, updatePricingConfigSchema } from '../admin';

describe('moderationActionSchema', () => {
  it('accepts approve action', () => {
    const result = moderationActionSchema.safeParse({
      videoId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'approve',
    });
    expect(result.success).toBe(true);
  });

  it('accepts reject action', () => {
    const result = moderationActionSchema.safeParse({
      videoId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'reject',
    });
    expect(result.success).toBe(true);
  });

  it('accepts reject action with reason', () => {
    const result = moderationActionSchema.safeParse({
      videoId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'reject',
      reason: 'Inappropriate content',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid action', () => {
    const result = moderationActionSchema.safeParse({
      videoId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'ban',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid videoId (not UUID)', () => {
    const result = moderationActionSchema.safeParse({
      videoId: 'not-a-uuid',
      action: 'approve',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing videoId', () => {
    const result = moderationActionSchema.safeParse({
      action: 'approve',
    });
    expect(result.success).toBe(false);
  });
});

describe('pricingConfigSchema', () => {
  it('validates a pricing config', () => {
    const result = pricingConfigSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      key: 'base_price',
      value: { amount: 4.99 },
      updatedAt: '2024-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('updatePricingConfigSchema', () => {
  it('validates an update', () => {
    const result = updatePricingConfigSchema.safeParse({
      key: 'base_price',
      value: { amount: 5.99 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing key', () => {
    const result = updatePricingConfigSchema.safeParse({
      value: { amount: 5.99 },
    });
    expect(result.success).toBe(false);
  });
});

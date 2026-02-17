import { describe, it, expect } from 'vitest';
import { purchaseCreditsSchema, creditTransactionSchema, creditBalanceSchema } from '../credits';

describe('purchaseCreditsSchema', () => {
  it('accepts packIndex 0', () => {
    const result = purchaseCreditsSchema.safeParse({ packIndex: 0, paymentMethodId: 'pm_123' });
    expect(result.success).toBe(true);
  });

  it('accepts packIndex 1', () => {
    const result = purchaseCreditsSchema.safeParse({ packIndex: 1, paymentMethodId: 'pm_123' });
    expect(result.success).toBe(true);
  });

  it('accepts packIndex 2', () => {
    const result = purchaseCreditsSchema.safeParse({ packIndex: 2, paymentMethodId: 'pm_123' });
    expect(result.success).toBe(true);
  });

  it('accepts packIndex 3', () => {
    const result = purchaseCreditsSchema.safeParse({ packIndex: 3, paymentMethodId: 'pm_123' });
    expect(result.success).toBe(true);
  });

  it('rejects packIndex 4', () => {
    const result = purchaseCreditsSchema.safeParse({ packIndex: 4, paymentMethodId: 'pm_123' });
    expect(result.success).toBe(false);
  });

  it('rejects packIndex -1', () => {
    const result = purchaseCreditsSchema.safeParse({ packIndex: -1, paymentMethodId: 'pm_123' });
    expect(result.success).toBe(false);
  });

  it('rejects packIndex 1.5 (non-integer)', () => {
    const result = purchaseCreditsSchema.safeParse({ packIndex: 1.5, paymentMethodId: 'pm_123' });
    expect(result.success).toBe(false);
  });

  it('requires paymentMethodId', () => {
    const result = purchaseCreditsSchema.safeParse({ packIndex: 0 });
    expect(result.success).toBe(false);
  });
});

describe('creditTransactionSchema', () => {
  it('validates a valid transaction', () => {
    const result = creditTransactionSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      amount: 10,
      type: 'purchase',
      stripePaymentId: null,
      iapReceiptId: null,
      description: null,
      createdAt: '2024-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all transaction types', () => {
    const types = ['purchase', 'generation_spend', 'private_surcharge', 'refund'];
    for (const type of types) {
      const result = creditTransactionSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        amount: 10,
        type,
        stripePaymentId: null,
        iapReceiptId: null,
        description: null,
        createdAt: '2024-01-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid transaction type', () => {
    const result = creditTransactionSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: '550e8400-e29b-41d4-a716-446655440001',
      amount: 10,
      type: 'invalid_type',
      stripePaymentId: null,
      iapReceiptId: null,
      description: null,
      createdAt: '2024-01-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('creditBalanceSchema', () => {
  it('validates a valid balance with transactions', () => {
    const result = creditBalanceSchema.safeParse({
      balance: 100,
      transactions: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          userId: '550e8400-e29b-41d4-a716-446655440001',
          amount: 10,
          type: 'purchase',
          stripePaymentId: null,
          iapReceiptId: null,
          description: null,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative balance', () => {
    const result = creditBalanceSchema.safeParse({
      balance: -1,
      transactions: [],
    });
    expect(result.success).toBe(false);
  });
});

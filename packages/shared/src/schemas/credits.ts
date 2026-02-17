import { z } from 'zod';
import { CREDIT_TRANSACTION_TYPE } from '../constants';

const creditTransactionTypeValues = [
  CREDIT_TRANSACTION_TYPE.PURCHASE,
  CREDIT_TRANSACTION_TYPE.GENERATION_SPEND,
  CREDIT_TRANSACTION_TYPE.PRIVATE_SURCHARGE,
  CREDIT_TRANSACTION_TYPE.REFUND,
] as const;

export const creditTransactionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  amount: z.number().int(),
  type: z.enum(creditTransactionTypeValues),
  stripePaymentId: z.string().nullable(),
  iapReceiptId: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const purchaseCreditsSchema = z.object({
  packIndex: z.number().int().min(0).max(3),
  paymentMethodId: z.string(),
});

export const creditBalanceSchema = z.object({
  balance: z.number().int().min(0),
  transactions: z.array(creditTransactionSchema),
});

export type CreditTransaction = z.infer<typeof creditTransactionSchema>;
export type PurchaseCredits = z.infer<typeof purchaseCreditsSchema>;
export type CreditBalance = z.infer<typeof creditBalanceSchema>;

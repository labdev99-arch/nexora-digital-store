import {z} from 'zod';

export const initiateTopupSchema = z.object({
  methodCode: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  returnUrl: z.string().url(),
  savedPaymentMethodId: z.string().max(255).optional(),
  crypto: z
    .object({
      asset: z.enum(['USDT', 'BTC', 'ETH']),
      network: z.enum(['TRC20', 'ERC20', 'BEP20', 'BITCOIN'])
    })
    .optional()
});

export const reviewProofSchema = z.object({
  queueId: z.string().uuid(),
  approve: z.boolean(),
  reason: z.string().trim().min(3).max(500)
});

export const paymentMethodConfigSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
  sandboxMode: z.boolean(),
  minAmount: z.number().int().positive(),
  maxAmount: z.number().int().positive(),
  feeFixed: z.number().int().nonnegative(),
  feeBps: z.number().int().min(0).max(10_000),
  allowedCurrencies: z.array(z.string().regex(/^[A-Z]{3}$/)).min(1),
  allowedCountries: z.array(z.string().regex(/^[A-Z]{2}$/)),
  allowedTiers: z.array(z.string().min(1)).min(1),
  instructions: z.record(z.string(), z.array(z.string().min(1)))
});

export const idempotencyKeySchema = z.string().trim().min(8).max(160);

export const refundPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  reason: z.string().trim().min(8).max(500),
  idempotencyKey: idempotencyKeySchema
});

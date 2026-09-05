import {z} from 'zod';

export const affiliateApplicationSchema = z.object({
  message: z.string().trim().max(1000).optional()
});

export const affiliateLinkSchema = z.object({
  name: z.string().trim().min(1).max(120),
  destinationPath: z
    .string()
    .trim()
    .regex(/^\/(?!\/)/)
    .max(500),
  campaign: z.string().trim().max(80).optional()
});

export const affiliatePayoutSchema = z.object({
  amount: z.coerce.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  destinationKind: z.enum(['wallet', 'external']),
  destinationDetails: z.string().trim().max(1000).optional()
});

export const loyaltyRedemptionSchema = z.object({
  kind: z.enum(['wallet_credit', 'discount']),
  idempotencyKey: z.string().uuid()
});

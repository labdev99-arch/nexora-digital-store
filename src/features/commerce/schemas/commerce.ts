import {z} from 'zod';

export const cartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(1_000_000),
  optionValues: z.record(z.string(), z.unknown()).default({})
});

export const cartItemUpdateSchema = z.object({
  quantity: z.number().int().min(1).max(1_000_000),
  optionValues: z.record(z.string(), z.unknown()).optional()
});

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{2,39}$/);

export const checkoutSchema = z.object({
  paymentMethod: z.string().min(1).max(50),
  email: z.string().email().optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  notes: z.string().trim().max(2000).optional(),
  termsAccepted: z.literal(true),
  idempotencyKey: z.string().min(8).max(160),
  returnUrl: z.string().url(),
  crypto: z
    .object({
      asset: z.enum(['USDT', 'BTC', 'ETH']),
      network: z.enum(['TRC20', 'ERC20', 'BEP20', 'BITCOIN'])
    })
    .optional()
});

export const orderMessageSchema = z.object({body: z.string().trim().min(1).max(5000)});
export const refundRequestSchema = z.object({reason: z.string().trim().min(3).max(2000)});

import {z} from 'zod';

export const resellerApiScopes = [
  'catalog:read',
  'orders:write',
  'orders:read',
  'balance:read',
  'webhooks:manage',
  'smm:compat'
] as const;
export const resellerWebhookEvents = [
  'order.updated',
  'order.delivered',
  'order.failed',
  'balance.low'
] as const;

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  environment: z.enum(['sandbox', 'live']).default('sandbox'),
  scopes: z.array(z.enum(resellerApiScopes)).min(1).max(20),
  rateLimitPerMinute: z.number().int().min(1).max(10_000).default(60),
  ipAllowlist: z
    .array(z.union([z.ipv4(), z.ipv6()]))
    .max(50)
    .default([]),
  expiresAt: z.iso.datetime().nullable().optional()
});

export const resellerOrderSchema = z.object({
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  localeCode: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
    .default('en'),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .default('LB'),
  items: z
    .array(
      z.object({
        variantId: z.uuid(),
        quantity: z.number().int().min(1).max(1_000_000),
        optionValues: z.record(z.string(), z.unknown()).default({})
      })
    )
    .min(1)
    .max(100)
});

export const webhookEndpointSchema = z.object({
  url: z.url().refine((value) => value.startsWith('https://'), 'HTTPS is required'),
  description: z.string().trim().max(200).nullable().optional(),
  events: z.array(z.enum(resellerWebhookEvents)).min(1).max(10)
});

export type ResellerOrderInput = z.infer<typeof resellerOrderSchema>;
export type ResellerApiScope = (typeof resellerApiScopes)[number];

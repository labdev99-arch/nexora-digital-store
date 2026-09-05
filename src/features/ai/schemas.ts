import {z} from 'zod';

export const assistantRequestSchema = z.object({
  locale: z.enum(['ar', 'en']),
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(4000)
});

export const assistantEscalationSchema = z.object({
  locale: z.enum(['ar', 'en']),
  conversationId: z.uuid()
});

export const recommendationQuerySchema = z.object({
  locale: z.enum(['ar', 'en']).default('en'),
  source: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(12).default(6)
});

export const insightQuerySchema = z.object({
  locale: z.enum(['ar', 'en']),
  question: z.string().trim().min(3).max(1000)
});

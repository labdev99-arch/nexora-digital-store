import {z} from 'zod';
export const createTicketSchema = z.object({
  categoryCode: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
  subject: z.string().trim().min(4).max(160),
  description: z.string().trim().min(10).max(10000),
  orderId: z.string().uuid().nullable().optional(),
  locale: z.enum(['en', 'ar'])
});
export const ticketMessageSchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1).max(10000),
  internal: z.boolean().default(false),
  locale: z.enum(['en', 'ar'])
});
export const ticketRatingSchema = z.object({
  ticketId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
  locale: z.enum(['en', 'ar'])
});

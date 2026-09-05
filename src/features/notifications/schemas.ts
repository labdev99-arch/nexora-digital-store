import {z} from 'zod';
import {notificationEvents} from './types';

export const matrixSchema = z.object({
  eventKey: z.enum(notificationEvents),
  channel: z.enum(['email', 'whatsapp', 'telegram', 'push', 'in_app', 'sms']),
  enabled: z.boolean(),
  locale: z.enum(['en', 'ar'])
});
export const quietHoursSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).max(80),
  locale: z.enum(['en', 'ar'])
});
export const whatsappStartSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  locale: z.enum(['en', 'ar'])
});
export const whatsappVerifySchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  code: z.string().regex(/^\d{6}$/),
  locale: z.enum(['en', 'ar'])
});
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({p256dh: z.string().min(20), auth: z.string().min(8)}),
  locale: z.enum(['en', 'ar'])
});

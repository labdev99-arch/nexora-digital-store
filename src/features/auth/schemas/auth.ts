import {z} from 'zod';

const email = z.string().trim().email().max(254);
const password = z.string().min(12).max(128);
const locale = z.enum(['ar', 'en']);
const protectedRequest = {turnstileToken: z.string().max(2048).optional()};

export const signUpSchema = z
  .object({
    email,
    password,
    confirmPassword: z.string(),
    displayName: z.string().trim().min(2).max(80),
    locale,
    marketingConsent: z.boolean().default(false),
    ...protectedRequest
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'password_mismatch'
  });

export const signInSchema = z.object({
  email,
  password: z.string().min(1).max(128),
  locale,
  ...protectedRequest
});
export const emailSchema = z.object({email, locale, ...protectedRequest});
export const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/),
  locale,
  ...protectedRequest
});
export const otpSchema = phoneSchema.extend({token: z.string().regex(/^\d{6}$/)});
export const resetPasswordSchema = z
  .object({password, confirmPassword: z.string(), locale})
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'password_mismatch'
  });
export const mfaCodeSchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
  locale
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  phone: z.union([
    z.literal(''),
    z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/)
  ]),
  countryCode: z.union([
    z.literal(''),
    z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/)
  ]),
  timezone: z.string().trim().min(1).max(80),
  marketingConsent: z.boolean(),
  locale
});

export const preferencesSchema = z.object({
  localeCode: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().trim().min(1).max(80),
  locale
});

export const notificationPreferenceSchema = z.object({
  channel: z.enum(['email', 'whatsapp', 'telegram', 'push', 'in_app']),
  transactional: z.boolean(),
  orderUpdates: z.boolean(),
  promotions: z.boolean(),
  locale
});

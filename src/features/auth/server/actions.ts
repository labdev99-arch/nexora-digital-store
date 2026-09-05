'use server';

import {headers} from 'next/headers';
import {redirect} from 'next/navigation';

import {createClient} from '@/lib/supabase/server';
import {verifyTurnstile} from '@/lib/security/turnstile';
import {clientAddress, enforceRateLimit} from '@/lib/security/rate-limit';
import {
  emailSchema,
  mfaCodeSchema,
  notificationPreferenceSchema,
  otpSchema,
  phoneSchema,
  preferencesSchema,
  profileSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema
} from '../schemas/auth';
import {requirePermission, requireUser} from './authorization';

export type ActionResult<T = undefined> =
  | {ok: true; data?: T; next?: 'verify_email' | 'mfa' | 'account'}
  | {ok: false; error: string; fields?: Record<string, string>};

function validationError(error: {
  issues: Array<{path: PropertyKey[]; message: string}>;
}): ActionResult {
  return {
    ok: false,
    error: 'invalid_input',
    fields: Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message]))
  };
}

function publicAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login')) return 'invalid_credentials';
  if (normalized.includes('already registered')) return 'account_exists';
  if (normalized.includes('email not confirmed')) return 'email_unverified';
  if (normalized.includes('expired')) return 'code_expired';
  if (normalized.includes('rate')) return 'rate_limited';
  return 'auth_failed';
}

function appUrl(locale: string, path: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${origin}/${locale}${path}`;
}

async function protectAuthRequest(scope: string, turnstileToken?: string): Promise<string | null> {
  const requestHeaders = await headers();
  const syntheticRequest = new Request(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000', {
    headers: requestHeaders
  });
  const rate = await enforceRateLimit(
    `auth-action:${scope}:${clientAddress(syntheticRequest)}`,
    8,
    60
  );
  if (!rate.allowed) return 'rate_limited';
  const challenge = await verifyTurnstile(turnstileToken);
  return challenge.success ? null : challenge.error;
}

async function recordCurrentSession(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get('user-agent') ?? '';
  const deviceName = userAgent.includes('Mobile') ? 'mobile' : 'desktop';
  await supabase.rpc('touch_user_session', {
    p_device_name: deviceName,
    p_user_agent: userAgent
  });
}

export async function signUpAction(input: unknown): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const protectionError = await protectAuthRequest('signup', parsed.data.turnstileToken);
  if (protectionError) return {ok: false, error: protectionError};
  const supabase = await createClient();
  const {error} = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: appUrl(parsed.data.locale, '/auth/callback'),
      data: {
        display_name: parsed.data.displayName,
        locale: parsed.data.locale,
        marketing_consent: parsed.data.marketingConsent,
        timezone: 'UTC',
        currency: 'USD'
      }
    }
  });
  if (error) return {ok: false, error: publicAuthError(error.message)};
  return {ok: true, next: 'verify_email'};
}

export async function signInAction(input: unknown): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const protectionError = await protectAuthRequest('signin', parsed.data.turnstileToken);
  if (protectionError) return {ok: false, error: protectionError};
  const supabase = await createClient();
  const {error} = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password
  });
  if (error) return {ok: false, error: publicAuthError(error.message)};
  await recordCurrentSession(supabase);
  const {data: assurance} = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
    return {ok: true, next: 'mfa'};
  }
  return {ok: true, next: 'account'};
}

export async function sendMagicLinkAction(input: unknown): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const protectionError = await protectAuthRequest('magic-link', parsed.data.turnstileToken);
  if (protectionError) return {ok: false, error: protectionError};
  const supabase = await createClient();
  const {error} = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: appUrl(parsed.data.locale, '/auth/callback'),
      shouldCreateUser: false
    }
  });
  if (error) return {ok: false, error: publicAuthError(error.message)};
  return {ok: true, next: 'verify_email'};
}

export async function resendVerificationAction(input: unknown): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  const {error} = await supabase.auth.resend({
    type: 'signup',
    email: parsed.data.email,
    options: {emailRedirectTo: appUrl(parsed.data.locale, '/auth/callback')}
  });
  if (error) return {ok: false, error: publicAuthError(error.message)};
  return {ok: true, next: 'verify_email'};
}

export async function sendPhoneOtpAction(input: unknown): Promise<ActionResult> {
  const parsed = phoneSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  const {error} = await supabase.auth.signInWithOtp({phone: parsed.data.phone});
  if (error) return {ok: false, error: publicAuthError(error.message)};
  return {ok: true};
}

export async function verifyPhoneOtpAction(input: unknown): Promise<ActionResult> {
  const parsed = otpSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  const {error} = await supabase.auth.verifyOtp({
    phone: parsed.data.phone,
    token: parsed.data.token,
    type: 'sms'
  });
  if (error) return {ok: false, error: publicAuthError(error.message)};
  await recordCurrentSession(supabase);
  return {ok: true, next: 'account'};
}

export async function requestPasswordResetAction(input: unknown): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const protectionError = await protectAuthRequest('password-reset', parsed.data.turnstileToken);
  if (protectionError) return {ok: false, error: protectionError};
  const supabase = await createClient();
  const {error} = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: appUrl(parsed.data.locale, '/auth/callback?next=/auth/reset-password')
  });
  if (error) return {ok: false, error: publicAuthError(error.message)};
  return {ok: true, next: 'verify_email'};
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  const {error} = await supabase.auth.updateUser({password: parsed.data.password});
  if (error) return {ok: false, error: publicAuthError(error.message)};
  return {ok: true, next: 'account'};
}

export async function startOAuthAction(
  provider: 'google' | 'apple',
  locale: string
): Promise<never> {
  const parsedLocale = locale === 'ar' ? 'ar' : 'en';
  const supabase = await createClient();
  const {data, error} = await supabase.auth.signInWithOAuth({
    provider,
    options: {redirectTo: appUrl(parsedLocale, '/auth/callback'), skipBrowserRedirect: true}
  });
  if (error || !data.url) redirect(`/${parsedLocale}/auth/sign-in?error=oauth_failed`);
  redirect(data.url);
}

export async function enrollTotpAction(
  locale: string
): Promise<ActionResult<{factorId: string; qrCode: string; secret: string}>> {
  await requirePermission(locale, 'account.update');
  const supabase = await createClient();
  const {data, error} = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Nexora'
  });
  if (error) return {ok: false, error: publicAuthError(error.message)};
  return {
    ok: true,
    data: {factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret}
  };
}

export async function verifyTotpAction(input: unknown): Promise<ActionResult> {
  const parsed = mfaCodeSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  await requireUser(parsed.data.locale);
  const supabase = await createClient();
  const {error} = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code
  });
  if (error) return {ok: false, error: publicAuthError(error.message)};
  return {ok: true, next: 'account'};
}

export async function removeTotpAction(factorId: string, locale: string): Promise<ActionResult> {
  await requirePermission(locale, 'account.update');
  const supabase = await createClient();
  const {error} = await supabase.auth.mfa.unenroll({factorId});
  if (error) return {ok: false, error: publicAuthError(error.message)};
  return {ok: true};
}

export async function signOutAction(locale: string, everywhere = false): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut({scope: everywhere ? 'global' : 'local'});
  redirect(`/${locale}/auth/sign-in`);
}

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const context = await requirePermission(parsed.data.locale, 'account.update');
  const supabase = await createClient();
  const {error} = await supabase
    .from('profiles')
    .update({
      display_name: parsed.data.displayName,
      phone: parsed.data.phone || null,
      country_code: parsed.data.countryCode || null,
      timezone: parsed.data.timezone,
      marketing_consent: parsed.data.marketingConsent,
      marketing_consent_at: parsed.data.marketingConsent ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', context.user.id);
  if (error) return {ok: false, error: 'save_failed'};
  return {ok: true};
}

export async function uploadAvatarAction(
  formData: FormData,
  locale: string
): Promise<ActionResult> {
  const context = await requirePermission(locale, 'account.update');
  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0 || file.size > 5_242_880) {
    return {ok: false, error: 'invalid_avatar'};
  }
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };
  const extension = extensions[file.type];
  if (!extension) return {ok: false, error: 'invalid_avatar'};
  const supabase = await createClient();
  const {data: profile} = await supabase
    .from('profiles')
    .select('avatar_path')
    .eq('id', context.user.id)
    .maybeSingle();
  const path = `${context.user.id}/${crypto.randomUUID()}.${extension}`;
  const {error: uploadError} = await supabase.storage
    .from('avatars')
    .upload(path, file, {contentType: file.type, upsert: false});
  if (uploadError) return {ok: false, error: 'avatar_upload_failed'};
  const {error: updateError} = await supabase
    .from('profiles')
    .update({avatar_path: path, updated_at: new Date().toISOString()})
    .eq('id', context.user.id);
  if (updateError) {
    await supabase.storage.from('avatars').remove([path]);
    return {ok: false, error: 'save_failed'};
  }
  if (profile?.avatar_path) await supabase.storage.from('avatars').remove([profile.avatar_path]);
  return {ok: true};
}

export async function updatePreferencesAction(input: unknown): Promise<ActionResult> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const context = await requirePermission(parsed.data.locale, 'account.update');
  const supabase = await createClient();
  const {error} = await supabase
    .from('profiles')
    .update({
      locale_code: parsed.data.localeCode,
      currency_code: parsed.data.currencyCode,
      timezone: parsed.data.timezone,
      updated_at: new Date().toISOString()
    })
    .eq('id', context.user.id);
  if (error) return {ok: false, error: 'save_failed'};
  return {ok: true};
}

export async function updateNotificationPreferenceAction(input: unknown): Promise<ActionResult> {
  const parsed = notificationPreferenceSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const context = await requirePermission(parsed.data.locale, 'account.update');
  const supabase = await createClient();
  const {error} = await supabase.from('notification_preferences').upsert(
    {
      profile_id: context.user.id,
      channel: parsed.data.channel,
      transactional: parsed.data.transactional,
      order_updates: parsed.data.orderUpdates,
      security_alerts: true,
      promotions: parsed.data.promotions,
      updated_at: new Date().toISOString()
    },
    {onConflict: 'profile_id,channel'}
  );
  if (error) return {ok: false, error: 'save_failed'};
  return {ok: true};
}

export async function touchSessionAction(locale: string): Promise<ActionResult> {
  await requireUser(locale);
  const supabase = await createClient();
  await recordCurrentSession(supabase);
  return {ok: true};
}

export async function revokeSessionAction(
  sessionId: string,
  locale: string
): Promise<ActionResult> {
  await requirePermission(locale, 'account.update');
  const supabase = await createClient();
  const {error} = await supabase.rpc('revoke_user_session', {p_session_id: sessionId});
  if (error) return {ok: false, error: 'session_revoke_failed'};
  return {ok: true};
}

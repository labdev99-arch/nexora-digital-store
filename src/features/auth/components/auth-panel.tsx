'use client';

import {zodResolver} from '@hookform/resolvers/zod';
import {Apple, ArrowRight, KeyRound, Mail, Phone, ShieldCheck} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {useState, useTransition} from 'react';
import {useForm} from 'react-hook-form';
import {z} from 'zod';

import {Button} from '@/components/ui/button';
import {Checkbox, Input, OtpField} from '@/components/ui/form-controls';
import {Alert, Tabs, TabsList, TabsTrigger} from '@/components/ui/surfaces';
import {Link} from '@/i18n/navigation';
import {publicEnvironment} from '@/lib/env/public';
import {cn} from '@/lib/utils';
import {TurnstileChallenge} from './turnstile-challenge';
import {
  requestPasswordResetAction,
  resetPasswordAction,
  sendMagicLinkAction,
  sendPhoneOtpAction,
  signInAction,
  signUpAction,
  startOAuthAction,
  verifyPhoneOtpAction,
  verifyTotpAction,
  type ActionResult
} from '../server/actions';

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password' | 'mfa';
type Values = {
  displayName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  marketingConsent: boolean;
  token: string;
  turnstileToken: string;
};

const clientSchema = z.object({
  displayName: z.string(),
  email: z.string(),
  phone: z.string(),
  password: z.string(),
  confirmPassword: z.string(),
  marketingConsent: z.boolean(),
  token: z.string(),
  turnstileToken: z.string()
});

export function AuthPanel({mode, factorId}: {mode: AuthMode; factorId?: string}) {
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const t = useTranslations('Auth');
  const router = useRouter();
  const [method, setMethod] = useState<'password' | 'magic' | 'phone'>('password');
  const [phoneSent, setPhoneSent] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      displayName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      marketingConsent: false,
      token: '',
      turnstileToken: ''
    }
  });

  const run = (task: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const next = await task();
      setResult(next);
      if (!next.ok) return;
      if (next.next === 'mfa') router.push(`/${locale}/auth/mfa`);
      if (next.next === 'account') router.push(`/${locale}/account`);
    });

  const submit = form.handleSubmit((values) => {
    if (mode === 'sign-up') {
      startTransition(async () => {
        const next = await signUpAction({...values, locale});
        setResult(next);
        if (next.ok) {
          router.push(`/${locale}/auth/verify-email?email=${encodeURIComponent(values.email)}`);
        }
      });
      return;
    }
    if (mode === 'forgot-password') {
      run(() =>
        requestPasswordResetAction({
          email: values.email,
          locale,
          turnstileToken: values.turnstileToken
        })
      );
      return;
    }
    if (mode === 'reset-password') {
      run(() => resetPasswordAction({...values, locale}));
      return;
    }
    if (mode === 'mfa' && factorId) {
      run(() => verifyTotpAction({factorId, code: values.token, locale}));
      return;
    }
    if (method === 'magic') {
      run(() =>
        sendMagicLinkAction({email: values.email, locale, turnstileToken: values.turnstileToken})
      );
      return;
    }
    if (method === 'phone') {
      if (!phoneSent) {
        run(async () => {
          const next = await sendPhoneOtpAction({phone: values.phone, locale});
          if (next.ok) setPhoneSent(true);
          return next;
        });
      } else {
        run(() => verifyPhoneOtpAction({phone: values.phone, token: values.token, locale}));
      }
      return;
    }
    run(() =>
      signInAction({
        email: values.email,
        password: values.password,
        locale,
        turnstileToken: values.turnstileToken
      })
    );
  });

  const titleKey = mode === 'sign-in' ? 'signInTitle' : `${mode.replaceAll('-', '')}Title`;
  const descriptionKey =
    mode === 'sign-in' ? 'signInDescription' : `${mode.replaceAll('-', '')}Description`;

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-card-heading">
        <span className="auth-icon">
          <ShieldCheck aria-hidden="true" />
        </span>
        <div>
          <p>{t('eyebrow')}</p>
          <h1 id="auth-title">{t(titleKey)}</h1>
          <span>{t(descriptionKey)}</span>
        </div>
      </div>

      {mode === 'sign-in' ? (
        <Tabs value={method} onValueChange={(value) => setMethod(value as typeof method)}>
          <TabsList
            className={cn(
              'auth-methods',
              !publicEnvironment.NEXT_PUBLIC_PHONE_OTP_ENABLED && 'auth-methods--compact'
            )}
            aria-label={t('methodLabel')}
          >
            <TabsTrigger value="password">
              <KeyRound aria-hidden="true" />
              {t('password')}
            </TabsTrigger>
            <TabsTrigger value="magic">
              <Mail aria-hidden="true" />
              {t('magicLink')}
            </TabsTrigger>
            {publicEnvironment.NEXT_PUBLIC_PHONE_OTP_ENABLED ? (
              <TabsTrigger value="phone">
                <Phone aria-hidden="true" />
                {t('phoneOtp')}
              </TabsTrigger>
            ) : null}
          </TabsList>
        </Tabs>
      ) : null}

      {result ? (
        <Alert
          tone={result.ok ? 'success' : 'danger'}
          title={t(result.ok ? 'successTitle' : 'errorTitle')}
        >
          {t(result.ok ? `success.${result.next ?? 'default'}` : `errors.${result.error}`)}
        </Alert>
      ) : null}

      <form onSubmit={submit} className="auth-form" noValidate>
        {mode === 'sign-up' ? (
          <Input label={t('displayName')} autoComplete="name" {...form.register('displayName')} />
        ) : null}

        {(mode === 'sign-in' && method !== 'phone') ||
        mode === 'sign-up' ||
        mode === 'forgot-password' ? (
          <Input
            type="email"
            label={t('email')}
            placeholder={t('emailPlaceholder')}
            autoComplete="email"
            leadingIcon={<Mail aria-hidden="true" />}
            {...form.register('email')}
          />
        ) : null}

        {mode === 'sign-in' && method === 'phone' ? (
          <Input
            type="tel"
            label={t('phone')}
            placeholder={t('phonePlaceholder')}
            autoComplete="tel"
            dir="ltr"
            leadingIcon={<Phone aria-hidden="true" />}
            {...form.register('phone')}
          />
        ) : null}

        {(mode === 'sign-in' && method === 'password') ||
        mode === 'sign-up' ||
        mode === 'reset-password' ? (
          <Input
            type="password"
            label={t('password')}
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            helper={mode !== 'sign-in' ? t('passwordHint') : undefined}
            {...form.register('password')}
          />
        ) : null}

        {mode === 'sign-up' || mode === 'reset-password' ? (
          <Input
            type="password"
            label={t('confirmPassword')}
            autoComplete="new-password"
            {...form.register('confirmPassword')}
          />
        ) : null}

        {mode === 'mfa' || (mode === 'sign-in' && method === 'phone' && phoneSent) ? (
          <div className="auth-otp-field">
            <label>{t('verificationCode')}</label>
            <OtpField
              aria-label={t('verificationCode')}
              value={form.watch('token')}
              onChange={(value) => form.setValue('token', value)}
            />
          </div>
        ) : null}

        {mode === 'sign-up' ? (
          <Checkbox
            label={t('marketingConsent')}
            checked={form.watch('marketingConsent')}
            onCheckedChange={(checked) => form.setValue('marketingConsent', checked === true)}
          />
        ) : null}

        {mode === 'sign-in' && method === 'password' ? (
          <Link className="auth-forgot" href="/auth/forgot-password">
            {t('forgotPassword')}
          </Link>
        ) : null}

        {mode === 'sign-up' || mode === 'forgot-password' || mode === 'sign-in' ? (
          <TurnstileChallenge onToken={(token) => form.setValue('turnstileToken', token)} />
        ) : null}

        <Button
          type="submit"
          variant="gradient"
          size="lg"
          loading={pending}
          className="auth-primary"
        >
          {t(
            mode === 'sign-in'
              ? method === 'phone' && !phoneSent
                ? 'sendCode'
                : 'signInAction'
              : `${mode.replaceAll('-', '')}Action`
          )}
          <ArrowRight aria-hidden="true" className="rtl:-scale-x-100" />
        </Button>
      </form>

      {mode === 'sign-in' ? (
        <>
          <div className="auth-divider">
            <span>{t('orContinue')}</span>
          </div>
          <div
            className={cn(
              'auth-social',
              !publicEnvironment.NEXT_PUBLIC_APPLE_OAUTH_ENABLED && 'auth-social--single'
            )}
          >
            <form action={startOAuthAction.bind(null, 'google', locale)}>
              <Button type="submit" variant="outline">
                <span className="auth-google" aria-hidden="true">
                  G
                </span>
                {t('google')}
              </Button>
            </form>
            {publicEnvironment.NEXT_PUBLIC_APPLE_OAUTH_ENABLED ? (
              <form action={startOAuthAction.bind(null, 'apple', locale)}>
                <Button type="submit" variant="outline">
                  <Apple aria-hidden="true" />
                  {t('apple')}
                </Button>
              </form>
            ) : null}
          </div>
          <p className="auth-switch">
            {t('newHere')} <Link href="/auth/sign-up">{t('createAccount')}</Link>
          </p>
        </>
      ) : null}
      {mode === 'sign-up' ? (
        <p className="auth-switch">
          {t('alreadyMember')} <Link href="/auth/sign-in">{t('signInAction')}</Link>
        </p>
      ) : null}
    </section>
  );
}

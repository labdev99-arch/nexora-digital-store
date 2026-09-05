import {describe, expect, it} from 'vitest';

import {affiliateLinkSchema, affiliatePayoutSchema, loyaltyRedemptionSchema} from './schemas';
import {createReferralCookie, readReferralCookie} from './server/referral-cookie';

describe('Phase 9 growth controls', () => {
  it('signs referral cookies and rejects tampering', () => {
    process.env.REFERRAL_COOKIE_SECRET = 'phase-nine-test-secret-that-is-long-enough';
    const value = createReferralCookie('f2f30b92-14f2-43d4-8bb2-fb516a4f9dda', 90);
    expect(readReferralCookie(value)?.clickId).toBe('f2f30b92-14f2-43d4-8bb2-fb516a4f9dda');
    expect(readReferralCookie(`${value.slice(0, -1)}x`)).toBeNull();
  });

  it('accepts only local affiliate destinations', () => {
    expect(
      affiliateLinkSchema.safeParse({name: 'Launch', destinationPath: '/products', campaign: 'vip'})
        .success
    ).toBe(true);
    expect(
      affiliateLinkSchema.safeParse({name: 'Unsafe', destinationPath: '//attacker.invalid'}).success
    ).toBe(false);
    expect(
      affiliateLinkSchema.safeParse({name: 'Unsafe', destinationPath: 'https://attacker.invalid'})
        .success
    ).toBe(false);
  });

  it('validates payouts and idempotent redemption inputs in integer units', () => {
    expect(
      affiliatePayoutSchema.parse({
        amount: '2500',
        currency: 'USD',
        destinationKind: 'wallet'
      }).amount
    ).toBe(2500);
    expect(
      affiliatePayoutSchema.safeParse({amount: '2.5', currency: 'USD', destinationKind: 'wallet'})
        .success
    ).toBe(false);
    expect(
      loyaltyRedemptionSchema.safeParse({
        kind: 'discount',
        idempotencyKey: '97b3b8f4-2350-483a-b3a0-9df46a230b44'
      }).success
    ).toBe(true);
  });
});

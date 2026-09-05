import 'server-only';

import {queryValue, trustedRest} from '@/features/reseller/server/trusted-rest';
import type {
  AffiliateDashboardData,
  GrowthAdminReport,
  GrowthTier,
  LoyaltyDashboardData
} from '../types';

type Row = Record<string, unknown>;
const number = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0));
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const nullableText = (value: unknown) => (typeof value === 'string' ? value : null);
const translated = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {};

export async function getAffiliateDashboard(profileId: string): Promise<AffiliateDashboardData> {
  const accounts = await trustedRest<Row[]>(
    `affiliate_accounts?select=*&profile_id=eq.${queryValue(profileId)}&deleted_at=is.null&limit=1`
  );
  const rawAccount = accounts[0];
  if (!rawAccount) {
    return {
      account: null,
      totals: {
        clicks: 0,
        signups: 0,
        conversions: 0,
        conversionRate: 0,
        pending: 0,
        available: 0,
        paid: 0,
        currency: 'USD'
      },
      links: [],
      commissions: [],
      payouts: [],
      assets: []
    };
  }
  const accountId = text(rawAccount.id);
  const [links, clicks, attributions, commissions, payouts, assets] = await Promise.all([
    trustedRest<Row[]>(
      `affiliate_links?select=*&affiliate_account_id=eq.${queryValue(accountId)}&deleted_at=is.null&order=created_at.desc`
    ),
    trustedRest<Row[]>(
      `referral_clicks?select=id,affiliate_link_id,occurred_at&affiliate_account_id=eq.${queryValue(accountId)}&order=occurred_at.desc`
    ),
    trustedRest<Row[]>(
      `referral_attributions?select=id,affiliate_link_id,referred_profile_id,created_at&affiliate_account_id=eq.${queryValue(accountId)}&order=created_at.desc`
    ),
    trustedRest<Row[]>(
      `affiliate_commissions?select=*&affiliate_account_id=eq.${queryValue(accountId)}&order=created_at.desc`
    ),
    trustedRest<Row[]>(
      `affiliate_payout_requests?select=*&affiliate_account_id=eq.${queryValue(accountId)}&order=created_at.desc`
    ),
    trustedRest<Row[]>(
      'affiliate_marketing_assets?select=*&active=eq.true&deleted_at=is.null&order=sort_order.asc'
    )
  ]);
  const convertedAttributions = new Set(
    commissions.map((row) => text(row.referred_profile_id)).filter(Boolean)
  );
  const pending = commissions
    .filter((row) => ['pending', 'held_review'].includes(text(row.status)))
    .reduce((sum, row) => sum + number(row.amount), 0);
  const reserved = payouts
    .filter((row) => !['rejected', 'cancelled'].includes(text(row.status)))
    .reduce((sum, row) => sum + number(row.amount), 0);
  const available = Math.max(
    0,
    commissions
      .filter((row) => text(row.status) === 'available')
      .reduce((sum, row) => sum + number(row.amount), 0) - reserved
  );
  const paid = payouts
    .filter((row) => text(row.status) === 'paid')
    .reduce((sum, row) => sum + number(row.amount), 0);
  const linkMetrics = links.map((link) => {
    const linkId = text(link.id);
    const linkClicks = clicks.filter((click) => click.affiliate_link_id === linkId).length;
    const linkAttributions = attributions.filter((item) => item.affiliate_link_id === linkId);
    const linkProfileIds = new Set(linkAttributions.map((item) => text(item.referred_profile_id)));
    const linkCommissions = commissions.filter((commission) =>
      linkProfileIds.has(text(commission.referred_profile_id))
    );
    return {
      id: linkId,
      slug: text(link.slug),
      name: text(link.name),
      destinationPath: text(link.destination_path),
      campaign: nullableText(link.campaign),
      clicks: linkClicks,
      signups: linkAttributions.length,
      conversions: linkAttributions.filter((item) =>
        convertedAttributions.has(text(item.referred_profile_id))
      ).length,
      revenue: linkCommissions.reduce((sum, row) => sum + number(row.basis_amount), 0)
    };
  });
  return {
    account: {
      id: accountId,
      profile_id: profileId,
      referral_code: text(rawAccount.referral_code),
      status: text(rawAccount.status) as AffiliateDashboardData['account'] extends infer T
        ? T extends {status: infer S}
          ? S
          : never
        : never,
      fraud_score: number(rawAccount.fraud_score),
      payout_currency_code: text(rawAccount.payout_currency_code),
      application_message: nullableText(rawAccount.application_message),
      created_at: text(rawAccount.created_at)
    },
    totals: {
      clicks: clicks.length,
      signups: attributions.length,
      conversions: convertedAttributions.size,
      conversionRate: clicks.length
        ? Math.round((convertedAttributions.size / clicks.length) * 10000) / 100
        : 0,
      pending,
      available,
      paid,
      currency: text(rawAccount.payout_currency_code) || 'USD'
    },
    links: linkMetrics,
    commissions: commissions.map((row) => ({
      id: text(row.id),
      orderId: text(row.order_id),
      level: number(row.level),
      amount: number(row.amount),
      currency: text(row.currency_code),
      status: text(row.status),
      availableAt: text(row.available_at),
      createdAt: text(row.created_at)
    })),
    payouts: payouts.map((row) => ({
      id: text(row.id),
      destinationKind: text(row.destination_kind),
      amount: number(row.amount),
      currency: text(row.currency_code),
      status: text(row.status),
      createdAt: text(row.created_at)
    })),
    assets: assets.map((row) => ({
      id: text(row.id),
      kind: text(row.asset_kind),
      name: translated(row.name),
      description: translated(row.description),
      storagePath: nullableText(row.storage_path),
      externalUrl: nullableText(row.external_url),
      copyText: translated(row.copy_text)
    }))
  };
}

function mapTier(row: Row): GrowthTier {
  return {
    id: text(row.id),
    code: text(row.code),
    name: translated(row.name),
    description: translated(row.description),
    minimumSpend: number(row.minimum_lifetime_spend),
    discountBps: number(row.discount_bps),
    pointsMultiplierBps: number(row.points_multiplier_bps),
    priorityQueue: Boolean(row.priority_queue),
    exclusiveProducts: Boolean(row.exclusive_products),
    dedicatedSupport: Boolean(row.dedicated_support),
    benefits: Array.isArray(row.benefits) ? row.benefits : []
  };
}

export async function getLoyaltyDashboard(profileId: string): Promise<LoyaltyDashboardData> {
  const [accountRows, tiers, badges, awards, redemptions, orders, currencies] = await Promise.all([
    trustedRest<Row[]>(`loyalty_accounts?select=*&profile_id=eq.${queryValue(profileId)}&limit=1`),
    trustedRest<Row[]>(
      'customer_tiers?select=*&active=eq.true&deleted_at=is.null&order=minimum_lifetime_spend.asc'
    ),
    trustedRest<Row[]>(
      'loyalty_badges?select=*&active=eq.true&deleted_at=is.null&order=sort_order.asc'
    ),
    trustedRest<Row[]>(`loyalty_badge_awards?select=*&profile_id=eq.${queryValue(profileId)}`),
    trustedRest<Row[]>(
      `loyalty_redemptions?select=*&profile_id=eq.${queryValue(profileId)}&order=created_at.desc`
    ),
    trustedRest<Row[]>(
      `orders?select=total_amount,currency_code,status&profile_id=eq.${queryValue(profileId)}&status=in.(delivered,completed)&deleted_at=is.null`
    ),
    trustedRest<Row[]>('currencies?select=code,exchange_rate_minor,rate_scale')
  ]);
  const tierList = tiers.map(mapTier);
  const rawAccount = accountRows[0] ?? {
    id: '',
    cached_points: 0,
    lifetime_earned: 0,
    streak_days: 0,
    current_tier_id: tierList[0]?.id ?? null
  };
  const actualEntries = rawAccount.id
    ? await trustedRest<Row[]>(
        `loyalty_point_entries?select=*&loyalty_account_id=eq.${queryValue(text(rawAccount.id))}&order=created_at.desc&limit=100`
      )
    : [];
  const currentIndex = Math.max(
    0,
    tierList.findIndex((tier) => tier.id === rawAccount.current_tier_id)
  );
  const currentTier = tierList[currentIndex] ?? null;
  const nextTier = tierList[currentIndex + 1] ?? null;
  const currencyMap = new Map(currencies.map((row) => [text(row.code), row]));
  const lifetimeSpend = orders.reduce((sum, row) => {
    const currency = currencyMap.get(text(row.currency_code));
    const rate = BigInt(number(currency?.exchange_rate_minor) || 1);
    const scale = BigInt(number(currency?.rate_scale));
    return sum + Number((BigInt(number(row.total_amount)) * 10n ** scale) / rate);
  }, 0);
  const range = nextTier ? nextTier.minimumSpend - (currentTier?.minimumSpend ?? 0) : 0;
  const progressBps = nextTier
    ? Math.min(
        10000,
        Math.max(
          0,
          Math.round(
            ((lifetimeSpend - (currentTier?.minimumSpend ?? 0)) / Math.max(range, 1)) * 10000
          )
        )
      )
    : 10000;
  const awardMap = new Map(awards.map((award) => [text(award.badge_id), text(award.awarded_at)]));
  return {
    account: {
      id: text(rawAccount.id),
      points: number(rawAccount.cached_points),
      lifetimeEarned: number(rawAccount.lifetime_earned),
      streakDays: number(rawAccount.streak_days),
      tierId: nullableText(rawAccount.current_tier_id)
    },
    currentTier,
    nextTier,
    progressBps,
    lifetimeSpend,
    entries: actualEntries.map((row) => ({
      id: text(row.id),
      kind: text(row.entry_kind),
      points: number(row.points),
      expiresAt: nullableText(row.expires_at),
      createdAt: text(row.created_at)
    })),
    badges: badges.map((row) => ({
      id: text(row.id),
      code: text(row.code),
      name: translated(row.name),
      description: translated(row.description),
      iconName: text(row.icon_name),
      earned: awardMap.has(text(row.id)),
      awardedAt: awardMap.get(text(row.id)) ?? null
    })),
    redemptions: redemptions.map((row) => ({
      id: text(row.id),
      kind: text(row.kind),
      pointsSpent: number(row.points_spent),
      status: text(row.status),
      createdAt: text(row.created_at)
    }))
  };
}

export async function getGrowthAdminReport(): Promise<GrowthAdminReport> {
  const [accounts, clicks, attributions, commissions, payouts, fraud, loyalty, entries, tiers] =
    await Promise.all([
      trustedRest<Row[]>('affiliate_accounts?select=id,referral_code,status&deleted_at=is.null'),
      trustedRest<Row[]>('referral_clicks?select=id,affiliate_account_id'),
      trustedRest<Row[]>('referral_attributions?select=id,affiliate_account_id'),
      trustedRest<Row[]>(
        'affiliate_commissions?select=id,affiliate_account_id,order_id,amount,status,currency_code'
      ),
      trustedRest<Row[]>('affiliate_payout_requests?select=id,status'),
      trustedRest<Row[]>('referral_fraud_signals?select=id,status'),
      trustedRest<Row[]>('loyalty_accounts?select=id,current_tier_id'),
      trustedRest<Row[]>('loyalty_point_entries?select=points'),
      trustedRest<Row[]>('customer_tiers?select=id,code&active=eq.true&deleted_at=is.null')
    ]);
  const topAffiliates = accounts
    .map((account) => ({
      code: text(account.referral_code),
      conversions: attributions.filter((row) => row.affiliate_account_id === account.id).length,
      earnings: commissions
        .filter((row) => row.affiliate_account_id === account.id && row.status !== 'reversed')
        .reduce((sum, row) => sum + number(row.amount), 0)
    }))
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, 10);
  return {
    applications: accounts.filter((row) => row.status === 'pending').length,
    activeAffiliates: accounts.filter((row) => row.status === 'active').length,
    clicks: clicks.length,
    signups: attributions.length,
    conversions: new Set(commissions.map((row) => row.order_id)).size,
    pendingCommissions: commissions
      .filter((row) => ['pending', 'held_review'].includes(text(row.status)))
      .reduce((sum, row) => sum + number(row.amount), 0),
    availableCommissions: commissions
      .filter((row) => row.status === 'available')
      .reduce((sum, row) => sum + number(row.amount), 0),
    pendingPayouts: payouts.filter((row) =>
      ['requested', 'reviewing', 'approved', 'processing'].includes(text(row.status))
    ).length,
    openFraudSignals: fraud.filter((row) => ['open', 'reviewing'].includes(text(row.status)))
      .length,
    loyaltyMembers: loyalty.length,
    issuedPoints: entries
      .filter((row) => number(row.points) > 0)
      .reduce((sum, row) => sum + number(row.points), 0),
    redeemedPoints: Math.abs(
      entries
        .filter((row) => number(row.points) < 0)
        .reduce((sum, row) => sum + number(row.points), 0)
    ),
    tierDistribution: tiers.map((tier) => ({
      name: text(tier.code),
      value: loyalty.filter((account) => account.current_tier_id === tier.id).length
    })),
    topAffiliates
  };
}

export type AffiliateAccount = {
  id: string;
  profile_id: string;
  referral_code: string;
  status: 'pending' | 'active' | 'suspended' | 'closed';
  fraud_score: number;
  payout_currency_code: string;
  application_message: string | null;
  created_at: string;
};

export type AffiliateLinkMetric = {
  id: string;
  slug: string;
  name: string;
  destinationPath: string;
  campaign: string | null;
  clicks: number;
  signups: number;
  conversions: number;
  revenue: number;
};

export type AffiliateDashboardData = {
  account: AffiliateAccount | null;
  totals: {
    clicks: number;
    signups: number;
    conversions: number;
    conversionRate: number;
    pending: number;
    available: number;
    paid: number;
    currency: string;
  };
  links: AffiliateLinkMetric[];
  commissions: Array<{
    id: string;
    orderId: string;
    level: number;
    amount: number;
    currency: string;
    status: string;
    availableAt: string;
    createdAt: string;
  }>;
  payouts: Array<{
    id: string;
    destinationKind: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  assets: Array<{
    id: string;
    kind: string;
    name: Record<string, string>;
    description: Record<string, string>;
    storagePath: string | null;
    externalUrl: string | null;
    copyText: Record<string, string>;
  }>;
};

export type LoyaltyDashboardData = {
  account: {
    id: string;
    points: number;
    lifetimeEarned: number;
    streakDays: number;
    tierId: string | null;
  };
  currentTier: GrowthTier | null;
  nextTier: GrowthTier | null;
  progressBps: number;
  lifetimeSpend: number;
  entries: Array<{
    id: string;
    kind: string;
    points: number;
    expiresAt: string | null;
    createdAt: string;
  }>;
  badges: Array<{
    id: string;
    code: string;
    name: Record<string, string>;
    description: Record<string, string>;
    iconName: string;
    earned: boolean;
    awardedAt: string | null;
  }>;
  redemptions: Array<{
    id: string;
    kind: string;
    pointsSpent: number;
    status: string;
    createdAt: string;
  }>;
};

export type GrowthTier = {
  id: string;
  code: string;
  name: Record<string, string>;
  description: Record<string, string>;
  minimumSpend: number;
  discountBps: number;
  pointsMultiplierBps: number;
  priorityQueue: boolean;
  exclusiveProducts: boolean;
  dedicatedSupport: boolean;
  benefits: unknown[];
};

export type GrowthAdminReport = {
  applications: number;
  activeAffiliates: number;
  clicks: number;
  signups: number;
  conversions: number;
  pendingCommissions: number;
  availableCommissions: number;
  pendingPayouts: number;
  openFraudSignals: number;
  loyaltyMembers: number;
  issuedPoints: number;
  redeemedPoints: number;
  tierDistribution: Array<{name: string; value: number}>;
  topAffiliates: Array<{code: string; conversions: number; earnings: number}>;
};

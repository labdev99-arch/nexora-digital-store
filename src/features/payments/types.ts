import type {Json} from '@/lib/supabase/database.types';

export type PaymentStatus =
  | 'created'
  | 'requires_action'
  | 'awaiting_payment'
  | 'awaiting_proof'
  | 'under_review'
  | 'authorized'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded'
  | 'disputed'
  | 'chargeback';

export type PaymentMethodRow = {
  id: string;
  code: string;
  driver: string;
  flow: 'automatic' | 'proof';
  name: Json;
  description: Json;
  instructions: Json;
  enabled: boolean;
  sandbox_mode: boolean;
  min_amount: number;
  max_amount: number;
  fee_fixed: number;
  fee_bps: number;
  allowed_currencies: string[];
  allowed_countries: string[];
  allowed_tiers: string[];
  config: Json;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentRow = {
  id: string;
  profile_id: string | null;
  payment_method_id: string;
  provider_code: string;
  purpose: 'wallet_topup' | 'order';
  order_id: string | null;
  status: PaymentStatus;
  currency_code: string;
  requested_amount: number;
  fee_amount: number;
  payable_amount: number;
  received_amount: number;
  credited_amount: number;
  refunded_amount: number;
  payment_reference: string | null;
  provider_payment_id: string | null;
  provider_customer_id: string | null;
  idempotency_key: string;
  client_action: Json;
  provider_metadata: Json;
  failure_code: string | null;
  failure_message: string | null;
  sandbox_mode: boolean;
  expires_at: string | null;
  rate_locked_at: string | null;
  rate_expires_at: string | null;
  paid_at: string | null;
  settled_at: string | null;
  wallet_transaction_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VerificationQueueItem = {
  id: string;
  payment_id: string;
  proof_id: string;
  status: 'pending' | 'processing' | 'needs_review' | 'approved' | 'rejected';
  priority: number;
  claimed_by: string | null;
  claimed_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
};

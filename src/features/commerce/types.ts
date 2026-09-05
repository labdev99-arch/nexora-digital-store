import type {Json} from '@/lib/supabase/database.types';

export type OrderStatus =
  | 'draft'
  | 'awaiting_payment'
  | 'paid'
  | 'processing'
  | 'partially_delivered'
  | 'delivered'
  | 'completed'
  | 'on_hold'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'disputed';

export type CartLine = {
  id: string;
  productId: string;
  variantId: string;
  quantity: number;
  optionValues: Record<string, unknown>;
  productName: Record<string, string>;
  variantName: Record<string, string>;
  sku: string;
  priceAmount: number;
  currencyCode: string;
  stockQuantity: number;
  unlimitedStock: boolean;
  fulfillmentMode: 'auto' | 'manual' | 'auto_then_manual';
  warrantyText: Record<string, string>;
  imageUrl: string | null;
};

export type CartView = {
  id: string;
  currencyCode: string;
  localeCode: string;
  countryCode: string | null;
  couponCodes: string[];
  items: CartLine[];
  upsells: Array<{id: string; slug: string; name: Json; priceAmount: number; currencyCode: string}>;
};

export type OrderSummary = {
  id: string;
  order_number: string;
  status: OrderStatus;
  currency_code: string;
  total_amount: number;
  created_at: string;
};

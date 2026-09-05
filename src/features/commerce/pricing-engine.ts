import {z} from 'zod';

const safeMoney = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const bps = z.number().int().min(0).max(10_000);

export type CouponAdjustment = {
  code: string;
  kind: 'percent' | 'fixed' | 'free_item';
  value: number;
  applies: boolean;
};

export type PriceLineInput = {
  id: string;
  quantity: number;
  baseUnitAmount: number;
  tierUnitAmount?: number;
  countryUnitAmount?: number;
  quantityUnitAmount?: number;
  quantityDiscountBps?: number;
  flashDiscountBps?: number;
  flashDiscountFixed?: number;
  coupons?: CouponAdjustment[];
  loyaltyDiscountBps?: number;
  feeBps?: number;
  feeFixed?: number;
  taxBps?: number;
  taxInclusive?: boolean;
};

export type PriceLineResult = {
  id: string;
  quantity: number;
  baseAmount: number;
  tierAmount: number;
  countryAmount: number;
  quantityDiscountAmount: number;
  flashDiscountAmount: number;
  couponDiscountAmount: number;
  loyaltyDiscountAmount: number;
  feeAmount: number;
  taxAmount: number;
  totalAmount: number;
  appliedCoupons: string[];
};

export type CartPriceResult = {
  lines: PriceLineResult[];
  subtotalAmount: number;
  discountAmount: number;
  feeAmount: number;
  taxAmount: number;
  totalAmount: number;
};

function percentage(amount: number, rate: number) {
  return Math.floor((amount * rate) / 10_000);
}

function checked(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`pricing_invalid_${name}`);
  return value;
}

export function priceLine(raw: PriceLineInput): PriceLineResult {
  const quantity = z.number().int().min(1).max(1_000_000).parse(raw.quantity);
  const baseUnit = safeMoney.parse(raw.baseUnitAmount);
  const baseAmount = checked(baseUnit * quantity, 'base');

  const tierUnit =
    raw.tierUnitAmount === undefined ? baseUnit : safeMoney.parse(raw.tierUnitAmount);
  const tierAmount = checked(Math.max(0, baseAmount - tierUnit * quantity), 'tier');
  const afterTier = baseAmount - tierAmount;

  const countryUnit =
    raw.countryUnitAmount === undefined ? tierUnit : safeMoney.parse(raw.countryUnitAmount);
  const countryTotal = checked(countryUnit * quantity, 'country');
  const countryAmount = afterTier - countryTotal;
  const afterCountry = countryTotal;

  const quantityTarget =
    raw.quantityUnitAmount === undefined
      ? afterCountry - percentage(afterCountry, bps.parse(raw.quantityDiscountBps ?? 0))
      : safeMoney.parse(raw.quantityUnitAmount) * quantity;
  const quantityDiscountAmount = Math.max(0, afterCountry - quantityTarget);
  const afterQuantity = Math.max(0, afterCountry - quantityDiscountAmount);

  const flashDiscountAmount = Math.min(
    afterQuantity,
    checked(
      percentage(afterQuantity, bps.parse(raw.flashDiscountBps ?? 0)) +
        safeMoney.parse(raw.flashDiscountFixed ?? 0),
      'flash'
    )
  );
  let running = afterQuantity - flashDiscountAmount;
  let couponDiscountAmount = 0;
  const appliedCoupons: string[] = [];
  for (const coupon of raw.coupons ?? []) {
    if (!coupon.applies) continue;
    const discount =
      coupon.kind === 'percent'
        ? percentage(running, bps.parse(coupon.value))
        : coupon.kind === 'free_item'
          ? running
          : safeMoney.parse(coupon.value);
    const bounded = Math.min(running, discount);
    running -= bounded;
    couponDiscountAmount += bounded;
    appliedCoupons.push(coupon.code);
  }

  const loyaltyDiscountAmount = Math.min(
    running,
    percentage(running, bps.parse(raw.loyaltyDiscountBps ?? 0))
  );
  running -= loyaltyDiscountAmount;
  const feeAmount = checked(
    percentage(running, bps.parse(raw.feeBps ?? 0)) + safeMoney.parse(raw.feeFixed ?? 0),
    'fee'
  );
  const beforeTax = checked(running + feeAmount, 'before_tax');
  const taxRate = bps.parse(raw.taxBps ?? 0);
  const taxAmount = raw.taxInclusive
    ? Math.floor((beforeTax * taxRate) / (10_000 + taxRate))
    : percentage(beforeTax, taxRate);
  const totalAmount = raw.taxInclusive ? beforeTax : checked(beforeTax + taxAmount, 'total');

  return {
    id: raw.id,
    quantity,
    baseAmount,
    tierAmount,
    countryAmount,
    quantityDiscountAmount,
    flashDiscountAmount,
    couponDiscountAmount,
    loyaltyDiscountAmount,
    feeAmount,
    taxAmount,
    totalAmount,
    appliedCoupons
  };
}

export function priceCart(lines: PriceLineInput[]): CartPriceResult {
  const priced = lines.map(priceLine);
  const sum = (select: (line: PriceLineResult) => number) =>
    checked(
      priced.reduce((total, line) => total + select(line), 0),
      'cart_total'
    );
  const subtotalAmount = sum((line) => line.baseAmount);
  const discountAmount = sum(
    (line) =>
      line.tierAmount +
      line.countryAmount +
      line.quantityDiscountAmount +
      line.flashDiscountAmount +
      line.couponDiscountAmount +
      line.loyaltyDiscountAmount
  );
  const feeAmount = sum((line) => line.feeAmount);
  const taxAmount = sum((line) => line.taxAmount);
  const totalAmount = sum((line) => line.totalAmount);
  return {lines: priced, subtotalAmount, discountAmount, feeAmount, taxAmount, totalAmount};
}

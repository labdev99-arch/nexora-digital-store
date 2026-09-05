import 'server-only';

import {CryptoPaymentProvider} from './crypto-provider';
import {LocalCardGatewayProvider} from './local-card-gateway-provider';
import {ManualProofProvider} from './manual-provider';
import type {PaymentProvider} from './payment-provider';
import {StripePaymentProvider} from './stripe-provider';

type Factory = () => PaymentProvider;

const factories: Record<string, Factory> = {
  stripe: () => new StripePaymentProvider(),
  areeba: () => new LocalCardGatewayProvider('areeba'),
  netcommerce: () => new LocalCardGatewayProvider('netcommerce'),
  checkout: () => new LocalCardGatewayProvider('checkout'),
  whish: () => new ManualProofProvider('whish', 'WHS'),
  omt: () => new ManualProofProvider('omt', 'OMT'),
  manual_bank: () => new ManualProofProvider('bank_transfer', 'BNK'),
  manual_cash: () => new ManualProofProvider('cash', 'CSH'),
  nowpayments: () => new CryptoPaymentProvider()
};

function configuredDriver(driver: string): string {
  if (driver !== 'stripe') return driver;
  return process.env.CARD_PAYMENT_PROVIDER?.trim().toLowerCase() || 'stripe';
}

export function getPaymentProvider(driver: string): PaymentProvider {
  const resolved = configuredDriver(driver);
  const factory = factories[resolved];
  if (!factory) throw new Error(`payment_provider_unknown:${resolved}`);
  return factory();
}

export function registeredPaymentDrivers(): readonly string[] {
  return Object.keys(factories);
}

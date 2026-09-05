import 'server-only';

/** Official Whish integration boundary. Keep request signing and credentials here
 * when access is granted; the manual proof flow remains operational meanwhile. */
export type WhishApiPayment = {id: string; reference: string; status: string};

function unavailable(): never {
  throw new Error('whish_official_api_not_configured');
}

export async function createWhishPayment(_input: {
  amount: number;
  currencyCode: string;
  reference: string;
  callbackUrl: string;
}): Promise<WhishApiPayment> {
  void _input;
  return unavailable();
}

export async function verifyWhishPayment(_providerPaymentId: string): Promise<WhishApiPayment> {
  void _providerPaymentId;
  return unavailable();
}

export async function getWhishPaymentStatus(_providerPaymentId: string): Promise<WhishApiPayment> {
  void _providerPaymentId;
  return unavailable();
}

export async function refundWhishPayment(_input: {
  providerPaymentId: string;
  amount: number;
  idempotencyKey: string;
}): Promise<{id: string; status: string}> {
  void _input;
  return unavailable();
}

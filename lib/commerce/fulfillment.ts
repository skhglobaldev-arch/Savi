export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused'
  | 'unknown';

export type TopUpGrantKeyInput = {
  provider: string;
  providerCheckoutSessionId?: string | null;
  providerPaymentIntentId?: string | null;
};

export type SubscriptionGrantKeyInput = {
  provider: string;
  providerSubscriptionId: string;
  providerInvoiceId: string;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
};

export function isoFromUnixSeconds(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

export function normalizeSubscriptionStatus(status: string | null | undefined): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
    case 'incomplete':
    case 'incomplete_expired':
    case 'unpaid':
    case 'paused':
      return status;
    default:
      return 'unknown';
  }
}

export function topUpGrantKey(input: TopUpGrantKeyInput) {
  const paymentIdentity = input.providerPaymentIntentId || input.providerCheckoutSessionId;
  if (!paymentIdentity) throw new Error('Top-up grants need a Stripe checkout session or payment intent id.');
  return `${input.provider}:topup:${paymentIdentity}`;
}

export function subscriptionGrantKey(input: SubscriptionGrantKeyInput) {
  const period = [input.billingPeriodStart || 'unknown_start', input.billingPeriodEnd || 'unknown_end'].join(':');
  return `${input.provider}:subscription:${input.providerSubscriptionId}:${input.providerInvoiceId}:${period}`;
}

export function shouldGrantSubscriptionCredits(invoiceStatus: string | null | undefined, paid: boolean | null | undefined) {
  return invoiceStatus === 'paid' || paid === true;
}

export function canReceiveRecurringSubscriptionGrant(status: string, providerStatus: string) {
  return ['active', 'trialing'].includes(status) && ['active', 'trialing'].includes(providerStatus);
}

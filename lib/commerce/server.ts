import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { readSessionToken, SAVI_SESSION_COOKIE, type SaviUser } from '@/lib/auth/session';
import {
  customerSafeCommerceCatalog,
  getActiveCommercePlan,
  getActiveTopUpPack,
  getPlanByStripePriceId,
  getTopUpPackByStripePriceId,
  getCommerceCatalog,
  type CommercePlan,
  type CommerceTopUpPack
} from '@/lib/commerce/catalog';
import {
  isoFromUnixSeconds,
  isProviderEventSuperseded,
  normalizeSubscriptionStatus,
  canReceiveRecurringSubscriptionGrant,
  shouldGrantSubscriptionCredits,
  subscriptionGrantKey,
  topUpGrantKey
} from '@/lib/commerce/fulfillment';
import { getStripeClient } from '@/lib/commerce/stripe';
import { getSaviDataConnect } from '@/lib/firebase/admin';
import {
  assertSafeCreditAmount,
  calculateSubscriptionRenewalGrant
} from '@/lib/savi/creditIntegrity';
import {
  assertSaviAccountCanMutate,
  getAuthoritativeCreditAccountByUserId,
  getAuthoritativeCreditBalance,
  resolveSaviDatabaseUser,
  SaviInfrastructureError
} from '@/lib/savi/textToImageInfrastructure';
import { type NextRequest } from 'next/server';

export class CommerceError extends Error {
  constructor(
    readonly category: string,
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'CommerceError';
  }
}

type DatabaseUser = {
  id: string;
  email: string;
  displayName: string;
};

type CommerceCustomer = {
  id: string;
  userId: string;
  provider: string;
  providerCustomerId: string;
  email?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type CommerceSubscription = {
  id: string;
  userId: string;
  commerceCustomerId: string;
  provider: string;
  providerSubscriptionId: string;
  providerCustomerId: string;
  planId: string;
  catalogVersion: string;
  status: string;
  providerStatus: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string | null;
  metadata?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type PaymentEvent = {
  id: string;
  provider: string;
  providerEventId: string;
  status: string;
};

type CommercePurchase = {
  id: string;
  userId: string;
  status: string;
  providerPaymentIntentId?: string | null;
  providerCheckoutSessionId?: string | null;
  catalogItemId: string;
  catalogVersion: string;
  creditsGranted: number;
  metadata?: string | null;
};

type StripeDisputeLink = {
  purchase: CommercePurchase | null;
  subscription: CommerceSubscription | null;
  providerCustomerId: string | null;
};

type BillingStateResponse = {
  commerceCustomers?: CommerceCustomer[];
  commerceSubscriptions?: CommerceSubscription[];
  commercePurchases?: Array<Record<string, unknown>>;
  creditGrants?: Array<Record<string, unknown>>;
};

const PROVIDER = 'stripe';

function metadata(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message.toLowerCase() : '';
}

function isDuplicateWrite(error: unknown) {
  const text = errorText(error);
  return (
    text.includes('duplicate') ||
    text.includes('unique') ||
    text.includes('already exists') ||
    text.includes('already_exists') ||
    text.includes('already-exists') ||
    text.includes('constraint')
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringId(value: unknown) {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  return typeof record.id === 'string' ? record.id : null;
}

function parseMetadata(value: string | null | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isFinalDisputePurchaseStatus(status: string) {
  return status === 'dispute_won' || status === 'dispute_lost';
}

function providerEventCreatedAt(event: Stripe.Event) {
  return typeof event.created === 'number' && Number.isSafeInteger(event.created) && event.created > 0
    ? event.created
    : null;
}

function isSubscriptionEventSuperseded(existing: CommerceSubscription, event: Stripe.Event) {
  const recorded = parseMetadata(existing.metadata).providerEventCreatedAt;
  const incoming = providerEventCreatedAt(event);
  return isProviderEventSuperseded(recorded, incoming);
}

function unixNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstLineItemPriceId(value: unknown) {
  const record = asRecord(value);
  const items = asRecord(record.items);
  const itemsData = Array.isArray(items.data) ? items.data : [];
  const lineItems = asRecord(record.line_items);
  const lineItemsData = Array.isArray(lineItems.data) ? lineItems.data : [];
  const first = asRecord(itemsData[0] ?? lineItemsData[0]);
  const directPriceId = stringId(first.price);
  const price = asRecord(first.price ?? asRecord(first.pricing).price_details);
  const priceId = directPriceId ?? stringId(price) ?? (typeof price.price === 'string' ? price.price : null);
  return priceId;
}

function firstInvoiceLine(value: unknown) {
  const lines = asRecord(asRecord(value).lines);
  const data = Array.isArray(lines.data) ? lines.data : [];
  return asRecord(data[0]);
}

function periodFromLine(line: Record<string, unknown>) {
  const period = asRecord(line.period);
  return {
    start: isoFromUnixSeconds(unixNumber(period.start)),
    end: isoFromUnixSeconds(unixNumber(period.end))
  };
}

export function getCommerceSessionUser(request: NextRequest) {
  return readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
}

export function getCommerceOrigin(request: NextRequest) {
  const configuredOrigin = process.env.SAVI_APP_ORIGIN?.trim();
  if (configuredOrigin) {
    try {
      const parsed = new URL(configuredOrigin);
      const protocolAllowed = parsed.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:');
      if (protocolAllowed && !parsed.search && !parsed.hash) {
        return parsed.origin;
      }
    } catch {
      throw new CommerceError('INVALID_APP_ORIGIN', 503, 'SAVI_APP_ORIGIN is not a valid application origin.');
    }
  }
  if (process.env.NODE_ENV === 'production') {
    throw new CommerceError('INVALID_APP_ORIGIN', 503, 'SAVI_APP_ORIGIN must be configured in production.');
  }
  return request.nextUrl.origin;
}

async function dataConnectQuery<T, Variables extends object>(operation: string, variables: Variables) {
  const response = await getSaviDataConnect().executeQuery<T, Variables>(operation, variables);
  return response.data;
}

async function dataConnectMutation<T, Variables extends object>(operation: string, variables: Variables) {
  const response = await getSaviDataConnect().executeMutation<T, Variables>(operation, variables);
  return response.data;
}

async function findCommerceCustomer(userId: string) {
  const data = await dataConnectQuery<{ commerceCustomers?: CommerceCustomer[] }, { userId: string; provider: string }>(
    'FindCommerceCustomer',
    { userId, provider: PROVIDER }
  );
  return data.commerceCustomers?.[0] ?? null;
}

async function findCommerceCustomerByProviderId(providerCustomerId: string) {
  const data = await dataConnectQuery<{ commerceCustomers?: CommerceCustomer[] }, { provider: string; providerCustomerId: string }>(
    'FindCommerceCustomerByProviderId',
    { provider: PROVIDER, providerCustomerId }
  );
  return data.commerceCustomers?.[0] ?? null;
}

async function findPaymentEvent(providerEventId: string) {
  const data = await dataConnectQuery<{ paymentEvents?: PaymentEvent[] }, { provider: string; providerEventId: string }>('FindPaymentEvent', {
    provider: PROVIDER,
    providerEventId
  });
  return data.paymentEvents?.[0] ?? null;
}

async function findCommerceSubscription(providerSubscriptionId: string) {
  const data = await dataConnectQuery<
    { commerceSubscriptions?: CommerceSubscription[] },
    { provider: string; providerSubscriptionId: string }
  >('FindCommerceSubscriptionByProvider', {
    provider: PROVIDER,
    providerSubscriptionId
  });
  return data.commerceSubscriptions?.[0] ?? null;
}

async function findCommerceSubscriptionForDispute(dispute: Record<string, unknown>, paymentIntentId: string) {
  try {
    const stripe = getStripeClient();
    const chargeId = stringId(dispute.charge);
    if (!chargeId) return null;
    const charge = await stripe.charges.retrieve(chargeId);
    const providerCustomerId = stringId(charge.customer);
    if (!providerCustomerId) return null;
    const invoices = await stripe.invoices.list({ customer: providerCustomerId, limit: 100 });
    for (const candidate of invoices.data) {
      const invoice = await stripe.invoices.retrieve(candidate.id, { expand: ['payments.data.payment.payment_intent'] });
      const payments = asRecord(invoice.payments);
      const paymentRows = Array.isArray(payments.data) ? payments.data : [];
      const matchingPayment = paymentRows.some((payment) => stringId(asRecord(asRecord(payment).payment).payment_intent) === paymentIntentId);
      if (!matchingPayment) continue;

      const parent = asRecord(invoice.parent);
      const subscriptionDetails = asRecord(parent.subscription_details);
      const providerSubscriptionId = stringId(subscriptionDetails.subscription);
      return providerSubscriptionId ? findCommerceSubscription(providerSubscriptionId) : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function findCommercePurchaseByPaymentIntent(providerPaymentIntentId: string) {
  const data = await dataConnectQuery<{ commercePurchases?: CommercePurchase[] }, { provider: string; providerPaymentIntentId: string }>(
    'FindCommercePurchaseByPaymentIntent',
    { provider: PROVIDER, providerPaymentIntentId }
  );
  return data.commercePurchases?.[0] ?? null;
}

async function recordPaymentEvent(input: {
  event: Stripe.Event;
  objectId?: string | null;
  userId?: string | null;
  status: 'processed' | 'ignored' | 'failed';
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const existing = await findPaymentEvent(input.event.id);
  if (existing) return existing;

  try {
    await dataConnectMutation('RecordPaymentEventOnly', {
      eventId: randomUUID(),
      provider: PROVIDER,
      providerEventId: input.event.id,
      eventType: input.event.type,
      livemode: Boolean(input.event.livemode),
      objectId: input.objectId || null,
      userId: input.userId || null,
      status: input.status,
      errorMessage: input.errorMessage || null,
      metadata: metadata(input.metadata ?? {})
    });
  } catch (error) {
    if (isDuplicateWrite(error)) {
      const raced = await findPaymentEvent(input.event.id);
      if (raced) return raced;
    }
    throw error;
  }

  return findPaymentEvent(input.event.id);
}

async function recordPaymentEventWithPurchaseStatus(input: {
  event: Stripe.Event;
  objectId: string | null;
  purchase: CommercePurchase;
  expectedStatus: string;
  nextStatus: string;
  metadata: Record<string, unknown>;
}) {
  const existing = await findPaymentEvent(input.event.id);
  if (existing) return existing;
  try {
    await dataConnectMutation('RecordPaymentEventAndUpdatePurchaseStatus', {
      eventId: randomUUID(),
      provider: PROVIDER,
      providerEventId: input.event.id,
      eventType: input.event.type,
      livemode: Boolean(input.event.livemode),
      objectId: input.objectId,
      purchaseId: input.purchase.id,
      userId: input.purchase.userId,
      expectedStatus: input.expectedStatus,
      nextStatus: input.nextStatus,
      metadata: metadata(input.metadata)
    });
  } catch (error) {
    if (isDuplicateWrite(error)) {
      const raced = await findPaymentEvent(input.event.id);
      if (raced) return raced;
    }
    throw error;
  }
  return findPaymentEvent(input.event.id);
}

export async function getOrCreateStripeCommerceCustomer(user: SaviUser) {
  const databaseUser = (await resolveSaviDatabaseUser(user)) as DatabaseUser;
  const existing = await findCommerceCustomer(databaseUser.id);
  if (existing) return { databaseUser, commerceCustomer: existing };

  const stripe = getStripeClient();
  const stripeCustomer = await stripe.customers.create(
    {
      email: databaseUser.email,
      name: databaseUser.displayName,
      metadata: {
        saviUserId: databaseUser.id,
        saviProvider: 'google',
        saviProviderSubject: user.id
      }
    },
    { idempotencyKey: `savi:stripe-customer:${databaseUser.id}` }
  );

  try {
    await dataConnectMutation('CreateCommerceCustomer', {
      id: randomUUID(),
      userId: databaseUser.id,
      provider: PROVIDER,
      providerCustomerId: stripeCustomer.id,
      email: databaseUser.email,
      metadata: metadata({ source: 'stripe_customer_create' })
    });
  } catch (error) {
    if (!isDuplicateWrite(error)) throw error;
  }

  const commerceCustomer = await findCommerceCustomer(databaseUser.id);
  if (!commerceCustomer) throw new CommerceError('COMMERCE_CUSTOMER_UNAVAILABLE', 502, 'SAVI could not create a billing profile.');
  return { databaseUser, commerceCustomer };
}

export async function getCommerceAccountState(user: SaviUser) {
  const databaseUser = (await resolveSaviDatabaseUser(user)) as DatabaseUser;
  const data = await dataConnectQuery<BillingStateResponse, { userId: string }>('GetCommerceBillingState', { userId: databaseUser.id });
  const balance = await getAuthoritativeCreditBalance(user);
  const creditAccount = await getAuthoritativeCreditAccountByUserId(databaseUser.id).catch(() => null);
  const subscriptions = data.commerceSubscriptions ?? [];
  const activeSubscription =
    subscriptions.find((subscription) => ['active', 'trialing', 'past_due'].includes(subscription.status)) ?? subscriptions[0] ?? null;
  const activePlan = activeSubscription
    ? getCommerceCatalog().plans.find((plan) => plan.id === activeSubscription.planId && plan.catalogVersion === activeSubscription.catalogVersion)
    : null;

  return {
    availableCredits: balance?.availableCredits ?? null,
    creditBreakdown: creditAccount
      ? {
          total: creditAccount.availableCredits,
          planCredits: creditAccount.subscriptionCredits,
          nonPlanCredits: Math.max(0, creditAccount.availableCredits - creditAccount.subscriptionCredits),
          reservedCredits: creditAccount.reservedCredits,
          reservedPlanCredits: creditAccount.reservedSubscriptionCredits
        }
      : null,
    catalog: customerSafeCommerceCatalog(),
    billingProfile: data.commerceCustomers?.[0]
      ? {
          provider: PROVIDER,
          exists: true,
          email: data.commerceCustomers[0].email ?? null,
          createdAt: data.commerceCustomers[0].createdAt ?? null
        }
      : { provider: PROVIDER, exists: false },
    currentSubscription: activeSubscription
      ? {
          id: activeSubscription.id,
          provider: activeSubscription.provider,
          planId: activeSubscription.planId,
          catalogVersion: activeSubscription.catalogVersion,
          status: activeSubscription.status,
          providerStatus: activeSubscription.providerStatus,
          currentPeriodStart: activeSubscription.currentPeriodStart ?? null,
          currentPeriodEnd: activeSubscription.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
          canceledAt: activeSubscription.canceledAt ?? null,
          entitlements: activeSubscription.status === 'active' || activeSubscription.status === 'trialing' ? activePlan?.entitlements ?? [] : []
        }
      : null,
    recentPurchases: data.commercePurchases ?? [],
    recentCreditGrants: data.creditGrants ?? []
  };
}

export async function createSubscriptionCheckout(user: SaviUser, planId: string, origin: string) {
  const plan = getActiveCommercePlan(planId);
  try {
    await assertSaviAccountCanMutate(user);
  } catch (error) {
    if (error instanceof SaviInfrastructureError) {
      throw new CommerceError(error.category, error.status, error.message);
    }
    throw error;
  }
  const { databaseUser, commerceCustomer } = await getOrCreateStripeCommerceCustomer(user);
  const commonMetadata = checkoutMetadata(databaseUser, commerceCustomer, plan);
  const session = await getStripeClient().checkout.sessions.create({
    mode: 'subscription',
    customer: commerceCustomer.providerCustomerId,
    client_reference_id: databaseUser.id,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${origin}/billing/return?checkout=subscription&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/credits?checkout=cancelled`,
    managed_payments: { enabled: false },
    metadata: commonMetadata,
    subscription_data: { metadata: commonMetadata }
  });
  if (!session.url) throw new CommerceError('CHECKOUT_SESSION_UNAVAILABLE', 502, 'Stripe did not return a checkout URL.');
  return { url: session.url };
}

export async function createTopUpCheckout(user: SaviUser, packId: string, origin: string) {
  const pack = getActiveTopUpPack(packId);
  try {
    await assertSaviAccountCanMutate(user);
  } catch (error) {
    if (error instanceof SaviInfrastructureError) {
      throw new CommerceError(error.category, error.status, error.message);
    }
    throw error;
  }
  const { databaseUser, commerceCustomer } = await getOrCreateStripeCommerceCustomer(user);
  const commonMetadata = checkoutMetadata(databaseUser, commerceCustomer, pack);
  const session = await getStripeClient().checkout.sessions.create({
    mode: 'payment',
    customer: commerceCustomer.providerCustomerId,
    client_reference_id: databaseUser.id,
    line_items: [{ price: pack.stripePriceId, quantity: 1 }],
    success_url: `${origin}/billing/return?checkout=topup&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/credits?checkout=cancelled`,
    managed_payments: { enabled: false },
    metadata: commonMetadata
  });
  if (!session.url) throw new CommerceError('CHECKOUT_SESSION_UNAVAILABLE', 502, 'Stripe did not return a checkout URL.');
  return { url: session.url };
}

export async function createBillingPortalSession(user: SaviUser, origin: string) {
  const databaseUser = (await resolveSaviDatabaseUser(user)) as DatabaseUser;
  const commerceCustomer = await findCommerceCustomer(databaseUser.id);
  if (!commerceCustomer) {
    throw new CommerceError('BILLING_PROFILE_MISSING', 404, 'No Stripe billing profile exists for this SAVI account yet.');
  }

  const session = await getStripeClient().billingPortal.sessions.create({
    customer: commerceCustomer.providerCustomerId,
    return_url: `${origin}/settings`
  });
  return { url: session.url };
}

function checkoutMetadata(databaseUser: DatabaseUser, commerceCustomer: CommerceCustomer, item: CommercePlan | CommerceTopUpPack) {
  const credits = 'creditsGranted' in item ? item.creditsGranted : item.includedRecurringCredits;
  return {
    saviUserId: databaseUser.id,
    saviCommerceCustomerId: commerceCustomer.id,
    saviCatalogItemId: item.id,
    saviCatalogVersion: item.catalogVersion,
    saviCatalogKind: 'creditsGranted' in item ? 'topup' : 'subscription',
    saviCredits: String(credits)
  };
}

export async function handleStripeCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== 'payment') {
    if (session.mode === 'subscription' && stringId(session.subscription)) {
      const subscription = await getStripeClient().subscriptions.retrieve(stringId(session.subscription) as string, {
        expand: ['items.data.price']
      });
      return syncStripeSubscription(event, subscription);
    }
    return recordPaymentEvent({
      event,
      objectId: session.id,
      status: 'ignored',
      metadata: { reason: 'checkout_session_not_payment' }
    });
  }

  if (session.payment_status !== 'paid') {
    return recordPaymentEvent({
      event,
      objectId: session.id,
      status: 'ignored',
      metadata: { reason: 'checkout_session_not_paid', paymentStatus: session.payment_status }
    });
  }

  const hydrated = await getStripeClient().checkout.sessions.retrieve(session.id, {
    expand: ['line_items.data.price']
  });
  const priceId = firstLineItemPriceId(hydrated);
  const pack = getTopUpPackByStripePriceId(priceId);
  const providerCustomerId = stringId(hydrated.customer);
  const paymentIntentId = stringId(hydrated.payment_intent);
  const commerceCustomer = providerCustomerId ? await findCommerceCustomerByProviderId(providerCustomerId) : null;

  if (!pack || !commerceCustomer) {
    return recordPaymentEvent({
      event,
      objectId: session.id,
      userId: commerceCustomer?.userId ?? null,
      status: 'failed',
      errorMessage: 'Top-up checkout could not be matched to a configured SAVI catalog pack and billing profile.',
      metadata: { priceId, providerCustomerId, hasPack: Boolean(pack), hasCommerceCustomer: Boolean(commerceCustomer) }
    });
  }

  if (hydrated.currency?.toLowerCase() !== pack.currency || hydrated.amount_total !== pack.amountMinor) {
    return recordPaymentEvent({
      event,
      objectId: session.id,
      userId: commerceCustomer.userId,
      status: 'failed',
      errorMessage: 'Top-up payment did not match the approved SAVI catalog amount or currency.',
      metadata: {
        priceId,
        catalogItemId: pack.id,
        expectedCurrency: pack.currency,
        receivedCurrency: hydrated.currency,
        expectedAmountMinor: pack.amountMinor,
        receivedAmountMinor: hydrated.amount_total
      }
    });
  }

  const grantKey = topUpGrantKey({
    provider: PROVIDER,
    providerCheckoutSessionId: hydrated.id,
    providerPaymentIntentId: paymentIntentId
  });
  assertSafeCreditAmount(pack.creditsGranted, 'top-up credits');
  const eventMetadata = metadata({
    providerEventId: event.id,
    providerEventType: event.type,
    checkoutSessionId: hydrated.id,
    paymentIntentId,
    catalogItemId: pack.id,
    catalogVersion: pack.catalogVersion,
    creditsGranted: pack.creditsGranted
  });

  try {
    await dataConnectMutation('FulfillTopUpPurchase', {
      eventId: randomUUID(),
      purchaseId: randomUUID(),
      grantId: randomUUID(),
      ledgerTransactionId: randomUUID(),
      provider: PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      livemode: Boolean(event.livemode),
      objectId: hydrated.id,
      userId: commerceCustomer.userId,
      commerceCustomerId: commerceCustomer.id,
      purchaseType: 'topup',
      packId: pack.id,
      catalogVersion: pack.catalogVersion,
      providerCheckoutSessionId: hydrated.id,
      providerPaymentIntentId: paymentIntentId,
      currency: hydrated.currency ?? pack.currency,
      amountTotalMinor: hydrated.amount_total ?? pack.amountMinor,
      creditsGranted: pack.creditsGranted,
      grantKey,
      metadata: eventMetadata
    });
  } catch (error) {
    if (isDuplicateWrite(error)) {
      return recordPaymentEvent({
        event,
        objectId: hydrated.id,
        userId: commerceCustomer.userId,
        status: 'ignored',
        metadata: { reason: 'duplicate_topup_grant', grantKey }
      });
    }
    throw error;
  }

  return findPaymentEvent(event.id);
}

export async function syncStripeSubscription(event: Stripe.Event, subscriptionObject?: Stripe.Subscription, retryCount = 0): Promise<PaymentEvent | null> {
  const subscription = subscriptionObject ?? (event.data.object as Stripe.Subscription);
  const providerSubscriptionId = subscription.id;
  const providerCustomerId = stringId(subscription.customer);
  const priceId = firstLineItemPriceId(subscription);
  const plan = getPlanByStripePriceId(priceId);
  const commerceCustomer = providerCustomerId ? await findCommerceCustomerByProviderId(providerCustomerId) : null;

  if (!plan || !commerceCustomer) {
    return recordPaymentEvent({
      event,
      objectId: providerSubscriptionId,
      userId: commerceCustomer?.userId ?? null,
      status: 'failed',
      errorMessage: 'Subscription event could not be matched to a configured SAVI plan and billing profile.',
      metadata: { priceId, providerCustomerId, hasPlan: Boolean(plan), hasCommerceCustomer: Boolean(commerceCustomer) }
    });
  }

  const existing = await findCommerceSubscription(providerSubscriptionId);
  if (existing && isSubscriptionEventSuperseded(existing, event)) {
    return recordPaymentEvent({
      event,
      objectId: providerSubscriptionId,
      userId: commerceCustomer.userId,
      status: 'ignored',
      metadata: { reason: 'subscription_event_superseded', providerSubscriptionId }
    });
  }
  const record = asRecord(subscription);
  const firstItemRecord = asRecord(subscription.items?.data?.[0]);
  const currentPeriodStart =
    unixNumber(firstItemRecord.current_period_start) ?? unixNumber(record.current_period_start);
  const currentPeriodEnd =
    unixNumber(firstItemRecord.current_period_end) ?? unixNumber(record.current_period_end);
  const subscriptionMetadata = metadata({
    providerEventId: event.id,
    providerEventType: event.type,
    providerEventCreatedAt: providerEventCreatedAt(event),
    providerSubscriptionId,
    priceId,
    planId: plan.id,
    catalogVersion: plan.catalogVersion
  });
  const variables = {
    eventId: randomUUID(),
    provider: PROVIDER,
    providerEventId: event.id,
    eventType: event.type,
    livemode: Boolean(event.livemode),
    objectId: providerSubscriptionId,
    userId: commerceCustomer.userId,
    planId: plan.id,
    catalogVersion: plan.catalogVersion,
    status: normalizeSubscriptionStatus(subscription.status),
    providerStatus: subscription.status,
    currentPeriodStart: isoFromUnixSeconds(currentPeriodStart),
    currentPeriodEnd: isoFromUnixSeconds(currentPeriodEnd),
    cancelAtPeriodEnd: Boolean(record.cancel_at_period_end),
    canceledAt: isoFromUnixSeconds(unixNumber(record.canceled_at)),
    metadata: subscriptionMetadata
  };

  try {
    if (existing) {
      await dataConnectMutation('UpdateCommerceSubscriptionFromEvent', {
        ...variables,
        subscriptionId: existing.id,
        expectedUpdatedAt: existing.updatedAt
      });
    } else {
      await dataConnectMutation('CreateCommerceSubscriptionFromEvent', {
        ...variables,
        subscriptionId: randomUUID(),
        commerceCustomerId: commerceCustomer.id,
        providerSubscriptionId,
        providerCustomerId
      });
    }
  } catch (error) {
    if (existing && errorText(error).includes('subscription_state_changed') && retryCount === 0) {
      return syncStripeSubscription(event, subscription, retryCount + 1);
    }
    if (isDuplicateWrite(error)) {
      return recordPaymentEvent({
        event,
        objectId: providerSubscriptionId,
        userId: commerceCustomer.userId,
        status: 'ignored',
        metadata: { reason: 'duplicate_subscription_event', providerSubscriptionId }
      });
    }
    throw error;
  }

  return findPaymentEvent(event.id);
}

export async function handleStripeInvoicePaid(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const invoiceRecord = asRecord(invoice);
  const invoicePaid = typeof invoiceRecord.paid === 'boolean' ? invoiceRecord.paid : null;
  if (!shouldGrantSubscriptionCredits(typeof invoice.status === 'string' ? invoice.status : null, invoicePaid)) {
    return recordPaymentEvent({
      event,
      objectId: invoice.id,
      status: 'ignored',
      metadata: { reason: 'invoice_not_paid', invoiceStatus: invoice.status, paid: invoicePaid }
    });
  }

  const line = firstInvoiceLine(invoice);
  const priceId = firstLineItemPriceId({ line_items: { data: [line] } });
  const plan = getPlanByStripePriceId(priceId);
  const providerSubscriptionId =
    stringId(invoiceRecord.subscription) ?? stringId(asRecord(asRecord(line.parent).subscription_item_details).subscription);
  const providerCustomerId = stringId(invoice.customer);
  const commerceCustomer = providerCustomerId ? await findCommerceCustomerByProviderId(providerCustomerId) : null;
  let subscription = providerSubscriptionId ? await findCommerceSubscription(providerSubscriptionId) : null;

  if (!subscription && providerSubscriptionId) {
    const stripeSubscription = await getStripeClient().subscriptions.retrieve(providerSubscriptionId, {
      expand: ['items.data.price']
    });
    await syncStripeSubscription({ ...event, id: `${event.id}:subscription-sync` }, stripeSubscription);
    subscription = await findCommerceSubscription(providerSubscriptionId);
  }

  if (!plan || !commerceCustomer || !subscription || !providerSubscriptionId || !invoice.id) {
    return recordPaymentEvent({
      event,
      objectId: invoice.id ?? null,
      userId: commerceCustomer?.userId ?? null,
      status: 'failed',
      errorMessage: 'Subscription invoice could not be matched to a configured SAVI plan, subscription, and billing profile.',
      metadata: {
        priceId,
        providerSubscriptionId,
        providerCustomerId,
        hasPlan: Boolean(plan),
        hasCommerceCustomer: Boolean(commerceCustomer),
        hasSubscription: Boolean(subscription)
      }
    });
  }

  if (!canReceiveRecurringSubscriptionGrant(subscription.status, subscription.providerStatus)) {
    return recordPaymentEvent({
      event,
      objectId: invoice.id,
      userId: commerceCustomer.userId,
      status: 'ignored',
      metadata: {
        reason: 'subscription_not_entitled_for_recurring_grant',
        subscriptionStatus: subscription.status,
        providerStatus: subscription.providerStatus
      }
    });
  }

  const period = periodFromLine(line);
  const grantKey = subscriptionGrantKey({
    provider: PROVIDER,
    providerSubscriptionId,
    providerInvoiceId: invoice.id,
    billingPeriodStart: period.start,
    billingPeriodEnd: period.end
  });
  const creditAccount = await getAuthoritativeCreditAccountByUserId(commerceCustomer.userId);
  const outstandingSubscriptionCredits = creditAccount.subscriptionCredits + creditAccount.reservedSubscriptionCredits;
  const creditsGranted = calculateSubscriptionRenewalGrant({
    includedRecurringCredits: plan.includedRecurringCredits,
    rolloverCapCredits: plan.rolloverCapCredits,
    subscriptionCredits: creditAccount.subscriptionCredits,
    reservedSubscriptionCredits: creditAccount.reservedSubscriptionCredits
  });
  const grantStatus = creditsGranted > 0 ? 'granted' : 'capped';
  const ledgerReason = creditsGranted > 0 ? 'subscription_grant' : 'subscription_rollover_cap';

  try {
    await dataConnectMutation('FulfillSubscriptionCreditGrant', {
      eventId: randomUUID(),
      grantId: randomUUID(),
      ledgerTransactionId: randomUUID(),
      provider: PROVIDER,
      providerEventId: event.id,
      eventType: event.type,
      livemode: Boolean(event.livemode),
      objectId: invoice.id,
      userId: commerceCustomer.userId,
      subscriptionId: subscription.id,
      planId: plan.id,
      catalogVersion: plan.catalogVersion,
      providerInvoiceId: invoice.id,
      creditsGranted,
      expectedSubscriptionCredits: creditAccount.subscriptionCredits,
      expectedReservedSubscriptionCredits: creditAccount.reservedSubscriptionCredits,
      grantStatus,
      ledgerReason,
      grantKey,
      billingPeriodStart: period.start,
      billingPeriodEnd: period.end,
      metadata: metadata({
        providerEventId: event.id,
        providerEventType: event.type,
        providerInvoiceId: invoice.id,
        providerSubscriptionId,
        catalogItemId: plan.id,
        catalogVersion: plan.catalogVersion,
        creditsGranted,
        rolloverCapCredits: plan.rolloverCapCredits,
        subscriptionCreditsBeforeGrant: creditAccount.subscriptionCredits,
        reservedSubscriptionCreditsBeforeGrant: creditAccount.reservedSubscriptionCredits,
        outstandingSubscriptionCreditsBeforeGrant: outstandingSubscriptionCredits,
        grantStatus
      })
    });
  } catch (error) {
    if (isDuplicateWrite(error)) {
      return recordPaymentEvent({
        event,
        objectId: invoice.id,
        userId: commerceCustomer.userId,
        status: 'ignored',
        metadata: { reason: 'duplicate_subscription_grant', grantKey }
      });
    }
    throw error;
  }

  return findPaymentEvent(event.id);
}

async function resolveStripeDisputeLink(dispute: Record<string, unknown>, paymentIntentId: string | null): Promise<StripeDisputeLink> {
  if (!paymentIntentId) return { purchase: null, subscription: null, providerCustomerId: null };

  const purchase = await findCommercePurchaseByPaymentIntent(paymentIntentId);
  if (purchase) {
    const customer = await findCommerceCustomer(purchase.userId).catch(() => null);
    return {
      purchase,
      subscription: null,
      providerCustomerId: customer?.providerCustomerId ?? null
    };
  }

  const subscription = await findCommerceSubscriptionForDispute(dispute, paymentIntentId);
  return {
    purchase: null,
    subscription,
    providerCustomerId: subscription?.providerCustomerId ?? null
  };
}

export async function handleStripeDisputeEvent(event: Stripe.Event) {
  const existingPaymentEvent = await findPaymentEvent(event.id);
  if (existingPaymentEvent) return existingPaymentEvent;

  const dispute = asRecord(event.data.object);
  const disputeId = stringId(dispute.id);
  const paymentIntentId = stringId(dispute.payment_intent);
  const disputeStatus = typeof dispute.status === 'string' ? dispute.status : null;
  const outcome = disputeStatus === 'won' || disputeStatus === 'lost' ? disputeStatus : null;
  const link = await resolveStripeDisputeLink(dispute, paymentIntentId);
  const purchase = link.purchase;
  const subscription = link.subscription;
  const isClosed = event.type === 'charge.dispute.closed';
  const existingStatus = purchase?.status ?? null;
  const terminalOutcome = existingStatus === 'dispute_won' ? 'won' : existingStatus === 'dispute_lost' ? 'lost' : null;
  const purchaseStatus = purchase
    ? isFinalDisputePurchaseStatus(existingStatus ?? '')
      ? existingStatus
      : isClosed && outcome
        ? `dispute_${outcome}`
        : 'disputed'
    : null;
  const reviewRequired = outcome !== 'won';

  if (purchase && purchaseStatus) {
    const currentMetadata = parseMetadata(purchase.metadata);
    const currentHistory = Array.isArray(currentMetadata.disputeEventHistory)
      ? currentMetadata.disputeEventHistory.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      : [];
    const historyEntry = {
      eventId: event.id,
      eventType: event.type,
      disputeId,
      paymentIntentId,
      status: disputeStatus,
      outcome
    };
    const terminalHistoryEntry = terminalOutcome
      ? [...currentHistory].reverse().find((entry) => entry.eventType === 'charge.dispute.closed' && entry.outcome === terminalOutcome)
      : null;
    const nextMetadata = metadata({
      ...currentMetadata,
      disputeId,
      disputePaymentIntentId: paymentIntentId,
      disputeStatus: terminalOutcome ?? disputeStatus,
      disputeOutcome: terminalOutcome ?? outcome,
      disputeReviewRequired: terminalOutcome ? terminalOutcome === 'lost' : reviewRequired,
      disputeEventType: terminalHistoryEntry?.eventType ?? (terminalOutcome ? currentMetadata.disputeEventType : event.type),
      disputeEventId: terminalHistoryEntry?.eventId ?? (terminalOutcome ? currentMetadata.disputeEventId : event.id),
      disputeEventHistory: [...currentHistory.filter((entry) => entry.eventId !== event.id), historyEntry]
    });

    if (purchaseStatus !== existingStatus || nextMetadata !== purchase.metadata) {
      return recordPaymentEventWithPurchaseStatus({
        event,
        objectId: disputeId,
        purchase,
        expectedStatus: existingStatus ?? purchase.status,
        nextStatus: purchaseStatus,
        metadata: parseMetadata(nextMetadata)
      });
    }
  }

  return recordPaymentEvent({
    event,
    objectId: disputeId,
    userId: purchase?.userId ?? subscription?.userId ?? null,
    status: 'processed',
    metadata: {
      reason: 'recorded_dispute',
      disputeId,
      paymentIntentId,
      disputeStatus,
      disputeOutcome: outcome,
      disputeReviewRequired: reviewRequired,
      purchaseId: purchase?.id ?? null,
      subscriptionId: subscription?.id ?? null,
      providerSubscriptionId: subscription?.providerSubscriptionId ?? null,
      providerCustomerId: link.providerCustomerId
    }
  });
}

export async function recordStripeEventOnly(event: Stripe.Event, status: 'processed' | 'ignored' | 'failed', reason: string) {
  const object = asRecord(event.data.object);
  const paymentIntentId = stringId(object.payment_intent);
  if (status === 'processed' && (reason === 'recorded_refund' || reason === 'recorded_dispute') && paymentIntentId) {
    const purchase = await findCommercePurchaseByPaymentIntent(paymentIntentId);
    if (purchase && !['refunded', 'disputed', 'dispute_won', 'dispute_lost'].includes(purchase.status)) {
      return recordPaymentEventWithPurchaseStatus({
        event,
        objectId: typeof object.id === 'string' ? object.id : null,
        purchase,
        expectedStatus: purchase.status,
        nextStatus: reason === 'recorded_refund' ? 'refunded' : 'disputed',
        metadata: {
          previousStatus: purchase.status,
          providerEventId: event.id,
          providerEventType: event.type,
          paymentIntentId,
          reason
        }
      });
    }
  }
  return recordPaymentEvent({
    event,
    objectId: typeof object.id === 'string' ? object.id : null,
    status,
    metadata: { reason }
  });
}

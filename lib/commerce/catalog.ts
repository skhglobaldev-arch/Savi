export const SAVI_COMMERCE_CATALOG_VERSION = '2026-09-savi-commerce-v1';
export const SAVI_FREE_WELCOME_CREDITS = 300;

export type CommerceProvider = 'stripe' | 'apple' | 'internal';
export type CommerceCatalogStatus = 'draft' | 'active' | 'archived';
export type SubscriptionInterval = 'month' | 'year';
export type CommerceEntitlement = 'standard_tools' | 'priority_generation' | 'team_billing';

export type CommercePlan = {
  id: string;
  displayName: string;
  provider: 'stripe' | 'internal';
  stripeProductId: string;
  stripePriceId: string;
  billingInterval: SubscriptionInterval;
  currency: string;
  amountMinor: number;
  priceDisplay: string;
  includedRecurringCredits: number;
  oneTimeWelcomeCredits: number;
  rolloverCapCredits: number;
  entitlements: CommerceEntitlement[];
  recommended: boolean;
  status: CommerceCatalogStatus;
  catalogVersion: string;
};

export type CommerceTopUpPack = {
  id: string;
  displayName: string;
  provider: 'stripe';
  stripeProductId: string;
  stripePriceId: string;
  currency: string;
  amountMinor: number;
  priceDisplay: string;
  creditsGranted: number;
  status: CommerceCatalogStatus;
  catalogVersion: string;
};

export type CustomerSafeCommercePlan = Omit<CommercePlan, 'stripeProductId' | 'stripePriceId' | 'amountMinor'> & {
  checkoutAvailable: boolean;
};

export type CustomerSafeTopUpPack = Omit<CommerceTopUpPack, 'stripeProductId' | 'stripePriceId' | 'amountMinor'> & {
  checkoutAvailable: boolean;
};

export class CommerceCatalogError extends Error {
  constructor(
    readonly category: 'COMMERCE_NOT_CONFIGURED' | 'UNKNOWN_CATALOG_ITEM' | 'INACTIVE_CATALOG_ITEM' | 'INVALID_CATALOG',
    readonly status: 400 | 404 | 503,
    message: string
  ) {
    super(message);
    this.name = 'CommerceCatalogError';
  }
}

const DEFAULT_PLANS = [
  {
    id: 'free',
    displayName: 'Free',
    provider: 'internal',
    stripeProductId: '',
    stripePriceId: '',
    billingInterval: 'month',
    currency: 'gbp',
    amountMinor: 0,
    priceDisplay: '£0',
    includedRecurringCredits: 0,
    oneTimeWelcomeCredits: SAVI_FREE_WELCOME_CREDITS,
    rolloverCapCredits: 0,
    entitlements: ['standard_tools'],
    recommended: false,
    status: 'active',
    catalogVersion: SAVI_COMMERCE_CATALOG_VERSION
  },
  {
    id: 'starter',
    displayName: 'Starter',
    provider: 'stripe',
    stripeProductId: '',
    stripePriceId: '',
    billingInterval: 'month',
    currency: 'gbp',
    amountMinor: 999,
    priceDisplay: '£9.99',
    includedRecurringCredits: 3000,
    oneTimeWelcomeCredits: 0,
    rolloverCapCredits: 6000,
    entitlements: ['standard_tools'],
    recommended: false,
    status: 'active',
    catalogVersion: SAVI_COMMERCE_CATALOG_VERSION
  },
  {
    id: 'creator',
    displayName: 'Creator',
    provider: 'stripe',
    stripeProductId: '',
    stripePriceId: '',
    billingInterval: 'month',
    currency: 'gbp',
    amountMinor: 1999,
    priceDisplay: '£19.99',
    includedRecurringCredits: 7500,
    oneTimeWelcomeCredits: 0,
    rolloverCapCredits: 15000,
    entitlements: ['standard_tools', 'priority_generation'],
    recommended: true,
    status: 'active',
    catalogVersion: SAVI_COMMERCE_CATALOG_VERSION
  },
  {
    id: 'pro',
    displayName: 'Pro',
    provider: 'stripe',
    stripeProductId: '',
    stripePriceId: '',
    billingInterval: 'month',
    currency: 'gbp',
    amountMinor: 3999,
    priceDisplay: '£39.99',
    includedRecurringCredits: 17500,
    oneTimeWelcomeCredits: 0,
    rolloverCapCredits: 35000,
    entitlements: ['standard_tools', 'priority_generation', 'team_billing'],
    recommended: false,
    status: 'active',
    catalogVersion: SAVI_COMMERCE_CATALOG_VERSION
  }
];

const DEFAULT_TOP_UPS = [
  { id: 'topup-1000', displayName: '1,000 credits', stripeProductId: '', stripePriceId: '', currency: 'gbp', amountMinor: 499, priceDisplay: '£4.99', creditsGranted: 1000, status: 'active', catalogVersion: SAVI_COMMERCE_CATALOG_VERSION },
  { id: 'topup-3000', displayName: '3,000 credits', stripeProductId: '', stripePriceId: '', currency: 'gbp', amountMinor: 1299, priceDisplay: '£12.99', creditsGranted: 3000, status: 'active', catalogVersion: SAVI_COMMERCE_CATALOG_VERSION },
  { id: 'topup-7500', displayName: '7,500 credits', stripeProductId: '', stripePriceId: '', currency: 'gbp', amountMinor: 2799, priceDisplay: '£27.99', creditsGranted: 7500, status: 'active', catalogVersion: SAVI_COMMERCE_CATALOG_VERSION },
  { id: 'topup-15000', displayName: '15,000 credits', stripeProductId: '', stripePriceId: '', currency: 'gbp', amountMinor: 4999, priceDisplay: '£49.99', creditsGranted: 15000, status: 'active', catalogVersion: SAVI_COMMERCE_CATALOG_VERSION }
];

function parseJsonArray(name: string, fallback: unknown[]) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Handled below with a stable public error.
  }
  throw new CommerceCatalogError('INVALID_CATALOG', 503, `${name} must be a JSON array.`);
}

function safeId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{2,80}$/.test(value) ? value : '';
}

function safeString(value: unknown, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function approvedCatalogVersion(value: unknown) {
  const version = safeString(value, 80);
  if (version && version !== SAVI_COMMERCE_CATALOG_VERSION) {
    throw new CommerceCatalogError('INVALID_CATALOG', 503, `Commerce catalog version must be ${SAVI_COMMERCE_CATALOG_VERSION}.`);
  }
  return SAVI_COMMERCE_CATALOG_VERSION;
}

function safeNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safePositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function safeStatus(value: unknown): CommerceCatalogStatus {
  return value === 'active' || value === 'archived' ? value : 'draft';
}

function safeCurrency(value: unknown) {
  const currency = safeString(value, 12).toLowerCase();
  return /^[a-z]{3}$/.test(currency) ? currency : '';
}

function safeInterval(value: unknown): SubscriptionInterval {
  return value === 'year' ? 'year' : 'month';
}

function safeEntitlements(value: unknown): CommerceEntitlement[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<CommerceEntitlement>(['standard_tools', 'priority_generation', 'team_billing']);
  return value.filter((item): item is CommerceEntitlement => allowed.has(item as CommerceEntitlement));
}

function safePlanProvider(value: unknown): CommercePlan['provider'] | null {
  return value === 'stripe' || value === 'internal' ? value : null;
}

function normalizePlan(value: unknown): CommercePlan | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const provider = safePlanProvider(item.provider);
  if (!provider) return null;
  const plan: CommercePlan = {
    id: safeId(item.id),
    displayName: safeString(item.displayName),
    provider,
    stripeProductId: safeString(item.stripeProductId),
    stripePriceId: safeString(item.stripePriceId),
    billingInterval: safeInterval(item.billingInterval),
    currency: safeCurrency(item.currency),
    amountMinor: safeNonNegativeInteger(item.amountMinor),
    priceDisplay: safeString(item.priceDisplay, 80),
    includedRecurringCredits: safeNonNegativeInteger(item.includedRecurringCredits),
    oneTimeWelcomeCredits: safeNonNegativeInteger(item.oneTimeWelcomeCredits),
    rolloverCapCredits: safeNonNegativeInteger(item.rolloverCapCredits),
    entitlements: safeEntitlements(item.entitlements),
    recommended: item.recommended === true,
    status: safeStatus(item.status),
    catalogVersion: approvedCatalogVersion(item.catalogVersion)
  };
  if (!plan.id || !plan.displayName) return null;
  return plan;
}

function normalizePack(value: unknown): CommerceTopUpPack | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const pack: CommerceTopUpPack = {
    id: safeId(item.id),
    displayName: safeString(item.displayName),
    provider: 'stripe',
    stripeProductId: safeString(item.stripeProductId),
    stripePriceId: safeString(item.stripePriceId),
    currency: safeCurrency(item.currency),
    amountMinor: safePositiveInteger(item.amountMinor),
    priceDisplay: safeString(item.priceDisplay, 80),
    creditsGranted: safePositiveInteger(item.creditsGranted),
    status: safeStatus(item.status),
    catalogVersion: approvedCatalogVersion(item.catalogVersion)
  };
  if (!pack.id || !pack.displayName) return null;
  return pack;
}

function ensurePlanDisplayReady(plan: CommercePlan) {
  if (plan.status !== 'active' || !plan.currency || !plan.priceDisplay || plan.amountMinor < 0) return false;
  if (plan.provider === 'internal') {
    return plan.amountMinor === 0 && plan.includedRecurringCredits === 0 && plan.oneTimeWelcomeCredits > 0;
  }
  return plan.includedRecurringCredits > 0 && plan.rolloverCapCredits >= plan.includedRecurringCredits;
}

function ensureActivePlanConfigured(plan: CommercePlan) {
  return Boolean(ensurePlanDisplayReady(plan) && plan.provider === 'stripe' && plan.stripeProductId && plan.stripePriceId);
}

function ensurePackDisplayReady(pack: CommerceTopUpPack) {
  return pack.status === 'active' && Boolean(pack.currency && pack.amountMinor > 0 && pack.priceDisplay && pack.creditsGranted > 0);
}

function ensureActivePackConfigured(pack: CommerceTopUpPack) {
  return Boolean(ensurePackDisplayReady(pack) && pack.stripeProductId && pack.stripePriceId);
}

function ensureWebhookPlanConfigured(plan: CommercePlan) {
  return (plan.status === 'active' || plan.status === 'archived') && plan.provider === 'stripe' && plan.includedRecurringCredits > 0 && plan.rolloverCapCredits >= plan.includedRecurringCredits && Boolean(plan.stripePriceId);
}

function ensureWebhookPackConfigured(pack: CommerceTopUpPack) {
  return (pack.status === 'active' || pack.status === 'archived') && Boolean(pack.stripePriceId && pack.creditsGranted > 0);
}

export function getCommerceCatalog() {
  const plans = parseJsonArray('SAVI_COMMERCE_PLANS_JSON', DEFAULT_PLANS).map(normalizePlan).filter((item): item is CommercePlan => Boolean(item));
  const topUpPacks = parseJsonArray('SAVI_COMMERCE_TOPUPS_JSON', DEFAULT_TOP_UPS).map(normalizePack).filter((item): item is CommerceTopUpPack => Boolean(item));
  approvedCatalogVersion(process.env.SAVI_COMMERCE_CATALOG_VERSION);
  const missingStripePriceIds =
    plans.filter((plan) => plan.provider === 'stripe' && plan.status === 'active').some((plan) => !ensureActivePlanConfigured(plan)) ||
    topUpPacks.filter((pack) => pack.status === 'active').some((pack) => !ensureActivePackConfigured(pack));
  return {
    version: SAVI_COMMERCE_CATALOG_VERSION,
    plans,
    topUpPacks,
    productDecisionRequired: {
      prices: false,
      stripePriceIds: missingStripePriceIds,
      creditRollover: false,
      refunds: false
    }
  };
}

export function customerSafeCommerceCatalog() {
  const catalog = getCommerceCatalog();
  return {
    version: catalog.version,
    plans: catalog.plans.map((plan): CustomerSafeCommercePlan => ({
      id: plan.id,
      displayName: plan.displayName,
      provider: plan.provider,
      billingInterval: plan.billingInterval,
      currency: plan.currency,
      priceDisplay: plan.priceDisplay,
      includedRecurringCredits: plan.includedRecurringCredits,
      oneTimeWelcomeCredits: plan.oneTimeWelcomeCredits,
      rolloverCapCredits: plan.rolloverCapCredits,
      entitlements: plan.entitlements,
      recommended: plan.recommended,
      status: plan.status,
      catalogVersion: plan.catalogVersion,
      checkoutAvailable: ensureActivePlanConfigured(plan)
    })),
    topUpPacks: catalog.topUpPacks.map((pack): CustomerSafeTopUpPack => ({
      id: pack.id,
      displayName: pack.displayName,
      provider: 'stripe',
      currency: pack.currency,
      priceDisplay: pack.priceDisplay,
      creditsGranted: pack.creditsGranted,
      status: pack.status,
      catalogVersion: pack.catalogVersion,
      checkoutAvailable: ensureActivePackConfigured(pack)
    })),
    productDecisionRequired: catalog.productDecisionRequired
  };
}

export function getActiveCommercePlan(planId: string) {
  const plan = getCommerceCatalog().plans.find((item) => item.id === planId);
  if (!plan) throw new CommerceCatalogError('UNKNOWN_CATALOG_ITEM', 404, 'This SAVI plan is not available.');
  if (!ensureActivePlanConfigured(plan)) {
    throw new CommerceCatalogError('INACTIVE_CATALOG_ITEM', 503, 'This SAVI plan is not configured for checkout yet.');
  }
  return plan;
}

export function getActiveTopUpPack(packId: string) {
  const pack = getCommerceCatalog().topUpPacks.find((item) => item.id === packId);
  if (!pack) throw new CommerceCatalogError('UNKNOWN_CATALOG_ITEM', 404, 'This SAVI credit pack is not available.');
  if (!ensureActivePackConfigured(pack)) {
    throw new CommerceCatalogError('INACTIVE_CATALOG_ITEM', 503, 'This SAVI credit pack is not configured for checkout yet.');
  }
  return pack;
}

export function getPlanByStripePriceId(priceId: string | null | undefined) {
  if (!priceId) return null;
  return getCommerceCatalog().plans.find((plan) => plan.stripePriceId === priceId && ensureWebhookPlanConfigured(plan)) ?? null;
}

export function getTopUpPackByStripePriceId(priceId: string | null | undefined) {
  if (!priceId) return null;
  return getCommerceCatalog().topUpPacks.find((pack) => pack.stripePriceId === priceId && ensureWebhookPackConfigured(pack)) ?? null;
}

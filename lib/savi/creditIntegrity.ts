export const MAX_SAVI_CREDIT_AMOUNT = 10_000_000;

// Requests are synchronous today. Thirty minutes is deliberately far beyond a
// normal provider request while keeping a failed settlement recoverable.
export const STALE_RESERVATION_THRESHOLD_MS = 30 * 60 * 1000;

export type CreditAccountSnapshot = {
  availableCredits: number;
  reservedCredits: number;
  subscriptionCredits: number;
  reservedSubscriptionCredits: number;
};

export type ReservationLifecycle = 'ACTIVE' | 'FINALIZED' | 'RELEASED' | 'STALE_RECONCILABLE' | 'MANUAL_REVIEW_REQUIRED';

export type ReservationIntegrityRecord = {
  reservationStatus: string;
  jobStatus: string;
  reservationCreatedAt: string | Date;
  amount: number;
  subscriptionCredits: number;
  assetPresent: boolean;
};

export class CreditIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreditIntegrityError';
  }
}

export function isSafeCreditAmount(value: unknown, { allowZero = false }: { allowZero?: boolean } = {}) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value <= MAX_SAVI_CREDIT_AMOUNT && (allowZero ? value >= 0 : value > 0);
}

export function assertSafeCreditAmount(value: unknown, label: string, options?: { allowZero?: boolean }) {
  if (!isSafeCreditAmount(value, options)) {
    throw new CreditIntegrityError(`${label} must be a safe ${options?.allowZero ? 'non-negative' : 'positive'} credit amount.`);
  }
  return value as number;
}

export function assertReservationAmounts(credits: unknown, subscriptionCredits: unknown) {
  const total = assertSafeCreditAmount(credits, 'credits');
  const subscription = assertSafeCreditAmount(subscriptionCredits, 'subscriptionCredits', { allowZero: true });
  if (subscription > total) throw new CreditIntegrityError('subscriptionCredits cannot exceed reserved credits.');
  return { credits: total, subscriptionCredits: subscription };
}

export function isCreditAccountConsistent(account: CreditAccountSnapshot) {
  const values = [
    account.availableCredits,
    account.reservedCredits,
    account.subscriptionCredits,
    account.reservedSubscriptionCredits
  ];
  return values.every((value) => isSafeCreditAmount(value, { allowZero: true })) &&
    account.subscriptionCredits <= account.availableCredits &&
    account.reservedSubscriptionCredits <= account.reservedCredits &&
    account.subscriptionCredits + account.reservedSubscriptionCredits <= account.availableCredits + account.reservedCredits;
}

export function classifyReservationLifecycle(record: ReservationIntegrityRecord, now = new Date()): ReservationLifecycle {
  const createdAt = new Date(record.reservationCreatedAt).getTime();
  const ageMs = Number.isFinite(createdAt) ? now.getTime() - createdAt : Number.NaN;
  const isOldEnough = Number.isFinite(ageMs) && ageMs >= STALE_RESERVATION_THRESHOLD_MS;
  const amountsValid = isSafeCreditAmount(record.amount) && isSafeCreditAmount(record.subscriptionCredits, { allowZero: true }) && record.subscriptionCredits <= record.amount;

  if (record.reservationStatus === 'finalized' && record.jobStatus === 'completed') return 'FINALIZED';
  if (record.reservationStatus === 'released' && record.jobStatus === 'failed') return 'RELEASED';
  if (record.reservationStatus !== 'reserved' || !amountsValid) return 'MANUAL_REVIEW_REQUIRED';

  if (record.jobStatus === 'processing' && !isOldEnough) return 'ACTIVE';
  if (record.assetPresent) return 'MANUAL_REVIEW_REQUIRED';
  if (isOldEnough && (record.jobStatus === 'failed' || record.jobStatus === 'reconciliation_pending')) return 'STALE_RECONCILABLE';

  // An old processing job has no durable proof that its provider operation did
  // not succeed. It must be reviewed rather than refunded automatically.
  return 'MANUAL_REVIEW_REQUIRED';
}

export function calculateSubscriptionRenewalGrant(input: {
  includedRecurringCredits: number;
  rolloverCapCredits: number;
  subscriptionCredits: number;
  reservedSubscriptionCredits: number;
}) {
  const included = assertSafeCreditAmount(input.includedRecurringCredits, 'includedRecurringCredits', { allowZero: true });
  const cap = assertSafeCreditAmount(input.rolloverCapCredits, 'rolloverCapCredits', { allowZero: true });
  const available = assertSafeCreditAmount(input.subscriptionCredits, 'subscriptionCredits', { allowZero: true });
  const reserved = assertSafeCreditAmount(input.reservedSubscriptionCredits, 'reservedSubscriptionCredits', { allowZero: true });
  return Math.min(included, Math.max(0, cap - available - reserved));
}

import { randomUUID } from 'node:crypto';
import { getSaviDataConnect } from '@/lib/firebase/admin';
import {
  classifyReservationLifecycle,
  isCreditAccountConsistent,
  STALE_RESERVATION_THRESHOLD_MS,
  type CreditAccountSnapshot,
  type ReservationIntegrityRecord,
  type ReservationLifecycle
} from '@/lib/savi/creditIntegrity';

type ReconciliationReservation = ReservationIntegrityRecord & {
  id: string;
  jobId: string;
  userId: string;
  job: {
    jobStatus: string;
    toolId: string;
    provider: string;
    model: string;
    providerRequestId?: string | null;
    assetPresent: { id: string } | null;
  };
};

export type ReservationReconciliationCandidate = ReconciliationReservation & {
  classification: ReservationLifecycle;
};

export type CreditIntegrityDiagnostics = {
  staleReservations: ReservationReconciliationCandidate[];
  manualReviewReservations: ReservationReconciliationCandidate[];
  impossibleAccounts: Array<CreditAccountSnapshot & { userId: string }>;
  reservationJobMismatches: ReservationReconciliationCandidate[];
  purchasePaymentMismatches: string[];
  subscriptionMismatches: string[];
};

function reconciliationEnabled() {
  return process.env.SAVI_CREDIT_RECONCILIATION_ENABLED === 'true';
}

function metadata(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

async function query<T, Variables extends object>(operation: string, variables: Variables) {
  const response = await getSaviDataConnect().executeQuery<T, Variables>(operation, variables);
  return response.data;
}

async function mutation<T, Variables extends object>(operation: string, variables: Variables) {
  const response = await getSaviDataConnect().executeMutation<T, Variables>(operation, variables);
  return response.data;
}

export async function inspectCreditIntegrity(now = new Date()): Promise<CreditIntegrityDiagnostics> {
  const cutoff = new Date(now.getTime() - STALE_RESERVATION_THRESHOLD_MS).toISOString();
  const data = await query<{
    creditReservations?: Array<Omit<ReconciliationReservation, 'classification'>>;
    creditAccounts?: Array<CreditAccountSnapshot & { userId: string }>;
    commercePurchases?: Array<{ id: string; providerPaymentIntentId?: string | null; providerCheckoutSessionId?: string | null; status: string }>;
    paymentEvents?: Array<{ objectId?: string | null; eventType: string }>;
    commerceSubscriptions?: Array<{ providerSubscriptionId: string; status: string; providerStatus: string }>;
  }, { cutoff: string }>('GetCreditIntegrityDiagnostics', { cutoff });

  const candidates = (data.creditReservations ?? []).map((reservation) => {
    const normalized = {
      ...reservation,
      reservationStatus: reservation.reservationStatus,
      jobStatus: reservation.job.jobStatus,
      assetPresent: Boolean(reservation.job.assetPresent)
    };
    return { ...normalized, classification: classifyReservationLifecycle(normalized, now) };
  });
  const staleReservations = candidates.filter((candidate) => candidate.classification === 'STALE_RECONCILABLE');
  const manualReviewReservations = candidates.filter((candidate) => candidate.classification === 'MANUAL_REVIEW_REQUIRED');
  const impossibleAccounts = (data.creditAccounts ?? []).filter((account) => !isCreditAccountConsistent(account));
  const reservationJobMismatches = candidates.filter((candidate) =>
    (candidate.reservationStatus === 'reserved' && !['processing', 'reconciliation_pending', 'failed'].includes(candidate.jobStatus)) ||
    (candidate.reservationStatus === 'finalized' && candidate.jobStatus !== 'completed') ||
    (candidate.reservationStatus === 'released' && candidate.jobStatus !== 'failed')
  );
  const paymentObjectIds = new Set((data.paymentEvents ?? []).map((event) => event.objectId).filter((value): value is string => Boolean(value)));
  const purchasePaymentMismatches = (data.commercePurchases ?? [])
    .filter((purchase) =>
      (purchase.providerPaymentIntentId || purchase.providerCheckoutSessionId) &&
      !paymentObjectIds.has(purchase.providerPaymentIntentId ?? '') &&
      !paymentObjectIds.has(purchase.providerCheckoutSessionId ?? '')
    )
    .map((purchase) => purchase.id);
  const subscriptionMismatches = (data.commerceSubscriptions ?? [])
    .filter((subscription) => subscription.status === 'active' && !['active', 'trialing'].includes(subscription.providerStatus))
    .map((subscription) => subscription.providerSubscriptionId);

  return { staleReservations, manualReviewReservations, impossibleAccounts, reservationJobMismatches, purchasePaymentMismatches, subscriptionMismatches };
}

/**
 * Intentionally has no route or scheduler. An operator must opt in explicitly
 * after reviewing inspectCreditIntegrity() output.
 */
export async function reconcileStaleReservation(candidate: ReservationReconciliationCandidate) {
  if (!reconciliationEnabled()) throw new Error('SAVI_CREDIT_RECONCILIATION_ENABLED is required.');
  if (candidate.classification !== 'STALE_RECONCILABLE') throw new Error('Only a stale, reconcilable reservation can be released.');

  await mutation('ReconcileStaleGenerationReservation', {
    jobId: candidate.jobId,
    reservationId: candidate.id,
    userId: candidate.userId,
    credits: candidate.amount,
    subscriptionCredits: candidate.subscriptionCredits,
    releaseTransactionId: randomUUID(),
    releaseEventKey: `reconciliation_release:${candidate.id}`,
    usageId: randomUUID(),
    toolId: candidate.job.toolId,
    provider: candidate.job.provider,
    model: candidate.job.model,
    providerRequestId: candidate.job.providerRequestId ?? null,
    metadata: metadata({ source: 'stale_reservation_reconciliation', classification: candidate.classification })
  });
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertReservationAmounts,
  assertSafeCreditAmount,
  calculateSubscriptionRenewalGrant,
  classifyReservationLifecycle,
  CreditIntegrityError,
  isCreditAccountConsistent,
  STALE_RESERVATION_THRESHOLD_MS
} from './creditIntegrity.ts';

const now = new Date('2026-09-14T12:00:00.000Z');
const staleAt = new Date(now.getTime() - STALE_RESERVATION_THRESHOLD_MS - 1).toISOString();
const activeAt = new Date(now.getTime() - STALE_RESERVATION_THRESHOLD_MS + 1).toISOString();

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    reservationStatus: 'reserved',
    jobStatus: 'processing',
    reservationCreatedAt: activeAt,
    amount: 25,
    subscriptionCredits: 10,
    assetPresent: false,
    ...overrides
  } as Parameters<typeof classifyReservationLifecycle>[0];
}

test('credit account invariants preserve subscription provenance', () => {
  assert.equal(isCreditAccountConsistent({ availableCredits: 1300, reservedCredits: 35, subscriptionCredits: 900, reservedSubscriptionCredits: 20 }), true);
  assert.equal(isCreditAccountConsistent({ availableCredits: -1, reservedCredits: 0, subscriptionCredits: 0, reservedSubscriptionCredits: 0 }), false);
  assert.equal(isCreditAccountConsistent({ availableCredits: 10, reservedCredits: 5, subscriptionCredits: 11, reservedSubscriptionCredits: 0 }), false);
  assert.equal(isCreditAccountConsistent({ availableCredits: 10, reservedCredits: 5, subscriptionCredits: 5, reservedSubscriptionCredits: 6 }), false);
});

test('arithmetic guards reject negative, overflow, and invalid reservation provenance', () => {
  assert.throws(() => assertSafeCreditAmount(-1, 'credits'), CreditIntegrityError);
  assert.throws(() => assertSafeCreditAmount(Number.MAX_SAFE_INTEGER, 'credits'), CreditIntegrityError);
  assert.throws(() => assertReservationAmounts(25, 26), CreditIntegrityError);
  assert.deepEqual(assertReservationAmounts(25, 10), { credits: 25, subscriptionCredits: 10 });
});

test('reservation lifecycle classification is conservative', () => {
  assert.equal(classifyReservationLifecycle(reservation(), now), 'ACTIVE');
  assert.equal(classifyReservationLifecycle(reservation({ reservationStatus: 'finalized', jobStatus: 'completed', assetPresent: true }), now), 'FINALIZED');
  assert.equal(classifyReservationLifecycle(reservation({ reservationStatus: 'released', jobStatus: 'failed' }), now), 'RELEASED');
  assert.equal(classifyReservationLifecycle(reservation({ jobStatus: 'reconciliation_pending', reservationCreatedAt: staleAt }), now), 'STALE_RECONCILABLE');
  assert.equal(classifyReservationLifecycle(reservation({ jobStatus: 'failed', reservationCreatedAt: staleAt }), now), 'STALE_RECONCILABLE');
  assert.equal(classifyReservationLifecycle(reservation({ reservationCreatedAt: staleAt }), now), 'MANUAL_REVIEW_REQUIRED');
  assert.equal(classifyReservationLifecycle(reservation({ reservationCreatedAt: staleAt, assetPresent: true, jobStatus: 'reconciliation_pending' }), now), 'MANUAL_REVIEW_REQUIRED');
  assert.equal(classifyReservationLifecycle(reservation({ reservationStatus: 'finalized', jobStatus: 'failed' }), now), 'MANUAL_REVIEW_REQUIRED');
});

test('rollover cap applies only to subscription credits, including reserved subscription credits', () => {
  assert.equal(calculateSubscriptionRenewalGrant({ includedRecurringCredits: 3000, rolloverCapCredits: 6000, subscriptionCredits: 0, reservedSubscriptionCredits: 0 }), 3000);
  assert.equal(calculateSubscriptionRenewalGrant({ includedRecurringCredits: 7500, rolloverCapCredits: 15000, subscriptionCredits: 9000, reservedSubscriptionCredits: 1000 }), 5000);
  assert.equal(calculateSubscriptionRenewalGrant({ includedRecurringCredits: 17500, rolloverCapCredits: 35000, subscriptionCredits: 35000, reservedSubscriptionCredits: 0 }), 0);
  assert.equal(calculateSubscriptionRenewalGrant({ includedRecurringCredits: 3000, rolloverCapCredits: 6000, subscriptionCredits: 6100, reservedSubscriptionCredits: 0 }), 0);
});

test('release failure has a private reconciliation marker and no public route', () => {
  const protectedOperations = readFileSync(new URL('./protectedOperations.ts', import.meta.url), 'utf8');
  const textToImage = readFileSync(new URL('./textToImageInfrastructure.ts', import.meta.url), 'utf8');
  const reconciliation = readFileSync(new URL('./creditReconciliation.ts', import.meta.url), 'utf8');
  assert.match(protectedOperations, /MarkGenerationJobForReconciliation/);
  assert.match(textToImage, /MarkGenerationJobForReconciliation/);
  assert.match(reconciliation, /SAVI_CREDIT_RECONCILIATION_ENABLED/);
  assert.doesNotMatch(reconciliation, /NextResponse|app\/api|export async function POST/);
});

test('stale repair uses a deterministic event key and cannot create credits', () => {
  const reconciliation = readFileSync(new URL('./creditReconciliation.ts', import.meta.url), 'utf8');
  const operations = readFileSync(new URL('../../dataconnect/savi/operations.gql', import.meta.url), 'utf8');
  assert.match(reconciliation, /reconciliation_release:\$\{candidate\.id\}/);
  assert.match(operations, /mutation ReconcileStaleGenerationReservation/);
  assert.match(operations, /availableCredits_update: \{ inc: \$credits \}/);
  assert.match(operations, /reservedCredits_update: \{ dec: \$credits \}/);
  assert.match(operations, /status: "reconciliation_pending"/);
});

test('reservation mutations remain transactional, amount-bound, and idempotent', () => {
  const operations = readFileSync(new URL('../../dataconnect/savi/operations.gql', import.meta.url), 'utf8');
  assert.match(operations, /mutation ReserveGenerationJob[\s\S]*availableCredits: \{ ge: \$credits \}/);
  assert.match(operations, /mutation FinalizeGenerationJob[\s\S]*amount: \{ eq: \$credits \}[\s\S]*subscriptionCredits: \{ eq: \$subscriptionCredits \}/);
  assert.match(operations, /mutation ReleaseGenerationReservation[\s\S]*status: "released"[\s\S]*@check\(expr: "this == 1"/);
  assert.match(operations, /mutation ReconcileStaleGenerationReservation[\s\S]*@transaction[\s\S]*eventKey: \$releaseEventKey/);
});

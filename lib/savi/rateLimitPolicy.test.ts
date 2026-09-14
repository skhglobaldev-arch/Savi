import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateSaviRateLimitRecord,
  getSaviRateLimitPolicy,
  missingSaviRateLimitDecision,
  unavailableSaviRateLimitDecision,
  type SaviRateLimitRecord
} from './rateLimitPolicy.ts';

test('anonymous AUTH fallback remains bounded and permits a normal callback', () => {
  const policy = getSaviRateLimitPolicy('AUTH');
  let record: SaviRateLimitRecord | undefined;
  let nowMs = 1_000;

  for (let count = 0; count < 2; count += 1) {
    const result = evaluateSaviRateLimitRecord(record, nowMs, policy, 'AUTH');
    assert.equal(result.decision.allowed, true);
    record = result.nextRecord;
  }

  const callback = evaluateSaviRateLimitRecord(record, nowMs + 1, policy, 'AUTH');
  assert.equal(callback.decision.allowed, true);
  record = callback.nextRecord;

  const abusiveAttempt = evaluateSaviRateLimitRecord(record, nowMs + 2, policy, 'AUTH');
  assert.equal(abusiveAttempt.decision.allowed, false);
  assert.ok(abusiveAttempt.decision.retryAfterSeconds >= 1);
});

test('paid generation fails closed when rate-limit storage is unavailable', () => {
  const policy = getSaviRateLimitPolicy('PAID_GENERATION');
  assert.equal(policy.failureMode, 'closed');
  const decision = unavailableSaviRateLimitDecision(policy);
  assert.deepEqual(decision, { allowed: false, retryAfterSeconds: 5, failure: 'storage' });
});

test('missing identity cannot silently bypass protected policies', () => {
  const decision = missingSaviRateLimitDecision(getSaviRateLimitPolicy('PAID_GENERATION'));
  assert.deepEqual(decision, { allowed: false, retryAfterSeconds: 5, failure: 'identity' });
});

test('authenticated legal writes have a closed, modest policy', () => {
  const policy = getSaviRateLimitPolicy('ACCOUNT_LEGAL');
  assert.equal(policy.failureMode, 'closed');
  assert.equal(policy.requiresIdentity, true);
  assert.equal(policy.maxRequestsPerBurst, 3);
  assert.equal(policy.maxRequestsPerWindow, 12);
});

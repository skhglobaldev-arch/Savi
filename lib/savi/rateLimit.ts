import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getSaviAdminApp } from '../firebase/admin';
import { logOperational } from '../observability/logger';
import {
  evaluateSaviRateLimitRecord,
  getSaviFairUseConfig,
  getSaviRateLimitPolicy,
  missingSaviRateLimitDecision,
  safeSaviRateLimitCount,
  safeSaviRateLimitTimestamp,
  unavailableSaviRateLimitDecision,
  type SaviFairUseConfig,
  type SaviRateLimitClass,
  type SaviRateLimitCounterResult,
  type SaviRateLimitDecision,
  type SaviRateLimitPolicy,
  type SaviRateLimitRecord
} from './rateLimitPolicy';

export {
  evaluateSaviRateLimitRecord,
  getSaviFairUseConfig,
  getSaviRateLimitPolicy,
  type SaviFairUseConfig,
  type SaviRateLimitClass,
  type SaviRateLimitDecision,
  type SaviRateLimitPolicy
} from './rateLimitPolicy';

export type SaviRateLimitStore = {
  consume(input: { key: string; policy: SaviRateLimitClass; nowMs: number; config: SaviRateLimitPolicy }): Promise<SaviRateLimitCounterResult>;
};

function rateLimitDocumentId(key: string) {
  return createHash('sha256').update(`savi-rate-limit:v1:${key}`).digest('hex');
}

const firestoreStore: SaviRateLimitStore = {
  async consume({ key, policy, nowMs, config }) {
    const db = getFirestore(getSaviAdminApp());
    const ref = db.collection('savi_rate_limits').doc(rateLimitDocumentId(key));
    let result: SaviRateLimitCounterResult = { decision: { allowed: true } };

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const expired = await transaction.get(
        db.collection('savi_rate_limits').where('expiresAtMs', '<', nowMs).limit(25)
      );
      expired.docs.forEach((document) => {
        if (document.id !== ref.id) transaction.delete(document.ref);
      });
      const data = snapshot.exists ? snapshot.data() : undefined;
      const current: SaviRateLimitRecord | undefined = data
        ? {
            policy,
            windowStartMs: safeSaviRateLimitTimestamp(data.windowStartMs, nowMs),
            windowCount: safeSaviRateLimitCount(data.windowCount),
            burstStartMs: safeSaviRateLimitTimestamp(data.burstStartMs, nowMs),
            burstCount: safeSaviRateLimitCount(data.burstCount),
            expiresAtMs: safeSaviRateLimitTimestamp(data.expiresAtMs, nowMs)
          }
        : undefined;
      result = evaluateSaviRateLimitRecord(current, nowMs, config, policy);
      if (result.nextRecord) transaction.set(ref, result.nextRecord);
    });

    return result;
  }
};

/** Shared-store test primitive; production always uses Firestore above. */
export function createInMemorySaviRateLimitStore(): SaviRateLimitStore {
  const records = new Map<string, SaviRateLimitRecord>();
  return {
    async consume({ key, policy, nowMs, config }) {
      const result = evaluateSaviRateLimitRecord(records.get(key), nowMs, config, policy);
      if (result.nextRecord) records.set(key, result.nextRecord);
      return result;
    }
  };
}

export function createSaviRateLimiter(store: SaviRateLimitStore = firestoreStore) {
  return async function checkSaviRateLimit(input: {
    rateLimitClass: SaviRateLimitClass;
    identity?: string | null;
  }): Promise<SaviRateLimitDecision> {
    if (input.rateLimitClass === 'WEBHOOK') return { allowed: true, reason: 'webhook_exempt' };

    const config = getSaviRateLimitPolicy(input.rateLimitClass);
    // App Hosting does not expose a trusted client identity here when the
    // proxy contract is disabled. Use a bounded shared bucket rather than
    // treating anonymous requests as unmetered or trusting spoofable headers.
    const key = input.identity
      ? `${input.rateLimitClass}:${input.identity}`
      : input.rateLimitClass === 'AUTH'
        ? 'AUTH:anonymous-fallback'
        : null;
    if (!key) return missingSaviRateLimitDecision(config);

    try {
      const result = await store.consume({ key, policy: input.rateLimitClass, nowMs: Date.now(), config });
      return result.decision;
    } catch {
      logOperational('error', 'rate_limit_storage_unavailable', { rateLimitClass: input.rateLimitClass, failureMode: config.failureMode });
      return unavailableSaviRateLimitDecision(config);
    }
  };
}

export const checkSaviRateLimit = createSaviRateLimiter();

export function createSaviRateLimitResponse(decision: SaviRateLimitDecision) {
  const unavailable = decision.allowed === false && Boolean(decision.failure);
  const retryAfter = 'retryAfterSeconds' in decision ? decision.retryAfterSeconds : 1;
  return NextResponse.json(
    {
      error: unavailable ? 'SAVI protection is temporarily unavailable. Please try again shortly.' : 'Too many requests. Please try again shortly.',
      category: unavailable ? 'RATE_LIMIT_UNAVAILABLE' : 'RATE_LIMITED'
    },
    {
      status: unavailable ? 503 : 429,
      headers: { 'Retry-After': String(retryAfter) }
    }
  );
}

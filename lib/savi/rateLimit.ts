import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { getSaviAdminApp } from '../firebase/admin';
import { logOperational } from '../observability/logger';

export type SaviRateLimitClass =
  | 'FREE_AI'
  | 'PAID_GENERATION'
  | 'FILE_PROCESSING'
  | 'COMMERCE'
  | 'AUTH'
  | 'ASSET_READ'
  | 'WEBHOOK';

export type SaviFairUseConfig = {
  windowMs: number;
  maxRequestsPerWindow: number;
  burstWindowMs: number;
  maxRequestsPerBurst: number;
  maxOutputTokens: number;
};

type FailureMode = 'open' | 'closed';

export type SaviRateLimitPolicy = SaviFairUseConfig & {
  failureMode: FailureMode;
  requiresIdentity: boolean;
};

export type SaviRateLimitDecision =
  | { allowed: true; reason?: 'identity_unavailable' | 'storage_unavailable' | 'webhook_exempt' }
  | { allowed: false; retryAfterSeconds: number; failure?: 'identity' | 'storage' };

type RateLimitRecord = {
  policy: SaviRateLimitClass;
  windowStartMs: number;
  windowCount: number;
  burstStartMs: number;
  burstCount: number;
  expiresAtMs: number;
};

type CounterResult = {
  decision: SaviRateLimitDecision;
  nextRecord?: RateLimitRecord;
};

export type SaviRateLimitStore = {
  consume(input: { key: string; policy: SaviRateLimitClass; nowMs: number; config: SaviRateLimitPolicy }): Promise<CounterResult>;
};

function configuredPositiveInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) return fallback;
  return value;
}

export function getSaviFairUseConfig(): SaviFairUseConfig {
  return {
    windowMs: configuredPositiveInteger('SAVI_FREE_AI_WINDOW_MS', 60_000, 10_000, 60 * 60 * 1000),
    maxRequestsPerWindow: configuredPositiveInteger('SAVI_FREE_AI_MAX_REQUESTS', 12, 1, 240),
    burstWindowMs: configuredPositiveInteger('SAVI_FREE_AI_BURST_WINDOW_MS', 10_000, 1_000, 60_000),
    maxRequestsPerBurst: configuredPositiveInteger('SAVI_FREE_AI_MAX_BURST', 4, 1, 40),
    maxOutputTokens: configuredPositiveInteger('SAVI_FREE_AI_MAX_OUTPUT_TOKENS', 2048, 128, 8192)
  };
}

function policyWithDefaults(
  defaults: Omit<SaviRateLimitPolicy, keyof SaviFairUseConfig> & SaviFairUseConfig,
  envPrefix: string
): SaviRateLimitPolicy {
  return {
    windowMs: configuredPositiveInteger(`${envPrefix}_WINDOW_MS`, defaults.windowMs, 1_000, 24 * 60 * 60 * 1000),
    maxRequestsPerWindow: configuredPositiveInteger(`${envPrefix}_MAX_REQUESTS`, defaults.maxRequestsPerWindow, 1, 10_000),
    burstWindowMs: configuredPositiveInteger(`${envPrefix}_BURST_WINDOW_MS`, defaults.burstWindowMs, 1_000, 60 * 60 * 1000),
    maxRequestsPerBurst: configuredPositiveInteger(`${envPrefix}_MAX_BURST`, defaults.maxRequestsPerBurst, 1, 1_000),
    maxOutputTokens: defaults.maxOutputTokens,
    failureMode: defaults.failureMode,
    requiresIdentity: defaults.requiresIdentity
  };
}

export function getSaviRateLimitPolicy(rateLimitClass: SaviRateLimitClass): SaviRateLimitPolicy {
  const freeAi = getSaviFairUseConfig();
  if (rateLimitClass === 'FREE_AI') {
    return {
      ...freeAi,
      failureMode: 'closed',
      requiresIdentity: true
    };
  }

  const common = { maxOutputTokens: 0 };
  if (rateLimitClass === 'PAID_GENERATION') {
    return policyWithDefaults({
      ...common,
      windowMs: 60_000,
      maxRequestsPerWindow: 6,
      burstWindowMs: 10_000,
      maxRequestsPerBurst: 2,
      failureMode: 'open',
      requiresIdentity: true
    }, 'SAVI_PAID_GENERATION');
  }
  if (rateLimitClass === 'FILE_PROCESSING') {
    return policyWithDefaults({
      ...common,
      windowMs: 60_000,
      maxRequestsPerWindow: 4,
      burstWindowMs: 15_000,
      maxRequestsPerBurst: 1,
      failureMode: 'closed',
      requiresIdentity: true
    }, 'SAVI_FILE_PROCESSING');
  }
  if (rateLimitClass === 'COMMERCE') {
    return policyWithDefaults({
      ...common,
      windowMs: 60_000,
      maxRequestsPerWindow: 4,
      burstWindowMs: 15_000,
      maxRequestsPerBurst: 2,
      failureMode: 'closed',
      requiresIdentity: true
    }, 'SAVI_COMMERCE');
  }
  if (rateLimitClass === 'AUTH') {
    return policyWithDefaults({
      ...common,
      windowMs: 10 * 60_000,
      maxRequestsPerWindow: 10,
      burstWindowMs: 30_000,
      maxRequestsPerBurst: 3,
      failureMode: 'closed',
      requiresIdentity: true
    }, 'SAVI_AUTH');
  }
  if (rateLimitClass === 'ASSET_READ') {
    return policyWithDefaults({
      ...common,
      windowMs: 60_000,
      maxRequestsPerWindow: 240,
      burstWindowMs: 10_000,
      maxRequestsPerBurst: 40,
      failureMode: 'open',
      requiresIdentity: true
    }, 'SAVI_ASSET_READ');
  }
  return policyWithDefaults({
    ...common,
    windowMs: 60_000,
    maxRequestsPerWindow: 1,
    burstWindowMs: 10_000,
    maxRequestsPerBurst: 1,
    failureMode: 'open',
    requiresIdentity: false
  }, 'SAVI_WEBHOOK');
}

function safeCount(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeTimestamp(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function retryAfterSeconds(nowMs: number, ...endTimes: number[]) {
  const future = endTimes.filter((value) => Number.isFinite(value) && value > nowMs);
  return Math.max(1, Math.ceil((Math.min(...future, nowMs + 1_000) - nowMs) / 1000));
}

export function evaluateSaviRateLimitRecord(
  record: RateLimitRecord | undefined,
  nowMs: number,
  config: SaviRateLimitPolicy,
  rateLimitClass: SaviRateLimitClass
): CounterResult {
  const windowStartMs = safeTimestamp(record?.windowStartMs, nowMs);
  const burstStartMs = safeTimestamp(record?.burstStartMs, nowMs);
  const windowActive = nowMs - windowStartMs < config.windowMs;
  const burstActive = nowMs - burstStartMs < config.burstWindowMs;
  const windowCount = windowActive ? safeCount(record?.windowCount) : 0;
  const burstCount = burstActive ? safeCount(record?.burstCount) : 0;

  if (windowCount >= config.maxRequestsPerWindow || burstCount >= config.maxRequestsPerBurst) {
    return {
      decision: {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds(
          nowMs,
          windowCount >= config.maxRequestsPerWindow ? windowStartMs + config.windowMs : Number.POSITIVE_INFINITY,
          burstCount >= config.maxRequestsPerBurst ? burstStartMs + config.burstWindowMs : Number.POSITIVE_INFINITY
        )
      }
    };
  }

  const nextWindowStartMs = windowActive ? windowStartMs : nowMs;
  const nextBurstStartMs = burstActive ? burstStartMs : nowMs;
  return {
    decision: { allowed: true },
    nextRecord: {
      policy: rateLimitClass,
      windowStartMs: nextWindowStartMs,
      windowCount: windowCount + 1,
      burstStartMs: nextBurstStartMs,
      burstCount: burstCount + 1,
      expiresAtMs: Math.max(nextWindowStartMs + config.windowMs, nextBurstStartMs + config.burstWindowMs)
    }
  };
}

function rateLimitDocumentId(key: string) {
  return createHash('sha256').update(`savi-rate-limit:v1:${key}`).digest('hex');
}

const firestoreStore: SaviRateLimitStore = {
  async consume({ key, policy, nowMs, config }) {
    const db = getFirestore(getSaviAdminApp());
    const ref = db.collection('savi_rate_limits').doc(rateLimitDocumentId(key));
    let result: CounterResult = { decision: { allowed: true } };

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const expired = await transaction.get(
        db.collection('savi_rate_limits').where('expiresAtMs', '<', nowMs).limit(25)
      );
      expired.docs.forEach((document) => {
        if (document.id !== ref.id) transaction.delete(document.ref);
      });
      const data = snapshot.exists ? snapshot.data() : undefined;
      const current: RateLimitRecord | undefined = data
        ? {
            policy,
            windowStartMs: safeTimestamp(data.windowStartMs, nowMs),
            windowCount: safeCount(data.windowCount),
            burstStartMs: safeTimestamp(data.burstStartMs, nowMs),
            burstCount: safeCount(data.burstCount),
            expiresAtMs: safeTimestamp(data.expiresAtMs, nowMs)
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
  const records = new Map<string, RateLimitRecord>();
  return {
    async consume({ key, policy, nowMs, config }) {
      const result = evaluateSaviRateLimitRecord(records.get(key), nowMs, config, policy);
      if (result.nextRecord) records.set(key, result.nextRecord);
      return result;
    }
  };
}

function unavailableDecision(config: SaviRateLimitPolicy): SaviRateLimitDecision {
  if (config.failureMode === 'open') return { allowed: true, reason: 'storage_unavailable' };
  return { allowed: false, retryAfterSeconds: 5, failure: 'storage' };
}

function missingIdentityDecision(rateLimitClass: SaviRateLimitClass, config: SaviRateLimitPolicy): SaviRateLimitDecision {
  // OAuth must remain usable when a deployment has not enabled the explicit
  // trusted-proxy contract. The deployment assumption is documented in
  // .env.example; without it, only authenticated user-keyed limits apply.
  if (rateLimitClass === 'AUTH' && config.requiresIdentity) return { allowed: true, reason: 'identity_unavailable' };
  return { allowed: true, reason: 'identity_unavailable' };
}

export function createSaviRateLimiter(store: SaviRateLimitStore = firestoreStore) {
  return async function checkSaviRateLimit(input: {
    rateLimitClass: SaviRateLimitClass;
    identity?: string | null;
  }): Promise<SaviRateLimitDecision> {
    if (input.rateLimitClass === 'WEBHOOK') return { allowed: true, reason: 'webhook_exempt' };

    const config = getSaviRateLimitPolicy(input.rateLimitClass);
    if (!input.identity) return missingIdentityDecision(input.rateLimitClass, config);

    const key = `${input.rateLimitClass}:${input.identity}`;
    try {
      const result = await store.consume({ key, policy: input.rateLimitClass, nowMs: Date.now(), config });
      return result.decision;
    } catch {
      logOperational('error', 'rate_limit_storage_unavailable', { rateLimitClass: input.rateLimitClass, failureMode: config.failureMode });
      return unavailableDecision(config);
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

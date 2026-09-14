export type SaviRateLimitClass =
  | 'FREE_AI'
  | 'PAID_GENERATION'
  | 'FILE_PREVIEW'
  | 'FILE_PROCESSING'
  | 'COMMERCE'
  | 'ACCOUNT_LEGAL'
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

export type SaviRateLimitRecord = {
  policy: SaviRateLimitClass;
  windowStartMs: number;
  windowCount: number;
  burstStartMs: number;
  burstCount: number;
  expiresAtMs: number;
};

export type SaviRateLimitCounterResult = {
  decision: SaviRateLimitDecision;
  nextRecord?: SaviRateLimitRecord;
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
      failureMode: 'closed',
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
  if (rateLimitClass === 'FILE_PREVIEW') {
    return policyWithDefaults({
      ...common,
      windowMs: 60_000,
      maxRequestsPerWindow: 20,
      burstWindowMs: 5_000,
      maxRequestsPerBurst: 4,
      failureMode: 'closed',
      requiresIdentity: true
    }, 'SAVI_FILE_PREVIEW');
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
  if (rateLimitClass === 'ACCOUNT_LEGAL') {
    return policyWithDefaults({
      ...common,
      windowMs: 60_000,
      maxRequestsPerWindow: 12,
      burstWindowMs: 30_000,
      maxRequestsPerBurst: 3,
      failureMode: 'closed',
      requiresIdentity: true
    }, 'SAVI_ACCOUNT_LEGAL');
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

export function safeSaviRateLimitCount(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function safeSaviRateLimitTimestamp(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function retryAfterSeconds(nowMs: number, ...endTimes: number[]) {
  const future = endTimes.filter((value) => Number.isFinite(value) && value > nowMs);
  return Math.max(1, Math.ceil((Math.min(...future, nowMs + 1_000) - nowMs) / 1000));
}

export function evaluateSaviRateLimitRecord(
  record: SaviRateLimitRecord | undefined,
  nowMs: number,
  config: SaviRateLimitPolicy,
  rateLimitClass: SaviRateLimitClass
): SaviRateLimitCounterResult {
  const windowStartMs = safeSaviRateLimitTimestamp(record?.windowStartMs, nowMs);
  const burstStartMs = safeSaviRateLimitTimestamp(record?.burstStartMs, nowMs);
  const windowActive = nowMs - windowStartMs < config.windowMs;
  const burstActive = nowMs - burstStartMs < config.burstWindowMs;
  const windowCount = windowActive ? safeSaviRateLimitCount(record?.windowCount) : 0;
  const burstCount = burstActive ? safeSaviRateLimitCount(record?.burstCount) : 0;

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

export function unavailableSaviRateLimitDecision(config: SaviRateLimitPolicy): SaviRateLimitDecision {
  if (config.failureMode === 'open') return { allowed: true, reason: 'storage_unavailable' };
  return { allowed: false, retryAfterSeconds: 5, failure: 'storage' };
}

export function missingSaviRateLimitDecision(config: SaviRateLimitPolicy): SaviRateLimitDecision {
  if (!config.requiresIdentity) return { allowed: true, reason: 'identity_unavailable' };
  return { allowed: false, retryAfterSeconds: 5, failure: 'identity' };
}

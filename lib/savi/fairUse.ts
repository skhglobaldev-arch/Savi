type FairUseSurface = 'free_ai';

export type SaviFairUseConfig = {
  windowMs: number;
  maxRequestsPerWindow: number;
  burstWindowMs: number;
  maxRequestsPerBurst: number;
  maxOutputTokens: number;
};

function configuredPositiveInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) return fallback;
  return value;
}

/**
 * This is deliberately server-owned. It protects the normal free-chat path
 * without treating a shared provider allowance as a customer entitlement.
 */
export function getSaviFairUseConfig(): SaviFairUseConfig {
  return {
    windowMs: configuredPositiveInteger('SAVI_FREE_AI_WINDOW_MS', 60_000, 10_000, 60 * 60 * 1000),
    maxRequestsPerWindow: configuredPositiveInteger('SAVI_FREE_AI_MAX_REQUESTS', 12, 1, 240),
    burstWindowMs: configuredPositiveInteger('SAVI_FREE_AI_BURST_WINDOW_MS', 10_000, 1_000, 60_000),
    maxRequestsPerBurst: configuredPositiveInteger('SAVI_FREE_AI_MAX_BURST', 4, 1, 40),
    maxOutputTokens: configuredPositiveInteger('SAVI_FREE_AI_MAX_OUTPUT_TOKENS', 2048, 128, 8192)
  };
}

type FairUseEntry = { requests: number[] };
const entries = new Map<string, FairUseEntry>();

function prune(now: number, config: SaviFairUseConfig) {
  if (entries.size < 2_000) return;
  entries.forEach((entry, key) => {
    const live = entry.requests.filter((timestamp) => now - timestamp < config.windowMs);
    if (live.length) entry.requests = live;
    else entries.delete(key);
  });
}

export type FairUseDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function consumeSaviFairUse(userId: string, surface: FairUseSurface = 'free_ai'): FairUseDecision {
  const now = Date.now();
  const config = getSaviFairUseConfig();
  prune(now, config);
  const key = `${surface}:${userId}`;
  const entry = entries.get(key) || { requests: [] };
  entry.requests = entry.requests.filter((timestamp) => now - timestamp < config.windowMs);
  const burst = entry.requests.filter((timestamp) => now - timestamp < config.burstWindowMs);
  if (entry.requests.length >= config.maxRequestsPerWindow || burst.length >= config.maxRequestsPerBurst) {
    const relevant = entry.requests.length >= config.maxRequestsPerWindow ? entry.requests[0] : burst[0];
    const window = entry.requests.length >= config.maxRequestsPerWindow ? config.windowMs : config.burstWindowMs;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window - (now - relevant)) / 1000)) };
  }
  entry.requests.push(now);
  entries.set(key, entry);
  return { allowed: true };
}

export function resetSaviFairUseForTests() {
  entries.clear();
}

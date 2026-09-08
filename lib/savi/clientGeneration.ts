'use client';

/**
 * Browser helpers for protected SAVI generation requests. The server remains
 * the credit authority; these helpers never calculate or mutate balances.
 *
 * A scoped request id lives only in sessionStorage, never localStorage. It is
 * deliberately just an idempotency hint for an in-flight request, not a credit
 * balance or a source of customer entitlements.
 */
const PENDING_REQUEST_PREFIX = 'savi:pending-request:v1:';
const PENDING_REQUEST_TTL_MS = 2 * 60 * 60 * 1000;

type PendingRequestRecord = {
  clientRequestId: string;
  expiresAt: number;
};

function newRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function requestStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Produces a compact browser-only request scope without retaining raw prompt
 * text or file data in storage.
 */
export function createSaviRequestScope(surface: string, values: Array<string | number | boolean | null | undefined>) {
  const normalized = values.map((value) => String(value ?? '')).join('\u001f');
  return `${surface}:${shortHash(normalized)}`;
}

export function createSaviClientRequestId(scope?: string) {
  if (!scope) return newRequestId();

  const storage = requestStorage();
  const key = `${PENDING_REQUEST_PREFIX}${scope}`;
  const now = Date.now();
  if (storage) {
    try {
      const parsed = JSON.parse(storage.getItem(key) || 'null') as Partial<PendingRequestRecord> | null;
      if (
        parsed &&
        typeof parsed.clientRequestId === 'string' &&
        /^[A-Za-z0-9_-]{8,128}$/.test(parsed.clientRequestId) &&
        typeof parsed.expiresAt === 'number' &&
        parsed.expiresAt > now
      ) {
        return parsed.clientRequestId;
      }
      storage.removeItem(key);
    } catch {
      // A malformed browser value must never affect the server's idempotency rules.
      storage.removeItem(key);
    }
  }

  const clientRequestId = newRequestId();
  if (storage) {
    try {
      storage.setItem(key, JSON.stringify({ clientRequestId, expiresAt: now + PENDING_REQUEST_TTL_MS } satisfies PendingRequestRecord));
    } catch {
      // sessionStorage is an optional UX optimization; the server stays authoritative.
    }
  }
  return clientRequestId;
}

export function clearSaviClientRequestId(scope?: string) {
  if (!scope) return;
  try {
    requestStorage()?.removeItem(`${PENDING_REQUEST_PREFIX}${scope}`);
  } catch {
    // Nothing to clear when browser storage is unavailable.
  }
}

export function revokeOwnedObjectUrl(url?: string) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

export async function readPrivateTextAsset(url?: string) {
  if (!url) return '';
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('SAVI could not load the saved text result.');
  return response.text();
}

export function applyAuthoritativeBalance(
  availableCredits: unknown,
  update: (credits: number) => void
) {
  if (typeof availableCredits === 'number' && Number.isFinite(availableCredits) && availableCredits >= 0) {
    update(availableCredits);
  }
}

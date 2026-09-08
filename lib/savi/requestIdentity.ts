import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextRequest } from 'next/server';

/**
 * SAVI is expected to run behind a platform proxy that sanitizes the selected
 * forwarding header. We only read proxy headers when that deployment
 * contract is explicitly enabled; arbitrary browser-supplied X-Forwarded-For
 * values are never treated as client identity.
 */
export function getSaviRequestIdentity(request: NextRequest, userId?: string | null) {
  const normalizedUserId = userId?.trim();
  if (normalizedUserId) return `user:${normalizedUserId}`;

  if (process.env.SAVI_TRUSTED_PROXY !== 'true') return null;

  const forwarded = request.headers.get('x-forwarded-for');
  const forwardedAddress = forwarded?.split(',')[0]?.trim();
  const rawIp = forwardedAddress || request.headers.get('x-real-ip')?.trim() || '';
  if (!rawIp || isIP(rawIp) === 0) return null;

  return `ip:${createHash('sha256').update(rawIp).digest('hex').slice(0, 32)}`;
}

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SAVI_SESSION_COOKIE = 'savi_session';
export const SAVI_OAUTH_STATE_COOKIE = 'savi_google_oauth_state';
export const SAVI_OAUTH_RETURN_TO_COOKIE = 'savi_google_return_to';

export type SaviUser = {
  id: string;
  email: string;
  name: string;
  picture?: string;
  planId: 'free';
};

type SaviSessionPayload = SaviUser & {
  exp: number;
};

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function secret() {
  return process.env.SAVI_AUTH_SECRET || '';
}

function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

export function isGoogleAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && secret());
}

export function createOAuthState() {
  return randomBytes(32).toString('base64url');
}

export function safeReturnTo(value: string | undefined | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export function createSessionToken(user: Omit<SaviUser, 'planId'>) {
  if (!secret()) throw new Error('Authentication is not configured.');
  const payload: SaviSessionPayload = {
    ...user,
    planId: 'free',
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
  };
  const encoded = base64Url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function readSessionToken(token: string | undefined): SaviUser | null {
  if (!token || !secret()) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SaviSessionPayload;
    if (!payload.id || !payload.email || !payload.name || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      planId: 'free'
    };
  } catch {
    return null;
  }
}

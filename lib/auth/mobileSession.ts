import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import type { SaviUser } from './session';

const MOBILE_CALLBACK_URI = 'savi://auth/callback';
const MOBILE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const MOBILE_GRANT_TTL_SECONDS = 5 * 60;
const MIN_AUTH_SECRET_LENGTH = 32;

type SignedEnvelope<T> = T & { exp: number; purpose: 'mobile_oauth_state' | 'mobile_exchange_grant' | 'mobile_session' };

type MobileOAuthState = {
  callbackUri: string;
  codeChallenge: string;
  appState: string;
};

type MobileExchangeGrant = Omit<SaviUser, 'planId'> & {
  codeChallenge: string;
};

function authSecret() {
  return process.env.SAVI_AUTH_SECRET || '';
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function sign(encoded: string) {
  return createHmac('sha256', authSecret()).update(encoded).digest('base64url');
}

function signEnvelope<T extends object>(payload: T, purpose: SignedEnvelope<T>['purpose'], ttlSeconds: number) {
  if (authSecret().length < MIN_AUTH_SECRET_LENGTH) throw new Error('Authentication is not configured.');
  const encoded = base64Url(JSON.stringify({ ...payload, purpose, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${encoded}.${sign(encoded)}`;
}

function readEnvelope<T extends object>(token: string | undefined, purpose: SignedEnvelope<T>['purpose']): SignedEnvelope<T> | null {
  if (!token || authSecret().length < MIN_AUTH_SECRET_LENGTH) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedEnvelope<T>;
    if (payload.purpose !== purpose || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function validCodeChallenge(value: string) {
  return /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

function validAppState(value: string) {
  return /^[A-Za-z0-9_-]{16,160}$/.test(value);
}

export function mobileCallbackUri() {
  return MOBILE_CALLBACK_URI;
}

export function createMobileOAuthState(input: MobileOAuthState) {
  if (input.callbackUri !== MOBILE_CALLBACK_URI || !validCodeChallenge(input.codeChallenge) || !validAppState(input.appState)) {
    throw new Error('Invalid mobile OAuth request.');
  }
  return signEnvelope(input, 'mobile_oauth_state', 10 * 60);
}

export function readMobileOAuthState(token: string | undefined) {
  const payload = readEnvelope<MobileOAuthState>(token, 'mobile_oauth_state');
  if (!payload || payload.callbackUri !== MOBILE_CALLBACK_URI || !validCodeChallenge(payload.codeChallenge) || !validAppState(payload.appState)) return null;
  return payload;
}

export function createMobileExchangeGrant(user: Omit<SaviUser, 'planId'>, codeChallenge: string) {
  if (!user.id || !user.email || !user.name || !validCodeChallenge(codeChallenge)) throw new Error('Invalid mobile exchange grant.');
  return signEnvelope({ ...user, codeChallenge }, 'mobile_exchange_grant', MOBILE_GRANT_TTL_SECONDS);
}

export function redeemMobileExchangeGrant(grant: string | undefined, codeVerifier: string | undefined): Omit<SaviUser, 'planId'> | null {
  if (!codeVerifier || !/^[A-Za-z0-9_-]{43,128}$/.test(codeVerifier)) return null;
  const payload = readEnvelope<MobileExchangeGrant>(grant, 'mobile_exchange_grant');
  if (!payload || !payload.id || !payload.email || !payload.name || !validCodeChallenge(payload.codeChallenge)) return null;
  const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const expectedBuffer = Buffer.from(payload.codeChallenge);
  const receivedBuffer = Buffer.from(challenge);
  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) return null;
  return payload.picture
    ? { id: payload.id, email: payload.email, name: payload.name, picture: payload.picture }
    : { id: payload.id, email: payload.email, name: payload.name };
}

export function createMobileSessionToken(user: Omit<SaviUser, 'planId'>) {
  if (!user.id || !user.email || !user.name) throw new Error('Invalid mobile session user.');
  return signEnvelope(user, 'mobile_session', MOBILE_SESSION_TTL_SECONDS);
}

export function readMobileSessionToken(token: string | undefined): SaviUser | null {
  const payload = readEnvelope<Omit<SaviUser, 'planId'>>(token, 'mobile_session');
  if (!payload || !payload.id || !payload.email || !payload.name) return null;
  return payload.picture
    ? { id: payload.id, email: payload.email, name: payload.name, picture: payload.picture, planId: 'free' }
    : { id: payload.id, email: payload.email, name: payload.name, planId: 'free' };
}

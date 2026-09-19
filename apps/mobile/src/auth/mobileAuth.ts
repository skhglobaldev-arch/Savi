import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

import { mobileAuthCallbackUri, saviApiOrigin } from './config';
import type { MobileSaviUser } from './types';

const mobileSessionKey = 'savi.mobile.session.v1';

WebBrowser.maybeCompleteAuthSession();

function base64Url(value: string) {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createVerifier() {
  return `${Crypto.randomUUID().replace(/-/g, '')}${Crypto.randomUUID().replace(/-/g, '')}${Crypto.randomUUID().replace(/-/g, '')}`;
}

async function createChallenge(verifier: string) {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
  return base64Url(digest);
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof body.error === 'string' ? body.error : 'SAVI sign-in could not be completed.';
}

export async function readStoredMobileSession() {
  return SecureStore.getItemAsync(mobileSessionKey);
}

export async function clearStoredMobileSession() {
  await SecureStore.deleteItemAsync(mobileSessionKey);
}

export async function currentMobileUser(token: string): Promise<MobileSaviUser | null> {
  const response = await fetch(`${saviApiOrigin}/api/auth/mobile/session`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => ({}))) as { user?: MobileSaviUser | null };
  return body.user || null;
}

export async function beginMobileGoogleSignIn(): Promise<{ token: string; user: MobileSaviUser }> {
  const verifier = createVerifier();
  const challenge = await createChallenge(verifier);
  const state = Crypto.randomUUID().replace(/-/g, '');
  const authorizationUrl = new URL(`${saviApiOrigin}/api/auth/mobile/google`);
  authorizationUrl.searchParams.set('redirect_uri', mobileAuthCallbackUri);
  authorizationUrl.searchParams.set('code_challenge', challenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');
  authorizationUrl.searchParams.set('state', state);

  const result = await WebBrowser.openAuthSessionAsync(authorizationUrl.toString(), mobileAuthCallbackUri);
  if (result.type !== 'success') throw new Error(result.type === 'cancel' ? 'Google sign-in was cancelled.' : 'Google sign-in could not be completed.');

  const callback = new URL(result.url);
  if (`${callback.protocol}//${callback.host}${callback.pathname}` !== mobileAuthCallbackUri) throw new Error('Google sign-in returned to an unexpected address.');
  if (callback.searchParams.get('state') !== state) throw new Error('Google sign-in could not be verified.');
  if (callback.searchParams.get('error')) throw new Error('Google sign-in could not be completed.');
  const grant = callback.searchParams.get('grant');
  if (!grant) throw new Error('Google sign-in did not return a SAVI session grant.');

  const exchange = await fetch(`${saviApiOrigin}/api/auth/mobile/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant, code_verifier: verifier })
  });
  if (!exchange.ok) throw new Error(await readError(exchange));
  const body = (await exchange.json().catch(() => ({}))) as { accessToken?: unknown; user?: MobileSaviUser | null };
  if (typeof body.accessToken !== 'string' || !body.user) throw new Error('SAVI did not establish a mobile session.');
  await SecureStore.setItemAsync(mobileSessionKey, body.accessToken, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  return { token: body.accessToken, user: body.user };
}

export async function signOutMobileSession(token: string | null) {
  try {
    if (token) await fetch(`${saviApiOrigin}/api/auth/mobile/signout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } finally {
    await clearStoredMobileSession();
  }
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  createMobileExchangeGrant,
  createMobileOAuthState,
  createMobileSessionToken,
  mobileCallbackUri,
  readMobileOAuthState,
  readMobileSessionToken,
  redeemMobileExchangeGrant
} from './mobileSession.ts';

process.env.SAVI_AUTH_SECRET = 'm'.repeat(32);

const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const user = { id: 'google-subject-1', email: 'operator@example.com', name: 'Operator' };

test('mobile OAuth state is callback-bound and signed', () => {
  const state = createMobileOAuthState({ callbackUri: mobileCallbackUri(), codeChallenge: challenge, appState: 's'.repeat(24) });
  assert.equal(readMobileOAuthState(state)?.callbackUri, mobileCallbackUri());
  assert.equal(readMobileOAuthState(`${state}tampered`), null);
});

test('mobile exchange grants require the original PKCE verifier', () => {
  const grant = createMobileExchangeGrant(user, challenge);
  assert.deepEqual(redeemMobileExchangeGrant(grant, verifier), user);
  assert.equal(redeemMobileExchangeGrant(grant, 'b'.repeat(43)), null);
});

test('mobile sessions are signed and never accept a fabricated user', () => {
  const token = createMobileSessionToken(user);
  assert.equal(readMobileSessionToken(token)?.id, user.id);
  assert.equal(readMobileSessionToken(`${token}tampered`), null);
});

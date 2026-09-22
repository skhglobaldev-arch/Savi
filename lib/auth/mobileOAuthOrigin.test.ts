import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isValidMobileOAuthOrigin, mobileGoogleCallbackUrl } from './mobileOAuthOrigin.ts';

test('mobile OAuth origin accepts only a complete HTTPS origin', () => {
  assert.equal(isValidMobileOAuthOrigin('https://savi-production-607fd-web--savi-production-607fd.europe-west4.hosted.app'), true);
  assert.equal(isValidMobileOAuthOrigin('http://example.com'), false);
  assert.equal(isValidMobileOAuthOrigin('https://example.com/path'), false);
  assert.equal(isValidMobileOAuthOrigin('https://example.com?next=/'), false);
  assert.equal(isValidMobileOAuthOrigin('https://localhost'), false);
});

test('mobile Google callback is derived only from the server-controlled origin', () => {
  const previous = process.env.SAVI_MOBILE_OAUTH_ORIGIN;
  process.env.SAVI_MOBILE_OAUTH_ORIGIN = 'https://savi-production-607fd-web--savi-production-607fd.europe-west4.hosted.app';
  try {
    assert.equal(mobileGoogleCallbackUrl(), 'https://savi-production-607fd-web--savi-production-607fd.europe-west4.hosted.app/api/auth/mobile/google/callback');
  } finally {
    if (previous === undefined) delete process.env.SAVI_MOBILE_OAUTH_ORIGIN;
    else process.env.SAVI_MOBILE_OAUTH_ORIGIN = previous;
  }
});

test('mobile Google routes use the dedicated callback helper rather than the web origin', () => {
  for (const route of ['../../app/api/auth/mobile/google/route.ts', '../../app/api/auth/mobile/google/callback/route.ts']) {
    const source = readFileSync(new URL(route, import.meta.url), 'utf8');
    assert.match(source, /mobileGoogleCallbackUrl\(\)/);
    assert.doesNotMatch(source, /SAVI_APP_ORIGIN/);
  }
});

test('mobile OAuth start is isolated from normal mobile API traffic', () => {
  const config = readFileSync(new URL('../../apps/mobile/src/auth/config.ts', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('../../apps/mobile/src/auth/mobileAuth.ts', import.meta.url), 'utf8');
  assert.match(config, /EXPO_PUBLIC_SAVI_MOBILE_OAUTH_ORIGIN/);
  assert.match(config, /export const mobileOAuthOrigin = validHttpsOrigin\(configuredMobileOAuthOrigin\)/);
  assert.match(auth, /mobileOAuthOrigin}\/api\/auth\/mobile\/google/);
  assert.match(auth, /saviApiOrigin}\/api\/auth\/mobile\/session/);
  assert.match(auth, /if \(!mobileOAuthOrigin\) throw new Error/);
});

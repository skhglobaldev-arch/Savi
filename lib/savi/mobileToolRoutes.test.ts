import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mobileToolRoutes = [
  '../../app/api/pricing/text-to-image/route.ts',
  '../../app/api/image/generate/route.ts',
  '../../app/api/credits/balance/route.ts',
  '../../app/api/assets/[assetId]/route.ts',
];

test('mobile Text to Image routes resolve the shared SAVI request session', () => {
  for (const route of mobileToolRoutes) {
    const source = readFileSync(new URL(route, import.meta.url), 'utf8');
    assert.match(source, /readSaviRequestSession\(request\)/);
    assert.doesNotMatch(source, /request\.cookies\.get\(SAVI_SESSION_COOKIE\)/);
  }
});

test('the shared request session keeps browser cookies and signed mobile bearers as separate inputs', () => {
  const source = readFileSync(new URL('../auth/requestSession.ts', import.meta.url), 'utf8');
  assert.match(source, /readSessionToken\(request\.cookies\.get\(SAVI_SESSION_COOKIE\)\?\.value\)/);
  assert.match(source, /authorization\.startsWith\('Bearer '\) \? readMobileSessionToken/);
});

test('the native Text to Image session locks its request inputs while execution is active', () => {
  const source = readFileSync(new URL('../../apps/mobile/src/tools/TextToImageSession.tsx', import.meta.url), 'utf8');
  assert.match(source, /editable=\{!executing\}/);
  assert.match(source, /<OptionRow disabled=\{executing\}/);
  assert.match(source, /disabled=\{executing \|\| insufficientCredits\}/);
  assert.match(source, /requestIdRef\.current \|\| createClientRequestId\(\)/);
});

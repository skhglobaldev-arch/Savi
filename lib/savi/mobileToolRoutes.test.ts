import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mobileToolRoutes = [
  '../../app/api/pricing/text-to-image/route.ts',
  '../../app/api/image/generate/route.ts',
  '../../app/api/credits/balance/route.ts',
  '../../app/api/assets/[assetId]/route.ts',
  '../../app/api/assets/route.ts',
  '../../app/api/pricing/quote/route.ts',
  '../../app/api/text/generate/route.ts',
  '../../app/api/video/generate/route.ts',
  '../../app/api/voice/radio/route.ts',
  '../../app/api/file-tools/process/route.ts',
  '../../app/api/file-tools/preview/route.ts',
  '../../app/api/file-tools/ai/route.ts',
];

test('native tool and Library routes resolve the shared SAVI request session', () => {
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

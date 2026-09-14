import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createSaviUnexpectedErrorResponse,
  isUnavailablePdfAction,
  SAVI_UNAVAILABLE_PDF_TOOL_RESPONSE
} from './backendSecurity.ts';
import { getSaviRequestIdentity } from './requestIdentity.ts';

const processRoute = readFileSync(new URL('../../app/api/file-tools/process/route.ts', import.meta.url), 'utf8');
const agentRoute = readFileSync(new URL('../../app/api/ai/agent/route.ts', import.meta.url), 'utf8');
const agentTools = readFileSync(new URL('../ai/saviAgent.ts', import.meta.url), 'utf8');
const paidRoutes = [
  '../../app/api/image/generate/route.ts',
  '../../app/api/text/generate/route.ts',
  '../../app/api/video/generate/route.ts',
  '../../app/api/voice/radio/route.ts'
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));

test('disabled PDF actions stop at the process boundary', () => {
  assert.equal(isUnavailablePdfAction('extract_images'), true);
  assert.equal(isUnavailablePdfAction('merge_pdf'), false);
  assert.equal(SAVI_UNAVAILABLE_PDF_TOOL_RESPONSE.category, 'TOOL_UNAVAILABLE');

  const actionGuard = processRoute.indexOf('isUnavailablePdfAction(actionValue)');
  assert.ok(actionGuard >= 0);
  assert.ok(actionGuard < processRoute.indexOf('const submittedFiles'));
  assert.ok(actionGuard < processRoute.indexOf('const result = await runProtectedOperation'));
  assert.doesNotMatch(processRoute, /pdfimages|runCommand|createExtractedImagesZip/);
  assert.match(agentRoute, /isUnavailablePdfAction\(raw\.toolId\)/);
  assert.match(agentTools, /filter\(\(toolId\) => toolId !== 'extract_images'\)/);
  assert.match(agentTools, /filter\(\(tool\) => tool\.id !== 'extract_images'\)/);
});

test('unexpected API errors use a customer-safe response', () => {
  const response = JSON.stringify(createSaviUnexpectedErrorResponse());
  assert.deepEqual(createSaviUnexpectedErrorResponse(), {
    error: 'Something went wrong. Please try again.',
    category: 'INTERNAL_ERROR'
  });
  assert.doesNotMatch(response, /provider|secret|stack|database|sql|firebase/i);
  assert.doesNotMatch(readFileSync(new URL('../../app/api/ai/chat/route.ts', import.meta.url), 'utf8'), /error: error instanceof Error \? error\.message/);
  assert.doesNotMatch(readFileSync(new URL('../../app/api/image/generate/route.ts', import.meta.url), 'utf8'), /error: error instanceof Error \? error\.message/);
  assert.match(processRoute, /category: 'INVALID_INPUT'/);
});

test('paid provider routes gate protected operations behind the limiter', () => {
  for (const route of paidRoutes) {
    const routeStart = route.indexOf('export async function POST');
    const limiter = route.indexOf('checkSaviRateLimit', routeStart);
    const protectedOperation = Math.min(
      ...['runProtectedOperation', 'runProtectedTextToImage']
        .map((name) => route.indexOf(name, limiter + 1))
        .filter((index) => index >= 0)
    );
    assert.ok(limiter >= 0);
    assert.ok(protectedOperation > limiter);
  }
});

test('anonymous OAuth has a bounded fallback without trusting browser headers', () => {
  const previous = process.env.SAVI_TRUSTED_PROXY;
  process.env.SAVI_TRUSTED_PROXY = 'false';
  const browserRequest = { headers: new Headers({ 'x-forwarded-for': '203.0.113.10' }) } as never;
  assert.equal(getSaviRequestIdentity(browserRequest), null);

  process.env.SAVI_TRUSTED_PROXY = 'true';
  const trustedRequest = { headers: new Headers({ 'x-forwarded-for': '203.0.113.10' }) } as never;
  assert.match(getSaviRequestIdentity(trustedRequest) ?? '', /^ip:[a-f0-9]{32}$/);

  if (previous === undefined) delete process.env.SAVI_TRUSTED_PROXY;
  else process.env.SAVI_TRUSTED_PROXY = previous;
});

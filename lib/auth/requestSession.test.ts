import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as browser from './session.ts';
import * as mobile from './mobileSession.ts';

process.env.SAVI_AUTH_SECRET = 'unit-test-only-'.repeat(4);
const code = ts.transpileModule(readFileSync(new URL('./requestSession.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = { exports: {} as { readSaviRequestSession: (request: unknown) => browser.SaviUser | null } };
new Function('require', 'module', 'exports', code)((name: string) => {
  if (name === '@/lib/auth/session') return browser;
  if (name === '@/lib/auth/mobileSession') return mobile;
  throw new Error(`Unexpected session dependency: ${name}`);
}, loaded, loaded.exports);
const resolve = loaded.exports.readSaviRequestSession;
const user = { id: 'same-google-subject', email: 'test@example.invalid', name: 'Test' };
function request(cookie?: string, bearer?: string) {
  return { cookies: { get: () => cookie ? { value: cookie } : undefined }, headers: new Headers(bearer ? { authorization: `Bearer ${bearer}` } : {}) };
}

test('Web cookies and mobile bearer credentials resolve the same signed identity', () => {
  const cookie = browser.createSessionToken(user), bearer = mobile.createMobileSessionToken(user);
  const fromCookie = resolve(request(cookie)), fromBearer = resolve(request(undefined, bearer));
  for (const field of ['id', 'email', 'name', 'picture', 'planId'] as const) assert.equal(fromCookie?.[field], fromBearer?.[field]);
  assert.equal(resolve(request(cookie, 'invalid'))?.id, user.id);
});

test('missing, fabricated, cross-purpose and expired mobile credentials fail closed', () => {
  assert.equal(resolve(request()), null);
  assert.equal(resolve(request(undefined, 'client-supplied-user-id')), null);
  assert.equal(resolve(request(undefined, browser.createSessionToken(user))), null);
  const bearer = mobile.createMobileSessionToken(user);
  const now = Date.now;
  try { Date.now = () => now() + 31 * 24 * 60 * 60 * 1000; assert.equal(resolve(request(undefined, bearer)), null); }
  finally { Date.now = now; }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

function source(path: string) {
  return readFileSync(new URL(path, root), 'utf8');
}

test('Home routes visible creation controls to real SAVI destinations', () => {
  const home = source('apps/mobile/app/(tabs)/index.tsx');
  assert.match(home, /toolId: 'text_to_image'/);
  assert.match(home, /toolId: 'text_video'/);
  assert.match(home, /toolId: 'merge'/);
  assert.match(home, /onPress=\{\(\) => openTool\(tool\.id\)\}/);
  assert.match(home, /params: \{ toolId, from: 'home' \}/);
  assert.doesNotMatch(home, /ellipsis-horizontal/);
});

test('Tools preserve the launch context when returning from a workspace', () => {
  const gallery = source('apps/mobile/app/(tabs)/tools.tsx');
  const detail = source('apps/mobile/app/tool/[toolId].tsx');
  assert.match(gallery, /params: \{ toolId: tool\.id, from: 'tools' \}/);
  assert.match(detail, /from === 'home' \? '\/\(tabs\)' : '\/\(tabs\)\/tools'/);
});

test('Ask SAVI does not expose an unsupported attachment control', () => {
  const ask = source('apps/mobile/app/(tabs)/ask.tsx');
  assert.doesNotMatch(ask, /Attachments are coming soon/);
  assert.doesNotMatch(ask, /icon="attach"/);
});

test('Account exposes only current V1 controls and routes privacy to the secure web controls', () => {
  const account = source('apps/mobile/app/(tabs)/account.tsx');
  const privacy = source('apps/mobile/app/privacy.tsx');
  assert.doesNotMatch(account, /Connect your SAVI account later|Available in a future mobile stage/);
  assert.match(account, /router\.push\('\/privacy'\)/);
  assert.match(privacy, /openWeb\('\/privacy'\)/);
  assert.match(privacy, /openWeb\('\/settings'\)/);
  assert.match(privacy, /account deletion/i);
});

test('Unknown tool fallback uses a current-state message rather than a future-stage placeholder', () => {
  const session = source('apps/mobile/src/tools/ToolSession.tsx');
  assert.doesNotMatch(session, /planned for a later native stage/);
  assert.match(session, /unavailable on this device right now/);
});

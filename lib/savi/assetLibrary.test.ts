import assert from 'node:assert/strict';
import test from 'node:test';
import { listOwnedLibraryAssets, type AssetLibraryQuery } from './assetLibrary.ts';

const user = { id: 'verified-google-subject', name: 'Test', email: 'test@example.invalid', planId: 'free' as const };

test('Library binds every asset read to canonical identity and omits storage paths', async () => {
  const calls: { operation: string; variables: Record<string, string | number> }[] = [];
  const query: AssetLibraryQuery = async <T,>(operation: string, variables: Record<string, string | number>): Promise<T> => {
    calls.push({ operation, variables });
    if (operation === 'FindSaviUserByProvider') return { saviUsers: [{ id: 'canonical-owner', status: 'active' }] } as T;
    if (operation === 'ListAccountAssets') return { assets: [{ id: 'owned', status: 'available' }, { id: 'foreign', status: 'available' }, { id: 'deleted', status: 'deleted' }] } as T;
    return { assets: [{ id: variables.assetId, userId: variables.assetId === 'owned' ? 'canonical-owner' : 'other-owner', status: 'available', filename: 'result.png', toolId: 'text_to_image', mediaType: 'image', mimeType: 'image/png', createdAt: '2026-10-01T00:00:00Z', storagePath: 'must-not-leak' }] } as T;
  };
  const result = await listOwnedLibraryAssets(user, 0, query);
  assert.equal(result?.assets.length, 1);
  assert.equal(result?.assets[0].url, '/api/assets/owned');
  assert.ok(!JSON.stringify(result).includes('must-not-leak'));
  assert.deepEqual(calls[0].variables, { provider: 'google', providerSubject: user.id });
  assert.ok(calls.slice(1).every(call => call.variables.userId === 'canonical-owner'));
  assert.ok(calls.every(call => !/mutation|Create|Update|Delete/.test(call.operation)));
});

test('unknown, frozen and erased users cannot enumerate assets', async () => {
  for (const status of [null, 'frozen', 'deleted', 'deletion_processing']) {
    let calls = 0;
    const query: AssetLibraryQuery = async <T,>(): Promise<T> => { calls++; return { saviUsers: status ? [{ id: 'owner', status }] : [] } as T; };
    assert.equal(await listOwnedLibraryAssets(user, 0, query), null);
    assert.equal(calls, 1);
  }
});

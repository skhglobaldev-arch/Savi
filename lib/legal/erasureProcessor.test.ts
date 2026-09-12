import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCOUNT_DELETION_STATUSES,
  canWithdrawAccountDeletion,
  createAccountDeletionProcessor,
  getAccountDeletionBlockers,
  processAccountDeletionRequest,
  type AccountDeletionContext,
  type AccountDeletionProcessorDependencies
} from './erasureProcessor';

function context(overrides: Partial<AccountDeletionContext> = {}): AccountDeletionContext {
  return {
    user: { id: 'user-1', provider: 'google', providerSubject: 'subject-1', email: 'user@example.com', displayName: 'User', status: 'deletion_requested' },
    request: { id: 'request-1', userId: 'user-1', status: 'requested', assetsTotal: 0, assetsDeleted: 0 },
    creditAccount: { availableCredits: 1300, reservedCredits: 0, subscriptionCredits: 0, reservedSubscriptionCredits: 0 },
    subscriptions: [],
    purchases: [{ status: 'fulfilled' }],
    reservations: [],
    generationJobs: [],
    assets: [],
    ...overrides
  };
}

function dependencies(state: AccountDeletionContext, onDelete?: (path: string) => Promise<void>) {
  let current = state;
  let completeCount = 0;
  const calls: string[] = [];
  const deps: AccountDeletionProcessorDependencies = {
    loadContext: async () => current,
    claimProcessing: async ({ expectedRequestStatus }) => {
      assert.equal(current.request?.status, expectedRequestStatus);
      current = {
        ...current,
        user: current.user ? { ...current.user, status: 'deletion_processing' } : null,
        request: current.request ? { ...current.request, status: ACCOUNT_DELETION_STATUSES.processing } : null
      };
      calls.push('claim');
    },
    updateProgress: async ({ status, assetsTotal, assetsDeleted }) => {
      current = {
        ...current,
        request: current.request ? { ...current.request, status, assetsTotal, assetsDeleted } : null
      };
      calls.push(`progress:${status}`);
    },
    markAssetErased: async ({ assetId }) => {
      current = { ...current, assets: current.assets.map((asset) => asset.id === assetId ? { ...asset, status: 'erased' } : asset) };
      calls.push(`asset:${assetId}`);
    },
    complete: async () => {
      completeCount += 1;
      current = {
        ...current,
        user: current.user ? { ...current.user, status: 'deleted' } : null,
        request: current.request ? { ...current.request, status: ACCOUNT_DELETION_STATUSES.completed } : null
      };
      calls.push('complete');
    },
    listStorageObjects: async () => [],
    deleteStorageObject: onDelete || (async () => undefined)
  };
  return { deps, getState: () => current, getCompleteCount: () => completeCount, calls };
}

test('financial blockers prevent processing before the account is frozen', () => {
  const blockers = getAccountDeletionBlockers(context({
    subscriptions: [{ status: 'active', providerStatus: 'active' }],
    reservations: [{ status: 'reserved', amount: 10 }]
  }));
  assert.deepEqual(blockers, ['active_subscription', 'active_credit_reservation']);
});

test('duplicate processor invocation completes once', async () => {
  const fixture = dependencies(context());
  const process = createAccountDeletionProcessor(fixture.deps);

  const first = await process('user-1');
  const second = await process('user-1');

  assert.equal(first.status, ACCOUNT_DELETION_STATUSES.completed);
  assert.equal(second.status, ACCOUNT_DELETION_STATUSES.completed);
  assert.equal(fixture.getCompleteCount(), 1);
  assert.deepEqual(fixture.calls, ['claim', 'complete']);
});

test('missing asset is tolerated and partial deletion retries safely', async () => {
  let fail = true;
  const fixture = dependencies(
    context({ assets: [{ id: 'asset-1', storagePath: 'users/user-1/assets/asset-1/generated.png', status: 'available', storagePresent: false, recorded: true }] }),
    async () => {
      if (fail) throw new Error('temporary storage failure');
    }
  );
  const process = createAccountDeletionProcessor(fixture.deps);

  const partial = await process('user-1');
  assert.equal(partial.status, ACCOUNT_DELETION_STATUSES.partiallyCompleted);
  assert.equal(partial.assetsDeleted, 0);

  fail = false;
  const completed = await process('user-1');
  assert.equal(completed.status, ACCOUNT_DELETION_STATUSES.completed);
  assert.equal(completed.assetsDeleted, 1);
  assert.equal(fixture.getCompleteCount(), 1);
});

test('withdrawal is allowed only before processing', () => {
  assert.equal(canWithdrawAccountDeletion(ACCOUNT_DELETION_STATUSES.requested), true);
  assert.equal(canWithdrawAccountDeletion(ACCOUNT_DELETION_STATUSES.inReview), true);
  assert.equal(canWithdrawAccountDeletion(ACCOUNT_DELETION_STATUSES.processing), false);
  assert.equal(canWithdrawAccountDeletion(ACCOUNT_DELETION_STATUSES.completed), false);
});

test('runtime processor stays disabled without explicit opt-in', async () => {
  const result = await processAccountDeletionRequest('user-1');
  assert.equal(result.status, 'disabled');
});

test('failed requests are retryable without changing financial context', async () => {
  const initial = context({
    user: { id: 'user-1', provider: 'google', providerSubject: 'subject-1', email: 'user@example.com', displayName: 'User', status: 'deletion_processing' },
    request: { id: 'request-1', userId: 'user-1', status: 'failed', assetsTotal: 1, assetsDeleted: 1 },
    assets: [{ id: 'asset-1', storagePath: 'users/user-1/assets/asset-1/generated.png', status: 'erased', storagePresent: false, recorded: true }]
  });
  const fixture = dependencies(initial);
  const process = createAccountDeletionProcessor(fixture.deps);
  const result = await process('user-1');
  assert.equal(result.status, ACCOUNT_DELETION_STATUSES.completed);
  assert.equal(fixture.getState().creditAccount?.availableCredits, 1300);
  assert.equal(fixture.getState().purchases[0]?.status, 'fulfilled');
});

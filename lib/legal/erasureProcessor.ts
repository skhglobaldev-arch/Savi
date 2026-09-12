import { getSaviDataConnect, getSaviPrivateBucket } from '../firebase/admin';
import { logOperational } from '../observability/logger';

export const ACCOUNT_DELETION_STATUSES = {
  requested: 'requested',
  inReview: 'in_review',
  processing: 'processing',
  partiallyCompleted: 'partially_completed',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled'
} as const;

type DeletionStatus = (typeof ACCOUNT_DELETION_STATUSES)[keyof typeof ACCOUNT_DELETION_STATUSES];

export type AccountDeletionContext = {
  user: {
    id: string;
    provider: string;
    providerSubject: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    status: string;
  } | null;
  request: {
    id: string;
    userId: string;
    status: string;
    assetsTotal: number;
    assetsDeleted: number;
  } | null;
  creditAccount: {
    availableCredits: number;
    reservedCredits: number;
    subscriptionCredits: number;
    reservedSubscriptionCredits: number;
  } | null;
  subscriptions: Array<{ status: string; providerStatus: string }>;
  purchases: Array<{ status: string }>;
  reservations: Array<{ status: string; amount: number }>;
  generationJobs: Array<{ status: string; reservedCredits: number }>;
  assets: Array<{ id: string; storagePath: string; status: string; storagePresent: boolean; recorded: boolean }>;
};

export type AccountDeletionResult = {
  status: string;
  assetsTotal: number;
  assetsDeleted: number;
  blockers: string[];
};

export type AccountDeletionProcessorDependencies = {
  loadContext: (userId: string) => Promise<AccountDeletionContext>;
  claimProcessing: (input: {
    requestId: string;
    userId: string;
    expectedRequestStatus: string;
    expectedUserStatus: string;
    metadata: string;
  }) => Promise<void>;
  updateProgress: (input: {
    requestId: string;
    userId: string;
    expectedStatus: string;
    status: string;
    assetsTotal: number;
    assetsDeleted: number;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    metadata: string;
  }) => Promise<void>;
  markAssetErased: (input: { assetId: string; userId: string; expectedStatus: string }) => Promise<void>;
  complete: (input: { requestId: string; userId: string; tombstoneEmail: string; metadata: string }) => Promise<void>;
  listStorageObjects: (userId: string) => Promise<string[]>;
  deleteStorageObject: (storagePath: string) => Promise<void>;
};

const RETRYABLE_STATUSES = new Set<string>([
  ACCOUNT_DELETION_STATUSES.requested,
  ACCOUNT_DELETION_STATUSES.inReview,
  ACCOUNT_DELETION_STATUSES.processing,
  ACCOUNT_DELETION_STATUSES.partiallyCompleted,
  ACCOUNT_DELETION_STATUSES.failed
]);

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);
const OPEN_FINANCIAL_STATUSES = new Set(['disputed', 'dispute_open', 'refund_pending', 'refund_requested', 'chargeback_open']);

function jsonMetadata(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : 'account deletion processing failed';
}

export function getAccountDeletionBlockers(context: AccountDeletionContext) {
  const blockers: string[] = [];
  if (!context.user) blockers.push('user_missing');
  if (!context.request) blockers.push('deletion_request_missing');

  if (context.subscriptions.some((subscription) => ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) || ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.providerStatus))) {
    blockers.push('active_subscription');
  }
  if (context.purchases.some((purchase) => OPEN_FINANCIAL_STATUSES.has(purchase.status))) {
    blockers.push('unresolved_financial_event');
  }
  if (!context.creditAccount) {
    blockers.push('credit_account_missing');
  } else if (
    [
      context.creditAccount.availableCredits,
      context.creditAccount.reservedCredits,
      context.creditAccount.subscriptionCredits,
      context.creditAccount.reservedSubscriptionCredits
    ].some((value) => value < 0)
  ) {
    blockers.push('credit_account_invalid');
  }
  if (context.reservations.some((reservation) => reservation.status === 'reserved')) blockers.push('active_credit_reservation');
  if (context.generationJobs.some((job) => job.status === 'processing')) blockers.push('active_generation_job');
  if (context.user) {
    const assetPrefix = `users/${context.user.id}/assets/`;
    if (context.assets.some((asset) => !asset.storagePath.startsWith(assetPrefix) || asset.storagePath.includes('..'))) {
      blockers.push('invalid_asset_path');
    }
  }
  return blockers;
}

export function canWithdrawAccountDeletion(status: string) {
  return status === ACCOUNT_DELETION_STATUSES.requested || status === ACCOUNT_DELETION_STATUSES.inReview;
}

export function isRetryableAccountDeletionStatus(status: string) {
  return RETRYABLE_STATUSES.has(status);
}

function tombstoneEmail(userId: string) {
  return `deleted+${userId}@invalid.savi`;
}

function progressStatus(status: string, blockers: string[]) {
  if (!blockers.length) return status;
  return status === ACCOUNT_DELETION_STATUSES.processing || status === ACCOUNT_DELETION_STATUSES.partiallyCompleted
    ? ACCOUNT_DELETION_STATUSES.partiallyCompleted
    : ACCOUNT_DELETION_STATUSES.inReview;
}

export function createAccountDeletionProcessor(dependencies: AccountDeletionProcessorDependencies) {
  return async function processAccountDeletionRequest(userId: string): Promise<AccountDeletionResult> {
    let context = await dependencies.loadContext(userId);
    try {
    if (!context.request) throw new Error('DELETION_REQUEST_NOT_FOUND');

    const initialStatus = context.request.status;
    if (initialStatus === ACCOUNT_DELETION_STATUSES.completed || initialStatus === ACCOUNT_DELETION_STATUSES.cancelled) {
      return {
        status: initialStatus,
        assetsTotal: context.request.assetsTotal,
        assetsDeleted: context.request.assetsDeleted,
        blockers: []
      };
    }
    if (!isRetryableAccountDeletionStatus(initialStatus)) throw new Error('DELETION_REQUEST_STATE_UNSUPPORTED');

    const blockers = getAccountDeletionBlockers(context);
    if (blockers.length) {
      const nextStatus = progressStatus(initialStatus, blockers);
      await dependencies.updateProgress({
        requestId: context.request.id,
        userId,
        expectedStatus: initialStatus,
        status: nextStatus,
        assetsTotal: context.assets.length,
        assetsDeleted: context.assets.filter((asset) => asset.status === 'erased' && !asset.storagePresent).length,
        lastErrorCode: 'FINANCIAL_DEPENDENCY_BLOCKED',
        lastErrorMessage: blockers.join(','),
        metadata: jsonMetadata({ source: 'account_deletion_processor', blockers })
      });
      return {
        status: nextStatus,
        assetsTotal: context.assets.length,
        assetsDeleted: context.assets.filter((asset) => asset.status === 'erased' && !asset.storagePresent).length,
        blockers
      };
    }

    if (initialStatus !== ACCOUNT_DELETION_STATUSES.processing) {
      if (!context.user) throw new Error('DELETION_USER_NOT_FOUND');
      await dependencies.claimProcessing({
        requestId: context.request.id,
        userId,
        expectedRequestStatus: initialStatus,
        expectedUserStatus: context.user.status,
        metadata: jsonMetadata({ source: 'account_deletion_processor', phase: 'processing' })
      });
      context = await dependencies.loadContext(userId);
      if (!context.request || context.request.status !== ACCOUNT_DELETION_STATUSES.processing) {
        throw new Error('DELETION_REQUEST_CLAIM_NOT_CONFIRMED');
      }
    }

    const assetsTotal = context.assets.length;
    let assetsDeleted = context.assets.filter((asset) => asset.status === 'erased' && !asset.storagePresent).length;
    for (const asset of context.assets) {
      if (asset.status === 'erased' && !asset.storagePresent) continue;
      try {
        await dependencies.deleteStorageObject(asset.storagePath);
        if (asset.recorded && asset.status !== 'erased') {
          await dependencies.markAssetErased({ assetId: asset.id, userId, expectedStatus: asset.status });
        }
        assetsDeleted += 1;
        await dependencies.updateProgress({
          requestId: context.request.id,
          userId,
          expectedStatus: ACCOUNT_DELETION_STATUSES.processing,
          status: ACCOUNT_DELETION_STATUSES.processing,
          assetsTotal,
          assetsDeleted,
          lastErrorCode: null,
          lastErrorMessage: null,
          metadata: jsonMetadata({ source: 'account_deletion_processor', phase: 'assets', lastAssetId: asset.id })
        });
      } catch (error) {
        const message = errorMessage(error);
        await dependencies.updateProgress({
          requestId: context.request.id,
          userId,
          expectedStatus: ACCOUNT_DELETION_STATUSES.processing,
          status: ACCOUNT_DELETION_STATUSES.partiallyCompleted,
          assetsTotal,
          assetsDeleted,
          lastErrorCode: 'ASSET_DELETE_FAILED',
          lastErrorMessage: message,
          metadata: jsonMetadata({ source: 'account_deletion_processor', phase: 'assets', failedAssetId: asset.id })
        });
        return { status: ACCOUNT_DELETION_STATUSES.partiallyCompleted, assetsTotal, assetsDeleted, blockers: ['asset_delete_failed'] };
      }
    }

    const finalContext = await dependencies.loadContext(userId);
    const finalBlockers = getAccountDeletionBlockers(finalContext);
    if (finalBlockers.length) {
      await dependencies.updateProgress({
        requestId: context.request.id,
        userId,
        expectedStatus: ACCOUNT_DELETION_STATUSES.processing,
        status: ACCOUNT_DELETION_STATUSES.partiallyCompleted,
        assetsTotal,
        assetsDeleted,
        lastErrorCode: 'FINANCIAL_DEPENDENCY_BLOCKED',
        lastErrorMessage: finalBlockers.join(','),
        metadata: jsonMetadata({ source: 'account_deletion_processor', blockers: finalBlockers })
      });
      return { status: ACCOUNT_DELETION_STATUSES.partiallyCompleted, assetsTotal, assetsDeleted, blockers: finalBlockers };
    }

    await dependencies.complete({
      requestId: context.request.id,
      userId,
      tombstoneEmail: tombstoneEmail(userId),
      metadata: jsonMetadata({
        source: 'account_deletion_processor',
        phase: 'completed',
        assetsTotal,
        assetsDeleted,
        financialRecords: 'retained',
        providerRecords: 'provider_controlled'
      })
    });
    return { status: ACCOUNT_DELETION_STATUSES.completed, assetsTotal, assetsDeleted, blockers: [] };
    } catch (error) {
      if (context.request?.status === ACCOUNT_DELETION_STATUSES.processing) {
        await dependencies.updateProgress({
          requestId: context.request.id,
          userId,
          expectedStatus: ACCOUNT_DELETION_STATUSES.processing,
          status: ACCOUNT_DELETION_STATUSES.failed,
          assetsTotal: context.assets.length,
          assetsDeleted: context.assets.filter((asset) => asset.status === 'erased' && !asset.storagePresent).length,
          lastErrorCode: 'PROCESSOR_FAILED',
          lastErrorMessage: errorMessage(error),
          metadata: jsonMetadata({ source: 'account_deletion_processor', phase: 'failed' })
        }).catch(() => undefined);
      }
      throw error;
    }
  };
}

async function loadContext(userId: string): Promise<AccountDeletionContext> {
  const response = await getSaviDataConnect().executeQuery<Record<string, unknown>, { userId: string }>('GetAccountDeletionProcessorContext', { userId });
  const data = response.data as {
    saviUsers?: Array<NonNullable<AccountDeletionContext['user']>>;
    accountDeletionRequests?: Array<NonNullable<AccountDeletionContext['request']>>;
    creditAccounts?: Array<NonNullable<AccountDeletionContext['creditAccount']>>;
    commerceSubscriptions?: AccountDeletionContext['subscriptions'];
    commercePurchases?: AccountDeletionContext['purchases'];
    creditReservations?: AccountDeletionContext['reservations'];
    generationJobs?: AccountDeletionContext['generationJobs'];
    assets?: Array<{ id: string; storagePath: string; status: string }>;
  };
  const databaseAssets: Array<{ id: string; storagePath: string; status: string }> = [];
  for (let offset = 0; ; offset += 100) {
    const assetResponse = await getSaviDataConnect().executeQuery<{ assets?: Array<{ id: string; storagePath: string; status: string }> }, { userId: string; offset: number }>(
      'ListAccountAssets',
      { userId, offset }
    );
    const page = assetResponse.data.assets ?? [];
    databaseAssets.push(...page);
    if (page.length < 100) break;
  }
  const storagePaths = new Set(await defaultListStorageObjects(userId));
  const recordedPaths = new Set(databaseAssets.map((asset) => asset.storagePath));
  const assets: AccountDeletionContext['assets'] = databaseAssets.map((asset) => ({
    ...asset,
    storagePresent: storagePaths.has(asset.storagePath),
    recorded: true
  }));
  storagePaths.forEach((storagePath) => {
    if (!recordedPaths.has(storagePath)) {
      assets.push({ id: `storage:${storagePath}`, storagePath, status: 'storage_only', storagePresent: true, recorded: false });
    }
  });
  return {
    user: Array.isArray(data.saviUsers) ? data.saviUsers[0] ?? null : null,
    request: Array.isArray(data.accountDeletionRequests) ? data.accountDeletionRequests[0] ?? null : null,
    creditAccount: Array.isArray(data.creditAccounts) ? data.creditAccounts[0] ?? null : null,
    subscriptions: Array.isArray(data.commerceSubscriptions) ? data.commerceSubscriptions : [],
    purchases: Array.isArray(data.commercePurchases) ? data.commercePurchases : [],
    reservations: Array.isArray(data.creditReservations) ? data.creditReservations : [],
    generationJobs: Array.isArray(data.generationJobs) ? data.generationJobs : [],
    assets
  } as AccountDeletionContext;
}

async function defaultListStorageObjects(userId: string) {
  const [files] = await getSaviPrivateBucket().getFiles({ prefix: `users/${userId}/assets/` });
  return files.map((file) => file.name);
}

function mutation(operation: string, variables: Record<string, unknown>) {
  return getSaviDataConnect().executeMutation(operation, variables);
}

const defaultDependencies: AccountDeletionProcessorDependencies = {
  loadContext,
  claimProcessing: (input) => mutation('ClaimAccountDeletionProcessing', input).then(() => undefined),
  updateProgress: (input) => mutation('UpdateAccountDeletionProgress', input).then(() => undefined),
  markAssetErased: (input) => mutation('MarkAccountAssetErased', input).then(() => undefined),
  complete: (input) => mutation('CompleteAccountDeletion', input).then(() => undefined),
  listStorageObjects: defaultListStorageObjects,
  deleteStorageObject: async (storagePath) => {
    await getSaviPrivateBucket().file(storagePath).delete({ ignoreNotFound: true });
  }
};

/**
 * Deliberately opt-in. No route, login path, or page invokes this processor.
 * A future authenticated operator/worker must explicitly enable it.
 */
export async function processAccountDeletionRequest(userId: string) {
  if (process.env.SAVI_ERASURE_PROCESSOR_ENABLED !== 'true') {
    logOperational('warn', 'account_deletion_processor_disabled');
    return { status: 'disabled', assetsTotal: 0, assetsDeleted: 0, blockers: ['processor_disabled'] } satisfies AccountDeletionResult;
  }
  return createAccountDeletionProcessor(defaultDependencies)(userId);
}

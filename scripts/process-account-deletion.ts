import { getSaviDataConnect } from '../lib/firebase/admin';
import {
  processAccountDeletionRequest,
  reviewAccountDeletionRequest,
  type AccountDeletionReview
} from '../lib/legal/erasureProcessor';

type RequestLookup = {
  id: string;
  userId: string;
  status: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function usage() {
  return 'Usage: npm run account-deletion:review -- --request <DELETION_REQUEST_ID> [--execute] [--recover-processing]';
}

export function parseAccountDeletionCommand(args: string[]) {
  const requestId = args[0] === '--request' ? args[1] : undefined;
  const execute = args.includes('--execute');
  const recoverProcessing = args.includes('--recover-processing');
  const optionalArguments = args.slice(2);
  const allowedOptionalArguments = new Set(['--execute', '--recover-processing']);
  if (!requestId || !UUID_PATTERN.test(requestId) || optionalArguments.some((arg) => !allowedOptionalArguments.has(arg)) || new Set(optionalArguments).size !== optionalArguments.length || (recoverProcessing && !execute)) {
    throw new Error(usage());
  }
  return { requestId, execute, recoverProcessing };
}

function printReview(review: AccountDeletionReview) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    requestId: review.requestId,
    userId: review.userId,
    requestStatus: review.requestStatus,
    userStatus: review.userStatus,
    eligibleForProcessing: review.eligibleForProcessing,
    blockers: review.blockers,
    assets: review.assets,
    financialRecords: review.financialRecords,
    tombstone: review.tombstone,
    actions: ['freeze account during processing', 'delete only user-scoped private assets', 'anonymize eligible profile data', 'retain financial and audit records']
  }, null, 2));
}

export async function runAccountDeletionCommand(args: string[]) {
  const { requestId, execute, recoverProcessing } = parseAccountDeletionCommand(args);
  const lookup = await getSaviDataConnect().executeQuery<{ accountDeletionRequests?: RequestLookup[] }, { requestId: string }>(
    'FindAccountDeletionRequestForOperator',
    { requestId }
  );
  const request = lookup.data.accountDeletionRequests?.[0];
  if (!request) throw new Error('DELETION_REQUEST_NOT_FOUND');

  const review = await reviewAccountDeletionRequest(request.userId);
  if (review.requestId !== requestId) throw new Error('DELETION_REQUEST_OWNER_MISMATCH');
  printReview(review);

  if (!execute) return { mode: 'dry-run' as const, review };
  if (process.env.SAVI_ERASURE_PROCESSOR_ENABLED !== 'true') {
    throw new Error('SAVI_ERASURE_PROCESSOR_ENABLED=true is required with --execute.');
  }
  if (recoverProcessing) {
    if (review.requestStatus !== 'processing') throw new Error('DELETION_REQUEST_NOT_PROCESSING');
    await getSaviDataConnect().executeMutation('UpdateAccountDeletionProgress', {
      requestId,
      userId: request.userId,
      expectedStatus: 'processing',
      status: 'failed',
      assetsTotal: review.assets.recorded + review.assets.storageOnly,
      assetsDeleted: review.assets.alreadyErased,
      lastErrorCode: 'OPERATOR_RECOVERY_REQUIRED',
      lastErrorMessage: 'Processing was explicitly recovered by an authorized operator after confirming no worker remains active.',
      metadata: JSON.stringify({ source: 'account_deletion_operator', phase: 'recovered_processing' })
    });
    console.log(JSON.stringify({ mode: 'recover-processing', requestId, status: 'failed' }, null, 2));
    return { mode: 'recover-processing' as const, review };
  }
  if (!review.eligibleForProcessing) throw new Error('DELETION_REQUEST_NOT_ELIGIBLE');

  const result = await processAccountDeletionRequest(request.userId);
  console.log(JSON.stringify({ mode: 'execute', requestId, status: result.status, assetsTotal: result.assetsTotal, assetsDeleted: result.assetsDeleted, blockers: result.blockers }, null, 2));
  return { mode: 'execute' as const, review, result };
}

if (process.argv[1]?.endsWith('process-account-deletion.ts')) {
  void runAccountDeletionCommand(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Account deletion command failed.');
    process.exitCode = 1;
  });
}

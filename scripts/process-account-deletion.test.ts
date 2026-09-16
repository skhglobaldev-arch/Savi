import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAccountDeletionCommand } from './process-account-deletion';

const requestId = 'e8b0cb35-09d8-4f9a-9a81-f6cf25c6da2f';

test('account deletion operator command defaults to dry-run', () => {
  assert.deepEqual(parseAccountDeletionCommand(['--request', requestId]), { requestId, execute: false, recoverProcessing: false });
});

test('account deletion operator command requires an explicit execution gate', () => {
  assert.deepEqual(parseAccountDeletionCommand(['--request', requestId, '--execute']), { requestId, execute: true, recoverProcessing: false });
  assert.throws(() => parseAccountDeletionCommand(['--request', requestId, '--recover-processing']));
  assert.throws(() => parseAccountDeletionCommand(['--request', requestId, '--execute', '--unexpected']));
});

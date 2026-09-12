import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken, readSessionToken, type SaviUser } from './session';
import { resolveSaviAccount, SaviAccountBlockedError, type SaviAccountBootstrapDependencies, type SaviDatabaseUser } from './accountBootstrap';

const user: SaviUser = {
  id: 'google-subject-1',
  email: 'operator@example.com',
  name: 'Operator',
  planId: 'free'
};

function databaseUser(status = 'active'): SaviDatabaseUser {
  return {
    id: 'user-1',
    provider: 'google',
    providerSubject: user.id,
    email: user.email,
    displayName: user.name,
    status
  };
}

function fixture(existing: SaviDatabaseUser | null = null) {
  let current = existing;
  let createCount = 0;
  let welcomeGrantCount = existing?.status === 'active' ? 1 : 0;
  const dependencies: SaviAccountBootstrapDependencies = {
    findUser: async () => current,
    touchUser: async () => undefined,
    ensureWelcomeGrant: async () => {
      if (welcomeGrantCount === 0) welcomeGrantCount += 1;
    },
    createDatabaseUser: () => databaseUser(),
    createUserAndAccount: async (_user, createdUser) => {
      createCount += 1;
      if (current) throw new Error('unique constraint');
      current = createdUser;
      welcomeGrantCount = 1;
    }
  };
  return { dependencies, getState: () => current, getCreateCount: () => createCount, getWelcomeGrantCount: () => welcomeGrantCount };
}

test('first login creates one user, account, and welcome grant before session issuance', async () => {
  const state = fixture();
  const resolved = await resolveSaviAccount(user, state.dependencies);
  assert.equal(resolved.id, 'user-1');
  assert.equal(state.getCreateCount(), 1);
  assert.equal(state.getWelcomeGrantCount(), 1);

  process.env.SAVI_AUTH_SECRET = 'x'.repeat(32);
  const token = createSessionToken(user);
  const sessionUser = readSessionToken(token);
  assert.equal(sessionUser?.id, user.id);
  assert.equal(sessionUser?.email, user.email);
  assert.equal(sessionUser?.name, user.name);
  assert.equal(sessionUser?.planId, user.planId);
});

test('existing active users are reused without duplicate account or welcome grant', async () => {
  const state = fixture(databaseUser());
  const resolved = await resolveSaviAccount(user, state.dependencies);
  assert.equal(resolved.id, 'user-1');
  assert.equal(state.getCreateCount(), 0);
  assert.equal(state.getWelcomeGrantCount(), 1);
});

test('concurrent first-login races converge on one user and one welcome grant', async () => {
  const state = fixture();
  const results = await Promise.all([
    resolveSaviAccount(user, state.dependencies),
    resolveSaviAccount(user, state.dependencies)
  ]);
  assert.deepEqual(results.map((result) => result.id), ['user-1', 'user-1']);
  assert.equal(state.getCreateCount(), 2);
  assert.equal(state.getWelcomeGrantCount(), 1);
});

test('deletion-processing and deleted users cannot sign in or recreate', async () => {
  for (const status of ['deletion_processing', 'deleted']) {
    const state = fixture(databaseUser(status));
    await assert.rejects(resolveSaviAccount(user, state.dependencies), SaviAccountBlockedError);
    assert.equal(state.getCreateCount(), 0);
  }
});

test('bootstrap failure rejects before a session can be issued', async () => {
  const state = fixture();
  state.dependencies.createUserAndAccount = async () => {
    throw new Error('Data Connect unavailable');
  };
  let sessionIssued = false;
  try {
    await resolveSaviAccount(user, state.dependencies);
    sessionIssued = true;
  } catch {
    // Session issuance is intentionally unreachable when bootstrap fails.
  }
  assert.equal(sessionIssued, false);
  assert.equal(state.getState(), null);
});

test('successful bootstrap can be revalidated by the fail-closed session lookup', async () => {
  const state = fixture();
  await resolveSaviAccount(user, state.dependencies);
  const sessionUser = readSessionToken(createSessionToken(user));
  const validated = sessionUser ? await state.dependencies.findUser(sessionUser) : null;
  assert.equal(validated?.id, 'user-1');
  assert.equal(validated?.status, 'active');
});

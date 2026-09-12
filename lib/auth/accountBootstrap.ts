import type { SaviUser } from './session';

export type SaviDatabaseUser = {
  id: string;
  provider: string;
  providerSubject: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  status: string;
};

export class SaviAccountBlockedError extends Error {
  constructor() {
    super('This SAVI account is unavailable while its deletion request is being processed.');
    this.name = 'SaviAccountBlockedError';
  }
}

export type SaviAccountBootstrapDependencies = {
  findUser: (user: SaviUser) => Promise<SaviDatabaseUser | null>;
  touchUser: (user: SaviUser, databaseUser: SaviDatabaseUser) => Promise<void>;
  ensureWelcomeGrant: (databaseUser: SaviDatabaseUser) => Promise<void>;
  createDatabaseUser: (user: SaviUser) => SaviDatabaseUser;
  createUserAndAccount: (user: SaviUser, databaseUser: SaviDatabaseUser) => Promise<void>;
};

function assertAccountCanSignIn(databaseUser: SaviDatabaseUser) {
  if (databaseUser.status === 'deletion_processing' || databaseUser.status === 'deleted') {
    throw new SaviAccountBlockedError();
  }
}

export async function resolveSaviAccount(user: SaviUser, dependencies: SaviAccountBootstrapDependencies) {
  const existing = await dependencies.findUser(user);
  if (existing) {
    assertAccountCanSignIn(existing);
    await dependencies.touchUser(user, existing);
    if (existing.status === 'active') await dependencies.ensureWelcomeGrant(existing);
    return existing;
  }

  const databaseUser = dependencies.createDatabaseUser(user);
  try {
    await dependencies.createUserAndAccount(user, databaseUser);
    return databaseUser;
  } catch (error) {
    const racedUser = await dependencies.findUser(user).catch(() => null);
    if (!racedUser) throw error;

    assertAccountCanSignIn(racedUser);
    if (racedUser.status === 'active') await dependencies.ensureWelcomeGrant(racedUser);
    return racedUser;
  }
}

import { randomUUID } from 'node:crypto';
import { getSaviDataConnect } from '@/lib/firebase/admin';

export const SAVI_TERMS_POLICY_VERSION = 'terms-v1';
export const SAVI_PRIVACY_POLICY_VERSION = 'privacy-v1';

type ExistingConsent = {
  id: string;
  userId: string;
  consentType: string;
  policyVersion: string;
  source: string;
  acceptedAt: string;
};

function isDuplicateWrite(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('duplicate') || message.includes('unique') || message.includes('already exists') || message.includes('constraint');
}

async function dataConnectQuery<T, Variables extends object>(operation: string, variables: Variables) {
  const response = await getSaviDataConnect().executeQuery<T, Variables>(operation, variables);
  return response.data;
}

async function dataConnectMutation<T, Variables extends object>(operation: string, variables: Variables) {
  const response = await getSaviDataConnect().executeMutation<T, Variables>(operation, variables);
  return response.data;
}

async function findConsent(userId: string, consentType: string, policyVersion: string) {
  const data = await dataConnectQuery<{ legalConsents?: ExistingConsent[] }, { userId: string; consentType: string; policyVersion: string }>('FindLegalConsent', {
    userId,
    consentType,
    policyVersion
  });
  return data.legalConsents?.[0] ?? null;
}

async function ensureConsent(userId: string, consentType: string, policyVersion: string, source: string) {
  if (await findConsent(userId, consentType, policyVersion)) return;

  try {
    await dataConnectMutation('RecordLegalConsent', {
      id: randomUUID(),
      userId,
      consentType,
      policyVersion,
      source,
      metadata: JSON.stringify({ policyVersion, source })
    });
  } catch (error) {
    if (!isDuplicateWrite(error)) throw error;
  }

  if (!(await findConsent(userId, consentType, policyVersion))) {
    throw new Error('Legal consent could not be recorded.');
  }
}

export async function recordCurrentLegalConsent(userId: string, source = 'google_authenticated_session') {
  await ensureConsent(userId, 'terms', SAVI_TERMS_POLICY_VERSION, source);
  await ensureConsent(userId, 'privacy', SAVI_PRIVACY_POLICY_VERSION, source);
}

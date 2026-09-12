import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import { getSaviDataConnect } from '@/lib/firebase/admin';
import { findExistingSaviDatabaseUser } from '@/lib/savi/textToImageInfrastructure';

export const runtime = 'nodejs';

type DeletionRequest = {
  id: string;
  userId: string;
  status: string;
  requestedAt: string;
  startedAt?: string | null;
  processedAt?: string | null;
  updatedAt?: string;
  attemptCount?: number;
  assetsTotal?: number;
  assetsDeleted?: number;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  metadata?: string | null;
};

function isDuplicateWrite(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('duplicate') || message.includes('unique') || message.includes('already exists') || message.includes('constraint');
}

async function findRequest(userId: string) {
  const response = await getSaviDataConnect().executeQuery<{ accountDeletionRequests?: DeletionRequest[] }, { userId: string }>('FindAccountDeletionRequest', { userId });
  return response.data.accountDeletionRequests?.[0] ?? null;
}

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Please sign in before requesting account deletion.' }, { status: 401 });

  try {
    const databaseUser = await findExistingSaviDatabaseUser(session);
    if (!databaseUser) {
      return NextResponse.json({ error: 'This SAVI account is not available.' }, { status: 404 });
    }
    const existing = await findRequest(databaseUser.id);
    if (existing?.status === 'cancelled') {
      await getSaviDataConnect().executeMutation('ReopenAccountDeletionRequest', {
        requestId: existing.id,
        userId: databaseUser.id,
        metadata: JSON.stringify({ source: 'settings_account_deletion_request_reopened' })
      });
      const reopened = await findRequest(databaseUser.id);
      if (!reopened) return NextResponse.json({ error: 'SAVI could not reopen the deletion request.' }, { status: 503 });
      return NextResponse.json({ ok: true, status: reopened.status, alreadyRequested: false });
    }
    if (existing) return NextResponse.json({ ok: true, status: existing.status, alreadyRequested: true });

    try {
      await getSaviDataConnect().executeMutation('RequestAccountDeletion', {
        id: randomUUID(),
        userId: databaseUser.id,
        metadata: JSON.stringify({ source: 'settings_account_deletion_request' })
      });
    } catch (error) {
      if (!isDuplicateWrite(error)) throw error;
    }

    const created = await findRequest(databaseUser.id);
    if (!created) return NextResponse.json({ error: 'SAVI could not record the deletion request.' }, { status: 503 });
    return NextResponse.json({ ok: true, status: created.status, alreadyRequested: false });
  } catch {
    return NextResponse.json({ error: 'SAVI could not record the deletion request.' }, { status: 503 });
  }
}

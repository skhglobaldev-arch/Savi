import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import { getSaviDataConnect } from '@/lib/firebase/admin';
import { canWithdrawAccountDeletion } from '@/lib/legal/erasureProcessor';
import { findExistingSaviDatabaseUser } from '@/lib/savi/textToImageInfrastructure';
import { createSaviRateLimitResponse, checkSaviRateLimit } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';

export const runtime = 'nodejs';

type DeletionRequest = { id: string; status: string };

async function findRequest(userId: string) {
  const response = await getSaviDataConnect().executeQuery<{ accountDeletionRequests?: DeletionRequest[] }, { userId: string }>(
    'FindAccountDeletionRequest',
    { userId }
  );
  return response.data.accountDeletionRequests?.[0] ?? null;
}

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Please sign in before withdrawing account deletion.' }, { status: 401 });
  const rateLimit = await checkSaviRateLimit({
    rateLimitClass: 'ACCOUNT_LEGAL',
    identity: getSaviRequestIdentity(request, session.id)
  });
  if (!rateLimit.allowed) return createSaviRateLimitResponse(rateLimit);

  try {
    const databaseUser = await findExistingSaviDatabaseUser(session);
    if (!databaseUser) return NextResponse.json({ error: 'This SAVI account is not available.' }, { status: 404 });
    const existing = await findRequest(databaseUser.id);
    if (!existing) return NextResponse.json({ error: 'No deletion request is pending.' }, { status: 404 });
    if (!canWithdrawAccountDeletion(existing.status) || !['active', 'deletion_requested'].includes(databaseUser.status)) {
      return NextResponse.json({ error: 'Deletion can only be withdrawn before processing begins.', category: 'DELETION_NOT_CANCELLABLE' }, { status: 409 });
    }

    await getSaviDataConnect().executeMutation('WithdrawAccountDeletionRequest', {
      requestId: existing.id,
      userId: databaseUser.id,
      expectedStatus: existing.status,
      expectedUserStatus: databaseUser.status,
      metadata: JSON.stringify({ source: 'account_deletion_request_withdrawn' })
    });
    return NextResponse.json({ ok: true, status: 'cancelled' });
  } catch {
    return NextResponse.json({ error: 'SAVI could not withdraw the deletion request.' }, { status: 503 });
  }
}

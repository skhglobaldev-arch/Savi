import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import { recordCurrentLegalConsent } from '@/lib/legal/consent';
import { resolveSaviDatabaseUser } from '@/lib/savi/textToImageInfrastructure';
import { logOperational } from '@/lib/observability/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Please sign in before recording legal consent.' }, { status: 401 });

  try {
    const databaseUser = await resolveSaviDatabaseUser(session);
    await recordCurrentLegalConsent(databaseUser.id);
    return NextResponse.json({ ok: true });
  } catch {
    logOperational('error', 'legal_consent_record_failed');
    return NextResponse.json({ error: 'SAVI could not record the current legal acknowledgement.' }, { status: 503 });
  }
}

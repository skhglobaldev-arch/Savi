import { NextRequest, NextResponse } from 'next/server';

import { createMobileSessionToken, readMobileSessionToken, redeemMobileExchangeGrant } from '@/lib/auth/mobileSession';
import { assertSaviProductionConfiguration } from '@/lib/config/saviConfig';
import { logOperational } from '@/lib/observability/logger';
import { findExistingSaviDatabaseUser, resolveSaviDatabaseUser, SaviInfrastructureError } from '@/lib/savi/textToImageInfrastructure';

export const runtime = 'nodejs';

function bearerToken(request: NextRequest) {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice('Bearer '.length) : undefined;
}

function unavailable() {
  return NextResponse.json({ error: 'Mobile authentication is unavailable.' }, { status: 503 });
}

export async function POST(request: NextRequest) {
  try {
    assertSaviProductionConfiguration('auth');
  } catch {
    return unavailable();
  }

  const body = (await request.json().catch(() => null)) as { grant?: unknown; code_verifier?: unknown } | null;
  const user = redeemMobileExchangeGrant(typeof body?.grant === 'string' ? body.grant : undefined, typeof body?.code_verifier === 'string' ? body.code_verifier : undefined);
  if (!user) return NextResponse.json({ error: 'The mobile sign-in request is invalid or has expired.' }, { status: 401 });

  try {
    await resolveSaviDatabaseUser({ ...user, planId: 'free' });
    return NextResponse.json({ accessToken: createMobileSessionToken(user), user: { ...user, planId: 'free' } });
  } catch (error) {
    if (error instanceof SaviInfrastructureError && error.category === 'ACCOUNT_FROZEN') {
      return NextResponse.json({ error: 'This SAVI account is unavailable.' }, { status: 423 });
    }
    logOperational('error', 'mobile_session_establishment_failed');
    return NextResponse.json({ error: 'Mobile sign-in could not be completed.' }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const user = readMobileSessionToken(bearerToken(request));
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  try {
    const databaseUser = await findExistingSaviDatabaseUser(user);
    if (!databaseUser || ['deletion_processing', 'deleted'].includes(databaseUser.status)) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}

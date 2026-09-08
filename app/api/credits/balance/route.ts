import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import { getAuthoritativeCreditBalance } from '@/lib/savi/textToImageInfrastructure';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json(
      { error: 'Please sign in to view credits.', category: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  }

  try {
    const balance = await getAuthoritativeCreditBalance(user);
    if (!balance) {
      return NextResponse.json(
        { error: 'No credit account is available for this SAVI account.', category: 'CREDIT_ACCOUNT_MISSING' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { availableCredits: balance.availableCredits },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'SAVI could not load your credit balance.', category: 'CREDIT_BALANCE_UNAVAILABLE' },
      { status: 502 }
    );
  }
}

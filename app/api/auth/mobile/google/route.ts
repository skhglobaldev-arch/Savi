import { NextRequest, NextResponse } from 'next/server';

import { createMobileOAuthState, mobileCallbackUri } from '@/lib/auth/mobileSession';
import { isGoogleAuthConfigured } from '@/lib/auth/session';
import { assertSaviProductionConfiguration } from '@/lib/config/saviConfig';
import { createSaviRateLimitResponse, checkSaviRateLimit } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    assertSaviProductionConfiguration('auth');
  } catch {
    return NextResponse.json({ error: 'Mobile authentication is unavailable.' }, { status: 503 });
  }

  const rateLimit = await checkSaviRateLimit({ rateLimitClass: 'AUTH', identity: getSaviRequestIdentity(request) });
  if (!rateLimit.allowed) return createSaviRateLimitResponse(rateLimit);
  if (!isGoogleAuthConfigured()) return NextResponse.json({ error: 'Mobile authentication is unavailable.' }, { status: 503 });

  try {
    const signedState = createMobileOAuthState({
      callbackUri: request.nextUrl.searchParams.get('redirect_uri') || '',
      codeChallenge: request.nextUrl.searchParams.get('code_challenge') || '',
      appState: request.nextUrl.searchParams.get('state') || ''
    });
    const origin = new URL(process.env.NODE_ENV === 'production' ? process.env.SAVI_APP_ORIGIN! : request.url).origin;
    const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!);
    googleUrl.searchParams.set('redirect_uri', `${origin}/api/auth/mobile/google/callback`);
    googleUrl.searchParams.set('response_type', 'code');
    googleUrl.searchParams.set('scope', 'openid email profile');
    googleUrl.searchParams.set('state', signedState);
    googleUrl.searchParams.set('prompt', 'select_account');
    return NextResponse.redirect(googleUrl);
  } catch {
    return NextResponse.json({ error: `Mobile authentication must return to ${mobileCallbackUri()}.` }, { status: 400 });
  }
}

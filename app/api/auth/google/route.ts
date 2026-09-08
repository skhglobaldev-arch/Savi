import { NextRequest, NextResponse } from 'next/server';
import {
  createOAuthState,
  isGoogleAuthConfigured,
  safeReturnTo,
  SAVI_OAUTH_RETURN_TO_COOKIE,
  SAVI_OAUTH_STATE_COOKIE
} from '@/lib/auth/session';
import { createSaviRateLimitResponse, checkSaviRateLimit } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const rateLimit = await checkSaviRateLimit({ rateLimitClass: 'AUTH', identity: getSaviRequestIdentity(request) });
  if (!rateLimit.allowed) return createSaviRateLimitResponse(rateLimit);

  const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));
  if (!isGoogleAuthConfigured()) {
    return NextResponse.redirect(new URL(`/?auth=unavailable&returnTo=${encodeURIComponent(returnTo)}`, request.url));
  }

  const origin = new URL(request.url).origin;
  const state = createOAuthState();
  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!);
  googleUrl.searchParams.set('redirect_uri', `${origin}/api/auth/google/callback`);
  googleUrl.searchParams.set('response_type', 'code');
  googleUrl.searchParams.set('scope', 'openid email profile');
  googleUrl.searchParams.set('state', state);
  googleUrl.searchParams.set('prompt', 'select_account');

  const response = NextResponse.redirect(googleUrl);
  const options = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 10 * 60 };
  response.cookies.set(SAVI_OAUTH_STATE_COOKIE, state, options);
  response.cookies.set(SAVI_OAUTH_RETURN_TO_COOKIE, returnTo, options);
  return response;
}

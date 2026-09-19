import { NextRequest, NextResponse } from 'next/server';

import { createMobileExchangeGrant, mobileCallbackUri, readMobileOAuthState } from '@/lib/auth/mobileSession';
import { isGoogleAuthConfigured, type SaviUser } from '@/lib/auth/session';
import { assertSaviProductionConfiguration } from '@/lib/config/saviConfig';
import { logOperational } from '@/lib/observability/logger';
import { createSaviRateLimitResponse, checkSaviRateLimit } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';

export const runtime = 'nodejs';

type GoogleTokenInfo = {
  aud?: string;
  iss?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
};

function nativeRedirect(state: string | undefined, error?: string, grant?: string) {
  const url = new URL(mobileCallbackUri());
  if (state) url.searchParams.set('state', state);
  if (error) url.searchParams.set('error', error);
  if (grant) url.searchParams.set('grant', grant);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const signedState = readMobileOAuthState(request.nextUrl.searchParams.get('state') || undefined);
  if (!signedState) {
    logOperational('warn', 'mobile_google_auth_callback_rejected', { reason: 'invalid_oauth_state' });
    return nativeRedirect(undefined, 'authentication_failed');
  }

  try {
    assertSaviProductionConfiguration('auth');
  } catch {
    return nativeRedirect(signedState.appState, 'authentication_unavailable');
  }
  const rateLimit = await checkSaviRateLimit({ rateLimitClass: 'AUTH', identity: getSaviRequestIdentity(request) });
  if (!rateLimit.allowed) return createSaviRateLimitResponse(rateLimit);
  if (!isGoogleAuthConfigured()) return nativeRedirect(signedState.appState, 'authentication_unavailable');

  const code = request.nextUrl.searchParams.get('code');
  if (!code) return nativeRedirect(signedState.appState, 'authentication_failed');

  try {
    const origin = new URL(process.env.NODE_ENV === 'production' ? process.env.SAVI_APP_ORIGIN! : request.url).origin;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${origin}/api/auth/mobile/google/callback`,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = (await tokenResponse.json().catch(() => ({}))) as { id_token?: string };
    if (!tokenResponse.ok || !tokenData.id_token) throw new Error('token_exchange_failed');

    const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`);
    const profile = (await infoResponse.json().catch(() => ({}))) as GoogleTokenInfo;
    const verified = profile.email_verified === true || profile.email_verified === 'true';
    const correctAudience = profile.aud === process.env.GOOGLE_CLIENT_ID;
    const correctIssuer = profile.iss === 'https://accounts.google.com' || profile.iss === 'accounts.google.com';
    if (!infoResponse.ok || !verified || !correctAudience || !correctIssuer || !profile.sub || !profile.email) throw new Error('profile_validation_failed');

    const user: Omit<SaviUser, 'planId'> = { id: profile.sub, email: profile.email, name: profile.name?.trim() || profile.email.split('@')[0], picture: profile.picture };
    return nativeRedirect(signedState.appState, undefined, createMobileExchangeGrant(user, signedState.codeChallenge));
  } catch (error) {
    logOperational('warn', 'mobile_google_auth_callback_rejected', { reason: error instanceof Error ? error.message : 'unknown' });
    return nativeRedirect(signedState.appState, 'authentication_failed');
  }
}

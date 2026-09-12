import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionToken,
  isGoogleAuthConfigured,
  safeReturnTo,
  SAVI_OAUTH_RETURN_TO_COOKIE,
  SAVI_OAUTH_STATE_COOKIE,
  SAVI_SESSION_COOKIE,
  type SaviUser
} from '@/lib/auth/session';
import { createSaviRateLimitResponse, checkSaviRateLimit } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';
import { assertSaviProductionConfiguration } from '@/lib/config/saviConfig';
import { logOperational } from '@/lib/observability/logger';
import { resolveSaviDatabaseUser, SaviInfrastructureError } from '@/lib/savi/textToImageInfrastructure';

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

function redirectWithStatus(request: NextRequest, status: 'failed' | 'unavailable') {
  const base = process.env.NODE_ENV === 'production' ? process.env.SAVI_APP_ORIGIN || request.url : request.url;
  return NextResponse.redirect(new URL(`/?auth=${status}`, base));
}

export async function GET(request: NextRequest) {
  try {
    assertSaviProductionConfiguration('auth');
  } catch {
    return redirectWithStatus(request, 'unavailable');
  }

  const rateLimit = await checkSaviRateLimit({ rateLimitClass: 'AUTH', identity: getSaviRequestIdentity(request) });
  if (!rateLimit.allowed) return createSaviRateLimitResponse(rateLimit);

  if (!isGoogleAuthConfigured()) return redirectWithStatus(request, 'unavailable');

  const code = request.nextUrl.searchParams.get('code');
  const receivedState = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get(SAVI_OAUTH_STATE_COOKIE)?.value;
  const returnTo = safeReturnTo(request.cookies.get(SAVI_OAUTH_RETURN_TO_COOKIE)?.value);
  if (!code || !receivedState || !expectedState || receivedState !== expectedState) {
    logOperational('warn', 'google_auth_callback_rejected', { reason: 'invalid_oauth_state' });
    return redirectWithStatus(request, 'failed');
  }

  try {
    const origin = new URL(process.env.NODE_ENV === 'production' ? process.env.SAVI_APP_ORIGIN! : request.url).origin;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = (await tokenResponse.json().catch(() => ({}))) as { id_token?: string };
    if (!tokenResponse.ok || !tokenData.id_token) {
      logOperational('warn', 'google_auth_callback_rejected', { reason: 'token_exchange_failed' });
      return redirectWithStatus(request, 'failed');
    }

    const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`);
    const profile = (await infoResponse.json().catch(() => ({}))) as GoogleTokenInfo;
    const verified = profile.email_verified === true || profile.email_verified === 'true';
    const correctAudience = profile.aud === process.env.GOOGLE_CLIENT_ID;
    const correctIssuer = profile.iss === 'https://accounts.google.com' || profile.iss === 'accounts.google.com';
    if (!infoResponse.ok || !verified || !correctAudience || !correctIssuer || !profile.sub || !profile.email) {
      logOperational('warn', 'google_auth_callback_rejected', { reason: 'profile_validation_failed' });
      return redirectWithStatus(request, 'failed');
    }

    const user: Omit<SaviUser, 'planId'> = {
      id: profile.sub,
      email: profile.email,
      name: profile.name?.trim() || profile.email.split('@')[0],
      picture: profile.picture
    };
    try {
      await resolveSaviDatabaseUser({ ...user, planId: 'free' });
    } catch (error) {
      if (error instanceof SaviInfrastructureError && error.category === 'ACCOUNT_FROZEN') {
        logOperational('warn', 'google_auth_callback_rejected', { reason: 'account_deletion_in_progress' });
        return redirectWithStatus(request, 'unavailable');
      }
      throw error;
    }
    const redirectBase = process.env.NODE_ENV === 'production' ? process.env.SAVI_APP_ORIGIN || request.url : request.url;
    const response = NextResponse.redirect(new URL(returnTo, redirectBase));
    response.cookies.set(SAVI_SESSION_COOKIE, createSessionToken(user), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30
    });
    response.cookies.delete(SAVI_OAUTH_STATE_COOKIE);
    response.cookies.delete(SAVI_OAUTH_RETURN_TO_COOKIE);
    return response;
  } catch {
    logOperational('error', 'google_auth_callback_failed');
    return redirectWithStatus(request, 'failed');
  }
}

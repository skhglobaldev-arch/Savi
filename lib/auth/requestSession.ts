import { NextRequest } from 'next/server';

import { readMobileSessionToken } from '@/lib/auth/mobileSession';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';

export function readSaviRequestSession(request: NextRequest) {
  const browserSession = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (browserSession) return browserSession;
  const authorization = request.headers.get('authorization') || '';
  return authorization.startsWith('Bearer ') ? readMobileSessionToken(authorization.slice('Bearer '.length)) : null;
}

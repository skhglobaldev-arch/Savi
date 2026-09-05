import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return NextResponse.json({ user: readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value) });
}

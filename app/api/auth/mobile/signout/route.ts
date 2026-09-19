import { NextRequest, NextResponse } from 'next/server';

import { readMobileSessionToken } from '@/lib/auth/mobileSession';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
  // Mobile sessions are signed like the existing web session cookie. Device logout clears the only stored bearer credential.
  if (!readMobileSessionToken(token)) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: true });
}

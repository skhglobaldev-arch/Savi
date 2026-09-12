import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import { findExistingSaviDatabaseUser } from '@/lib/savi/textToImageInfrastructure';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const response = NextResponse.json({ user: null });
  const user = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!user) return response;

  try {
    const databaseUser = await findExistingSaviDatabaseUser(user);
    if (!databaseUser || ['deletion_processing', 'deleted'].includes(databaseUser.status)) {
      response.cookies.delete(SAVI_SESSION_COOKIE);
      return response;
    }
    return NextResponse.json({ user });
  } catch {
    response.cookies.delete(SAVI_SESSION_COOKIE);
    return response;
  }
}

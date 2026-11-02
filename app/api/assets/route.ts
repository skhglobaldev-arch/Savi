import { NextRequest, NextResponse } from 'next/server';
import { readSaviRequestSession } from '@/lib/auth/requestSession';
import { getSaviDataConnect } from '@/lib/firebase/admin';
import { listOwnedLibraryAssets } from '@/lib/savi/assetLibrary';
import { checkSaviRateLimit, createSaviRateLimitResponse } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = readSaviRequestSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in to view your Library.', category: 'AUTH_REQUIRED' }, { status: 401 });
  const offsetValue = request.nextUrl.searchParams.get('offset') || '0';
  if (!/^\d{1,6}$/.test(offsetValue)) return NextResponse.json({ error: 'Invalid Library page.' }, { status: 400 });
  const limit = await checkSaviRateLimit({ rateLimitClass: 'ASSET_READ', identity: getSaviRequestIdentity(request, session.id) });
  if (!limit.allowed) return createSaviRateLimitResponse(limit);
  try {
    const page = await listOwnedLibraryAssets(session, Number(offsetValue), async <T,>(operation: string, variables: Record<string, string | number>) => {
      const result = await getSaviDataConnect().executeQuery<T>(operation, variables);
      return result.data;
    });
    if (!page) return NextResponse.json({ error: 'This SAVI account is unavailable.', category: 'AUTH_REQUIRED' }, { status: 403 });
    return NextResponse.json(page, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ error: 'SAVI could not load your Library.' }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { CommerceCatalogError } from '@/lib/commerce/catalog';
import { CommerceError, getCommerceAccountState, getCommerceSessionUser } from '@/lib/commerce/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = getCommerceSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to view billing.', category: 'AUTH_REQUIRED' }, { status: 401 });
  }

  try {
    return NextResponse.json(await getCommerceAccountState(user), {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error) {
    if (error instanceof CommerceCatalogError || error instanceof CommerceError) {
      return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    }
    return NextResponse.json({ error: 'SAVI could not load billing state.', category: 'BILLING_STATE_UNAVAILABLE' }, { status: 502 });
  }
}

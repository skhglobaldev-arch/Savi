import { NextRequest, NextResponse } from 'next/server';
import { CommerceCatalogError } from '@/lib/commerce/catalog';
import { CommerceError, createBillingPortalSession, getCommerceOrigin, getCommerceSessionUser } from '@/lib/commerce/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const user = getCommerceSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to manage billing.', category: 'AUTH_REQUIRED' }, { status: 401 });
  }

  try {
    return NextResponse.json(await createBillingPortalSession(user, getCommerceOrigin(request)));
  } catch (error) {
    if (error instanceof CommerceCatalogError || error instanceof CommerceError) {
      return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    }
    return NextResponse.json({ error: 'SAVI could not open Stripe billing portal.', category: 'BILLING_PORTAL_UNAVAILABLE' }, { status: 502 });
  }
}

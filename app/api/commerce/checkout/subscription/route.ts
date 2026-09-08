import { NextRequest, NextResponse } from 'next/server';
import { CommerceCatalogError } from '@/lib/commerce/catalog';
import { CommerceError, createSubscriptionCheckout, getCommerceOrigin, getCommerceSessionUser } from '@/lib/commerce/server';

export const runtime = 'nodejs';

function planIdFromBody(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'planId') return null;
  const planId = (body as { planId?: unknown }).planId;
  return typeof planId === 'string' ? planId : null;
}

export async function POST(request: NextRequest) {
  const user = getCommerceSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Please sign in before starting checkout.', category: 'AUTH_REQUIRED' }, { status: 401 });
  }

  const planId = planIdFromBody(await request.json().catch(() => null));
  if (!planId) {
    return NextResponse.json({ error: 'Choose a valid SAVI plan.', category: 'INVALID_CHECKOUT_REQUEST' }, { status: 400 });
  }

  try {
    return NextResponse.json(await createSubscriptionCheckout(user, planId, getCommerceOrigin(request)));
  } catch (error) {
    if (error instanceof CommerceCatalogError || error instanceof CommerceError) {
      return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    }
    return NextResponse.json({ error: 'SAVI could not start subscription checkout.', category: 'CHECKOUT_UNAVAILABLE' }, { status: 502 });
  }
}

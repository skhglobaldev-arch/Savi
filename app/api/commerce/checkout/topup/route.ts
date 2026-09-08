import { NextRequest, NextResponse } from 'next/server';
import { CommerceCatalogError } from '@/lib/commerce/catalog';
import { CommerceError, createTopUpCheckout, getCommerceOrigin, getCommerceSessionUser } from '@/lib/commerce/server';
import { createSaviRateLimitResponse, checkSaviRateLimit } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';

export const runtime = 'nodejs';

function packIdFromBody(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'packId') return null;
  const packId = (body as { packId?: unknown }).packId;
  return typeof packId === 'string' ? packId : null;
}

export async function POST(request: NextRequest) {
  const user = getCommerceSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Please sign in before starting checkout.', category: 'AUTH_REQUIRED' }, { status: 401 });
  }

  const rateLimit = await checkSaviRateLimit({ rateLimitClass: 'COMMERCE', identity: getSaviRequestIdentity(request, user.id) });
  if (!rateLimit.allowed) return createSaviRateLimitResponse(rateLimit);

  const packId = packIdFromBody(await request.json().catch(() => null));
  if (!packId) {
    return NextResponse.json({ error: 'Choose a valid SAVI credit pack.', category: 'INVALID_CHECKOUT_REQUEST' }, { status: 400 });
  }

  try {
    return NextResponse.json(await createTopUpCheckout(user, packId, getCommerceOrigin(request)));
  } catch (error) {
    if (error instanceof CommerceCatalogError || error instanceof CommerceError) {
      return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    }
    return NextResponse.json({ error: 'SAVI could not start top-up checkout.', category: 'CHECKOUT_UNAVAILABLE' }, { status: 502 });
  }
}

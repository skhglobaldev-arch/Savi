import { NextResponse } from 'next/server';
import { customerSafeCommerceCatalog, CommerceCatalogError } from '@/lib/commerce/catalog';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(customerSafeCommerceCatalog(), {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error) {
    if (error instanceof CommerceCatalogError) {
      return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    }
    return NextResponse.json({ error: 'SAVI commerce catalog is unavailable.', category: 'COMMERCE_CATALOG_UNAVAILABLE' }, { status: 502 });
  }
}

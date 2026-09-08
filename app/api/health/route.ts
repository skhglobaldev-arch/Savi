import { NextResponse } from 'next/server';
import { assertSaviReadiness } from '@/lib/config/saviConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    assertSaviReadiness();
    return NextResponse.json(
      { status: 'ok' },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch {
    return NextResponse.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}

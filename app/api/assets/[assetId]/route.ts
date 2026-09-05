import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import { getSaviPrivateBucket } from '@/lib/firebase/admin';
import { getOwnedPrivateAsset, SaviInfrastructureError } from '@/lib/savi/textToImageInfrastructure';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeFilename(filename: string) {
  return filename.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 160) || 'savi-asset';
}

export async function GET(request: NextRequest, context: { params: { assetId: string } }) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Please sign in to view this asset.' }, { status: 401 });

  const assetId = context.params.assetId;
  if (!UUID.test(assetId)) return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });

  try {
    const asset = await getOwnedPrivateAsset(session, assetId);
    if (!asset || asset.status !== 'available') return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });

    const file = getSaviPrivateBucket().file(asset.storagePath);
    const [exists] = await file.exists();
    if (!exists) return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });

    return new NextResponse(Readable.toWeb(file.createReadStream()) as ReadableStream, {
      headers: {
        'Content-Type': asset.mimeType,
        'Content-Disposition': `inline; filename="${safeFilename(asset.filename)}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (error) {
    if (error instanceof SaviInfrastructureError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'SAVI could not load this asset.' }, { status: 500 });
  }
}

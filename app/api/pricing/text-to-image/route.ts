import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import { getConfiguredTextToImageModel, quoteSaviPrice, SaviPricingError, SAVI_TEXT_TO_IMAGE_PROVIDER } from '@/lib/pricing/saviPricing';

export const runtime = 'nodejs';

function referenceImageCount(value: string | null) {
  if (value === null) return 0;
  if (!/^\d+$/.test(value)) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Invalid reference image count for pricing.');
  }
  return Number(value);
}

export async function GET(request: NextRequest) {
  const user = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json(
      { error: 'Please sign in to view the current image price.', category: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const quote = quoteSaviPrice({
      provider: SAVI_TEXT_TO_IMAGE_PROVIDER,
      model: getConfiguredTextToImageModel(),
      toolId: 'text_to_image',
      operation: 'image_generation',
      input: { referenceImageCount: referenceImageCount(searchParams.get('referenceImageCount')) },
      output: {
        imageCount: 1,
        resolution: searchParams.get('quality') || '1080',
        aspectRatio: searchParams.get('aspectRatio') || '1:1'
      }
    });

    return NextResponse.json(
      {
        toolId: quote.toolId,
        credits: quote.saviCredits,
        pricingVersion: quote.pricingVersion,
        provisional: quote.provisional
      },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch (error) {
    if (error instanceof SaviPricingError) {
      return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    }
    return NextResponse.json(
      { error: 'SAVI could not load the current image price.', category: 'PRICING_NOT_CONFIGURED' },
      { status: 503 }
    );
  }
}

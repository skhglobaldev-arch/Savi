import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import {
  getConfiguredTextModel,
  getConfiguredTextToImageModel,
  getConfiguredTtsModel,
  getConfiguredVideoModel,
  estimateSaviVoiceReservationSeconds,
  quoteSaviPrice,
  SAVI_AI_PDF_TOOL_IDS,
  SAVI_IMAGE_GENERATION_TOOL_IDS,
  SAVI_IMAGE_TEXT_TOOL_IDS,
  SAVI_LOCAL_PDF_MODEL,
  SAVI_LOCAL_PDF_PROVIDER,
  SAVI_LOCAL_PDF_TOOL_IDS,
  SAVI_TEXT_TO_IMAGE_PROVIDER,
  SAVI_VIDEO_TOOL_IDS,
  SAVI_VOICE_TOOL_IDS,
  SaviPricingError
} from '@/lib/pricing/saviPricing';
import { SAVI_AI_PDF_MAX_FILE_BYTES, SAVI_AI_PDF_MAX_PAGES } from '@/lib/pdf/limits';
import { createSaviRateLimitResponse, checkSaviRateLimit } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';

export const runtime = 'nodejs';

function whole(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Invalid pricing input.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Unsupported pricing input.');
  }
  return parsed;
}

function includes(values: readonly string[], value: string) {
  return values.includes(value);
}

function quoteResponse(quote: ReturnType<typeof quoteSaviPrice>) {
  return NextResponse.json(
    { toolId: quote.toolId, credits: quote.saviCredits, pricingVersion: quote.pricingVersion, provisional: false },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
  );
}

function isPdfFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && (value.type === 'application/pdf' || value.name.toLowerCase().endsWith('.pdf'));
}

export async function GET(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Please sign in to view a SAVI quote.', category: 'AUTH_REQUIRED' }, { status: 401 });

  try {
    const params = request.nextUrl.searchParams;
    const toolId = params.get('toolId') || '';
    const referenceImageCount = whole(params.get('referenceImageCount'), 0, 0, 6);
    const quality = params.get('quality') || '1080';
    const aspectRatio = params.get('aspectRatio') || '1:1';
    const duration = whole(params.get('duration'), 6, 1, 1200);
    const textCharacters = whole(params.get('textCharacters'), 1, 1, 12_000);
    const pageCount = whole(params.get('pageCount'), 1, 1, 500);
    let quote;

    if (toolId === 'text_to_image' || includes(SAVI_IMAGE_GENERATION_TOOL_IDS, toolId)) {
      quote = quoteSaviPrice({
        provider: SAVI_TEXT_TO_IMAGE_PROVIDER,
        model: getConfiguredTextToImageModel(),
        toolId,
        operation: 'image_generation',
        input: { referenceImageCount },
        output: { imageCount: 1, resolution: quality, aspectRatio }
      });
    } else if (includes(SAVI_IMAGE_TEXT_TOOL_IDS, toolId)) {
      quote = quoteSaviPrice({
        provider: SAVI_TEXT_TO_IMAGE_PROVIDER,
        model: getConfiguredTextModel(),
        toolId,
        operation: 'text_generation',
        input: { referenceImageCount, textCharacters },
        output: {}
      });
    } else if (includes(SAVI_VIDEO_TOOL_IDS, toolId)) {
      quote = quoteSaviPrice({
        provider: SAVI_TEXT_TO_IMAGE_PROVIDER,
        model: getConfiguredVideoModel(),
        toolId,
        operation: 'video_generation',
        input: { referenceImageCount },
        output: { resolution: '720', videoSeconds: duration }
      });
    } else if (includes(SAVI_VOICE_TOOL_IDS, toolId)) {
      quote = quoteSaviPrice({
        provider: SAVI_TEXT_TO_IMAGE_PROVIDER,
        model: getConfiguredTtsModel(),
        toolId,
        operation: 'speech_generation',
        input: { textCharacters },
        output: { audioSeconds: estimateSaviVoiceReservationSeconds(textCharacters) }
      });
    } else if (includes(SAVI_LOCAL_PDF_TOOL_IDS, toolId)) {
      quote = quoteSaviPrice({
        provider: SAVI_LOCAL_PDF_PROVIDER,
        model: SAVI_LOCAL_PDF_MODEL,
        toolId,
        operation: 'document_local',
        input: { pageCount },
        output: {}
      });
    } else if (includes(SAVI_AI_PDF_TOOL_IDS, toolId)) {
      quote = quoteSaviPrice({
        provider: SAVI_TEXT_TO_IMAGE_PROVIDER,
        model: getConfiguredTextModel(),
        toolId,
        operation: 'document_ai',
        input: { pageCount, textCharacters },
        output: {}
      });
    } else {
      throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This SAVI tool does not have a current quote.');
    }

    return quoteResponse(quote);
  } catch (error) {
    if (error instanceof SaviPricingError) return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    return NextResponse.json({ error: 'SAVI could not load the current quote.', category: 'PRICING_NOT_CONFIGURED' }, { status: 503 });
  }
}

/**
 * AI PDF pricing depends on the actual uploaded document. This endpoint reads
 * only enough local metadata to quote it; it never calls a provider or writes
 * a GenerationJob, ledger entry, or storage object.
 */
export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Please sign in to view a SAVI quote.', category: 'AUTH_REQUIRED' }, { status: 401 });

  const rateLimit = await checkSaviRateLimit({ rateLimitClass: 'FILE_PROCESSING', identity: getSaviRequestIdentity(request, session.id) });
  if (!rateLimit.allowed) return createSaviRateLimitResponse(rateLimit);

  try {
    const form = await request.formData();
    const toolId = typeof form.get('toolId') === 'string' ? String(form.get('toolId')) : '';
    if (!includes(SAVI_AI_PDF_TOOL_IDS, toolId)) {
      throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'This quote needs an AI PDF tool.');
    }
    const file = form.get('file');
    if (!isPdfFile(file)) throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Upload a PDF to quote this tool.');
    if (file.size > SAVI_AI_PDF_MAX_FILE_BYTES) {
      throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'This PDF is too large to quote. Use a file under 25MB.');
    }

    let pageCount = 0;
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      pageCount = pdf.getPageCount();
    } catch {
      throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'This is not a readable PDF.');
    }
    if (!pageCount || pageCount > SAVI_AI_PDF_MAX_PAGES) {
      throw new SaviPricingError('INVALID_PRICING_INPUT', 400, `Use a PDF with up to ${SAVI_AI_PDF_MAX_PAGES} pages for this AI tool.`);
    }

    return quoteResponse(quoteSaviPrice({
      provider: SAVI_TEXT_TO_IMAGE_PROVIDER,
      model: getConfiguredTextModel(),
      toolId,
      operation: 'document_ai',
      input: { pageCount, textCharacters: file.size },
      output: {}
    }));
  } catch (error) {
    if (error instanceof SaviPricingError) return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    return NextResponse.json({ error: 'SAVI could not load the current PDF quote.', category: 'PRICING_NOT_CONFIGURED' }, { status: 503 });
  }
}

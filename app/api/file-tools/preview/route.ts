import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import { createSaviRateLimitResponse, checkSaviRateLimit } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';
import { logOperational } from '@/lib/observability/logger';

export const runtime = 'nodejs';

const MAX_PREVIEW_PAGES = 80;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function isPdfFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && (value.type === 'application/pdf' || value.name.toLowerCase().endsWith('.pdf'));
}

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Please sign in before previewing a PDF.', category: 'AUTH_REQUIRED' }, { status: 401 });
  }

  const rateLimit = await checkSaviRateLimit({ rateLimitClass: 'FILE_PREVIEW', identity: getSaviRequestIdentity(request, session.id) });
  if (!rateLimit.allowed) return createSaviRateLimitResponse(rateLimit);

  try {
    const form = await request.formData();
    const file = form.get('file');
    const requestedMaxPages = Number(form.get('maxPages') ?? MAX_PREVIEW_PAGES);
    const maxPages = Math.min(Math.max(requestedMaxPages || MAX_PREVIEW_PAGES, 1), MAX_PREVIEW_PAGES);

    if (!isPdfFile(file)) {
      return NextResponse.json({ error: 'Please upload a valid PDF file.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'This PDF is too large for preview right now. Please use a file under 25MB.' }, { status: 413 });
    }

    const pdf = await PDFDocument.load(await file.arrayBuffer());
    const pageCount = pdf.getPageCount();
    if (!pageCount) return NextResponse.json({ error: 'Could not read this PDF.' }, { status: 422 });
    const pages = Array.from({ length: Math.min(pageCount, maxPages) }, (_, index) => ({ pageNumber: index + 1 }));

    return NextResponse.json({
      fileName: file.name,
      size: file.size,
      pageCount,
      renderedPages: pages.length,
      pages
    });
  } catch (error) {
    logOperational('error', 'pdf_preview_failed');
    return NextResponse.json({ error: 'Preview failed. Please try another PDF.' }, { status: 500 });
  }
}

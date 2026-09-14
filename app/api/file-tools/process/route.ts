import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import {
  SAVI_LOCAL_PDF_MODEL,
  SAVI_LOCAL_PDF_PROVIDER,
  SAVI_ILOVEPDF_PDF_TO_JPG_MODEL,
  SAVI_ILOVEPDF_PROVIDER
} from '@/lib/pricing/saviPricing';
import {
  isUnavailablePdfAction,
  SAVI_UNAVAILABLE_PDF_TOOL_RESPONSE
} from '@/lib/savi/backendSecurity';
import { runProtectedOperation } from '@/lib/savi/protectedOperations';
import { SaviInfrastructureError } from '@/lib/savi/textToImageInfrastructure';
import { createSaviRateLimitResponse, checkSaviRateLimit } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';
import { parsePageRange } from '@/lib/pdf/serverTools';
import { createPagePlanPdf, mergePdfFiles, type LocalPdfOutput, PdfProcessingInputError } from '@/lib/pdf/localOperations';
import { convertPdfToJpg, mapIlovePdfError } from '@/lib/pdf/ilovePdfServer';

export const runtime = 'nodejs';

type PdfAction = 'merge_pdf' | 'organize_pdf' | 'split_pdf' | 'pdf_to_jpg';
type PagePlanItem = { pageNumber: number; rotation?: number };
type PdfOutput = LocalPdfOutput | {
  bytes: Buffer;
  filename: string;
  mimeType: 'application/zip';
  mediaType: 'archive';
  providerRequestId?: string;
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;
const MAX_FILES = 12;
const MAX_PAGES_PER_FILE = 250;
const MAX_TOTAL_PAGES = 500;
const MAX_JPG_OUTPUT_PAGES = 100;

const PdfInputError = PdfProcessingInputError;

const ACTIVE_PDF_ACTIONS: readonly PdfAction[] = ['merge_pdf', 'organize_pdf', 'split_pdf', 'pdf_to_jpg'];

function isPdfAction(value: string | undefined): value is PdfAction {
  return Boolean(value && ACTIVE_PDF_ACTIONS.includes(value as PdfAction));
}

function isPdfFile(value: FormDataEntryValue): value is File {
  return value instanceof File && (value.type === 'application/pdf' || value.name.toLowerCase().endsWith('.pdf'));
}

function readPagePlan(value: FormDataEntryValue | null): PagePlanItem[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({ pageNumber: Number(item?.pageNumber), rotation: Number(item?.rotation || 0) }))
      .filter((item) => Number.isInteger(item.pageNumber) && item.pageNumber > 0);
  } catch {
    return [];
  }
}

function readSwapPages(value: FormDataEntryValue | null): [number, number] | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const first = Number(parsed[0]);
    const second = Number(parsed[1]);
    return Number.isInteger(first) && Number.isInteger(second) && first > 0 && second > 0 && first !== second
      ? [first, second]
      : null;
  } catch {
    return null;
  }
}

async function getValidatedPageCount(file: File) {
  try {
    const pdf = await PDFDocument.load(await file.arrayBuffer());
    const pageCount = pdf.getPageCount();
    if (!pageCount) throw new Error('empty');
    return pageCount;
  } catch {
    throw new PdfInputError(`“${file.name}” is not a readable PDF.`);
  }
}

async function validateFiles(files: File[]) {
  if (!files.length) throw new PdfInputError('Upload at least one PDF file.');
  if (files.length > MAX_FILES) throw new PdfInputError(`You can process up to ${MAX_FILES} PDFs at once.`);
  if (files.some((file) => file.size > MAX_FILE_SIZE)) {
    throw new PdfInputError('One PDF is too large. Use files under 25MB.', 413);
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw new PdfInputError('This request is too large. Keep all uploaded PDFs under 80MB total.', 413);

  let totalPages = 0;
  for (const file of files) {
    const pageCount = await getValidatedPageCount(file);
    if (pageCount > MAX_PAGES_PER_FILE) {
      throw new PdfInputError(`“${file.name}” has too many pages. Use PDFs with up to ${MAX_PAGES_PER_FILE} pages.`);
    }
    totalPages += pageCount;
  }
  if (totalPages > MAX_TOTAL_PAGES) {
    throw new PdfInputError(`This request has too many pages. Keep all uploaded PDFs under ${MAX_TOTAL_PAGES} pages total.`);
  }
  return totalPages;
}

async function createJpgZip(file: File, pageRange: string | null): Promise<PdfOutput> {
  const source = await PDFDocument.load(await file.arrayBuffer());
  const pages = parsePageRange(pageRange, source.getPageCount());
  if (!pages.length) throw new PdfInputError('Select at least one PDF page.');
  if (pages.length > MAX_JPG_OUTPUT_PAGES) throw new PdfInputError(`Convert up to ${MAX_JPG_OUTPUT_PAGES} pages to JPG at once.`);

  // iLoveAPI converts every page in the supplied PDF. Building a local subset
  // preserves the user's page selection without adding another provider call.
  const selectedPdf = await createPagePlanPdf(file, pages.map((pageNumber) => ({ pageNumber })), 'split');
  try {
    return await convertPdfToJpg({ bytes: selectedPdf.bytes, filename: file.name });
  } catch (error) {
    const mapped = mapIlovePdfError(error);
    const failure = new SaviInfrastructureError(mapped.category, mapped.status, mapped.message, mapped.providerRequestId);
    throw failure;
  }
}

async function processPdf(action: PdfAction, files: File[], form: FormData): Promise<PdfOutput> {
  if (action === 'merge_pdf') {
    if (files.length < 2) throw new PdfInputError('Upload at least two PDFs to merge.');
    return mergePdfFiles(files);
  }
  const file = files[0];
  if (action === 'organize_pdf' || action === 'split_pdf') {
    let pagePlan = readPagePlan(form.get('pagePlan'));
    const swapPages = action === 'organize_pdf' ? readSwapPages(form.get('swapPages')) : null;
    if (swapPages && !pagePlan.length) {
      const pageCount = await getValidatedPageCount(file);
      if (swapPages[0] > pageCount || swapPages[1] > pageCount) {
        throw new PdfInputError(`This PDF has ${pageCount} pages, so those page numbers cannot be swapped.`);
      }
      pagePlan = Array.from({ length: pageCount }, (_, index) => ({ pageNumber: index + 1, rotation: 0 }));
      const firstIndex = swapPages[0] - 1;
      const secondIndex = swapPages[1] - 1;
      [pagePlan[firstIndex], pagePlan[secondIndex]] = [pagePlan[secondIndex], pagePlan[firstIndex]];
    }
    return createPagePlanPdf(file, pagePlan, action === 'split_pdf' ? 'split' : 'organize');
  }
  if (action === 'pdf_to_jpg') return createJpgZip(file, typeof form.get('pages') === 'string' ? String(form.get('pages')) : 'all');
  throw new PdfInputError('Choose a valid PDF tool.');
}

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Please sign in before using this tool.', category: 'AUTH_REQUIRED' }, { status: 401 });

  const rateLimit = await checkSaviRateLimit({ rateLimitClass: 'FILE_PROCESSING', identity: getSaviRequestIdentity(request, session.id) });
  if (!rateLimit.allowed) return createSaviRateLimitResponse(rateLimit);

  try {
    const form = await request.formData();
    const actionValue = typeof form.get('action') === 'string' ? String(form.get('action')) : undefined;
    if (isUnavailablePdfAction(actionValue)) {
      return NextResponse.json(SAVI_UNAVAILABLE_PDF_TOOL_RESPONSE, { status: 503 });
    }
    if (!isPdfAction(actionValue)) throw new PdfInputError('Choose a valid PDF tool.');
    const action = actionValue;
    const submittedFiles = form.getAll('files');
    if (submittedFiles.some((file) => !isPdfFile(file))) {
      throw new PdfInputError('Use PDF files only.');
    }
    const files = submittedFiles as File[];
    const pageCount = await validateFiles(files);
    const clientRequestId = typeof form.get('clientRequestId') === 'string' ? String(form.get('clientRequestId')) : '';
    const result = await runProtectedOperation({
      user: session,
      clientRequestId,
      toolId: action,
      provider: action === 'pdf_to_jpg' ? SAVI_ILOVEPDF_PROVIDER : SAVI_LOCAL_PDF_PROVIDER,
      model: action === 'pdf_to_jpg' ? SAVI_ILOVEPDF_PDF_TO_JPG_MODEL : SAVI_LOCAL_PDF_MODEL,
      operation: 'document_local',
      pricingInput: { pageCount },
      pricingOutput: {},
      mediaType: action === 'pdf_to_jpg' ? 'archive' : 'document',
      generate: async () => {
        const output = await processPdf(action, files, form);
        return { ...output, metadata: { pageCount, processing: action === 'pdf_to_jpg' ? 'ilovepdf_eu' : 'local_pdf' } };
      }
    });
    if (result.state === 'processing') {
      return NextResponse.json({ status: 'processing', jobId: result.jobId, availableCredits: result.availableCredits }, { status: 202 });
    }
    return NextResponse.json({
      asset: `/api/assets/${result.assetId}`,
      assetId: result.assetId,
      jobId: result.jobId,
      filename: result.filename,
      mediaType: result.mediaType,
      availableCredits: result.availableCredits
    });
  } catch (error) {
    if (error instanceof SaviInfrastructureError) return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    if (error instanceof PdfInputError) return NextResponse.json({ error: error.message, category: 'INVALID_INPUT' }, { status: error.status });
    return NextResponse.json({ error: 'SAVI could not process this PDF. Your credits were not used.', category: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

import { PDFDocument, degrees } from 'pdf-lib';
import { sanitizeFileName } from './serverTools.ts';

export type LocalPdfOutput = {
  bytes: Buffer;
  filename: string;
  mimeType: 'application/pdf';
  mediaType: 'document';
};

export class PdfProcessingInputError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'PdfProcessingInputError';
  }
}

function normaliseRotation(rotation = 0) {
  const next = ((rotation % 360) + 360) % 360;
  return [0, 90, 180, 270].includes(next) ? next : 0;
}

export async function mergePdfFiles(files: File[]): Promise<LocalPdfOutput> {
  const output = await PDFDocument.create();
  for (const file of files) {
    const source = await PDFDocument.load(await file.arrayBuffer());
    const copiedPages = await output.copyPages(source, source.getPageIndices());
    copiedPages.forEach((page) => output.addPage(page));
  }
  return { bytes: Buffer.from(await output.save()), filename: 'savi-merged.pdf', mimeType: 'application/pdf', mediaType: 'document' };
}

export async function createPagePlanPdf(file: File, pagePlan: Array<{ pageNumber: number; rotation?: number }>, mode: 'organize' | 'split'): Promise<LocalPdfOutput> {
  const source = await PDFDocument.load(await file.arrayBuffer());
  const output = await PDFDocument.create();
  const pageCount = source.getPageCount();
  let safePlan = pagePlan.filter((item) => Number.isInteger(item.pageNumber) && item.pageNumber >= 1 && item.pageNumber <= pageCount);
  if (!safePlan.length && mode === 'organize') {
    safePlan = Array.from({ length: pageCount }, (_, index) => ({ pageNumber: index + 1, rotation: 0 }));
  }
  if (!safePlan.length) throw new PdfProcessingInputError(mode === 'split' ? 'Select at least one page to export.' : 'No pages are available to export.');
  if (safePlan.length > 500) throw new PdfProcessingInputError('Export up to 500 pages at a time.');
  for (const item of safePlan) {
    const [copiedPage] = await output.copyPages(source, [item.pageNumber - 1]);
    copiedPage.setRotation(degrees(normaliseRotation(item.rotation)));
    output.addPage(copiedPage);
  }
  const suffix = mode === 'split' ? 'selected-pages' : 'organized';
  return {
    bytes: Buffer.from(await output.save()),
    filename: `${sanitizeFileName(file.name)}-${suffix}.pdf`,
    mimeType: 'application/pdf',
    mediaType: 'document'
  };
}

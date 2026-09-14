import { PDFDocument } from 'pdf-lib';

export const SAVI_PDF_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const SAVI_PDF_MAX_PAGES_PER_FILE = 250;

export class PdfClientValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfClientValidationError';
  }
}

export type ClientPdfPage = {
  pageNumber: number;
  rotation: 0;
  selected: boolean;
};

export function isPdfFile(file: Pick<File, 'name' | 'type'>) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export async function inspectPdfFile(file: File) {
  if (!isPdfFile(file)) {
    throw new PdfClientValidationError('Invalid PDF. Choose a file ending in .pdf.');
  }
  if (file.size > SAVI_PDF_MAX_FILE_BYTES) {
    throw new PdfClientValidationError('File too large. Use a PDF under 25MB.');
  }

  try {
    const pdf = await PDFDocument.load(await file.arrayBuffer());
    const pageCount = pdf.getPageCount();
    if (!pageCount) throw new Error('empty');
    if (pageCount > SAVI_PDF_MAX_PAGES_PER_FILE) {
      throw new PdfClientValidationError(`This PDF has too many pages. Use up to ${SAVI_PDF_MAX_PAGES_PER_FILE} pages.`);
    }
    return { pageCount };
  } catch (error) {
    if (error instanceof PdfClientValidationError) throw error;
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('encrypt') || message.includes('password')) {
      throw new PdfClientValidationError('Password-protected PDFs are not supported here.');
    }
    throw new PdfClientValidationError('Could not read this PDF. Choose a valid, readable PDF.');
  }
}

export function createClientPdfPages(pageCount: number, maxPages = pageCount): ClientPdfPage[] {
  return Array.from({ length: Math.min(pageCount, maxPages) }, (_, index) => ({
    pageNumber: index + 1,
    rotation: 0 as const,
    selected: true
  }));
}

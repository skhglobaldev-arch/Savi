export type PdfWorkflowAction = 'merge_pdf' | 'organize_pdf' | 'split_pdf' | 'pdf_to_jpg';

export type PdfWorkflowInput = {
  authenticated: boolean;
  quote: number | null;
  balance: number | null;
  hasFile?: boolean;
  fileCount?: number;
  readyFileCount?: number;
  pending?: boolean;
  invalid?: boolean;
  pageCount?: number;
  selectedPageCount?: number;
};

export type PdfWorkflowState = {
  ready: boolean;
  reason?: string;
};

export function getPdfWorkflowState(action: PdfWorkflowAction, input: PdfWorkflowInput): PdfWorkflowState {
  if (!input.authenticated) return { ready: false, reason: 'Sign in to process your PDF.' };
  if (input.quote === null) return { ready: false, reason: 'Waiting for the current SAVI price.' };
  if (input.balance === null) return { ready: false, reason: 'Loading your SAVI credit balance.' };
  if (input.balance < input.quote) {
    return { ready: false, reason: `You need ${input.quote - input.balance} more credits.` };
  }

  if (action === 'merge_pdf') {
    if ((input.fileCount || 0) < 2) return { ready: false, reason: 'Choose at least two valid PDFs.' };
    if (input.pending) return { ready: false, reason: 'SAVI is still reading the selected PDFs.' };
    if (input.invalid) return { ready: false, reason: 'Remove the invalid PDF before merging.' };
    if ((input.readyFileCount || 0) !== input.fileCount) return { ready: false, reason: 'SAVI is still validating a PDF.' };
  }

  if (action === 'organize_pdf') {
    if (!input.hasFile) return { ready: false, reason: 'Choose a PDF first.' };
    if (input.pending) return { ready: false, reason: 'SAVI is still reading the PDF.' };
    if ((input.selectedPageCount || 0) < 1) return { ready: false, reason: 'Select at least one page to export.' };
  }

  if (action === 'split_pdf' || action === 'pdf_to_jpg') {
    if (!input.hasFile) return { ready: false, reason: 'Choose a PDF first.' };
    if (input.pending) return { ready: false, reason: 'SAVI is still reading the PDF.' };
    if ((input.selectedPageCount || 0) < 1) return { ready: false, reason: 'Select at least one page to export.' };
  }

  return { ready: true };
}

export function buildPdfPagePlan(
  pages: Array<{ pageNumber: number; rotation?: number; selected?: boolean }>,
  selectedOnly = false
) {
  return pages
    .filter((page) => !selectedOnly || page.selected)
    .map(({ pageNumber, rotation }) => ({ pageNumber, rotation: rotation || 0 }));
}

export const PDF_PREVIEW_COST = 0;
export const SAVI_EXTRACT_IMAGES_AVAILABLE = false;

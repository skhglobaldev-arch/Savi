export const SAVI_UNAVAILABLE_PDF_ACTION = 'extract_images' as const;

export const SAVI_UNAVAILABLE_PDF_TOOL_RESPONSE = {
  error: 'This PDF tool is temporarily unavailable. Please try another PDF tool.',
  category: 'TOOL_UNAVAILABLE'
} as const;

export function isUnavailablePdfAction(action: string | undefined) {
  return action === SAVI_UNAVAILABLE_PDF_ACTION;
}

export function createSaviUnexpectedErrorResponse() {
  return {
    error: 'Something went wrong. Please try again.',
    category: 'INTERNAL_ERROR'
  } as const;
}

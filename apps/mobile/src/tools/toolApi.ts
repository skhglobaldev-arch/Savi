import { saviApiOrigin } from '@/src/auth/config';

import type {
  CreditBalance,
  TextToImageAspectRatio,
  TextToImageQuality,
  TextToImageResult,
  ToolApiError,
  ToolQuote,
} from './types';

function authenticatedHeaders(accessToken: string, contentType = false) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function readError(response: Response): Promise<ToolApiError> {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown; category?: unknown };
  const error = new Error(typeof body.error === 'string' ? body.error : 'SAVI could not complete this request.') as ToolApiError;
  error.status = response.status;
  error.category = typeof body.category === 'string' ? body.category : undefined;
  return error;
}

export async function getCreditBalance(accessToken: string): Promise<CreditBalance> {
  const response = await fetch(`${saviApiOrigin}/api/credits/balance`, { headers: authenticatedHeaders(accessToken) });
  if (!response.ok) throw await readError(response);
  const body = (await response.json()) as CreditBalance;
  if (!Number.isFinite(body.availableCredits)) throw new Error('SAVI returned an invalid credit balance.');
  return body;
}

export async function quoteTextToImage(
  accessToken: string,
  input: { quality: TextToImageQuality; aspectRatio: TextToImageAspectRatio },
): Promise<ToolQuote> {
  const params = new URLSearchParams({ quality: input.quality, aspectRatio: input.aspectRatio });
  const response = await fetch(`${saviApiOrigin}/api/pricing/text-to-image?${params.toString()}`, {
    headers: authenticatedHeaders(accessToken),
  });
  if (!response.ok) throw await readError(response);
  const body = (await response.json()) as ToolQuote;
  if (body.toolId !== 'text_to_image' || !Number.isFinite(body.credits)) throw new Error('SAVI returned an invalid image quote.');
  return body;
}

export async function generateTextToImage(
  accessToken: string,
  input: {
    prompt: string;
    quality: TextToImageQuality;
    aspectRatio: TextToImageAspectRatio;
    clientRequestId: string;
  },
): Promise<TextToImageResult> {
  const response = await fetch(`${saviApiOrigin}/api/image/generate`, {
    method: 'POST',
    headers: authenticatedHeaders(accessToken, true),
    body: JSON.stringify({ ...input, toolId: 'text_to_image' }),
  });
  if (!response.ok || response.status === 202) throw await readError(response);
  const body = (await response.json()) as TextToImageResult;
  if (!body.assetId || !body.image || !body.filename || !body.jobId || !Number.isFinite(body.availableCredits)) {
    throw new Error('SAVI returned an incomplete image result.');
  }
  return body;
}

export function privateAssetUrl(assetPath: string) {
  return new URL(assetPath, saviApiOrigin).toString();
}

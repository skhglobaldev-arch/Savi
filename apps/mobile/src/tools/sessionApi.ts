import { File } from 'expo-file-system';
import { saviApiOrigin } from '@/src/auth/config';
import { currentMobileUser } from '@/src/auth/mobileAuth';
import { jsonExecutionInput, quoteParameters, type PagePlan, type SessionFile, type ToolContract, type ToolInput, type ToolResultKind } from '../../../../lib/tools/session';
import type { ToolApiError, ToolQuote } from './types';

export type NativeToolResult = { assetId: string; filename: string; kind: ToolResultKind; mimeType?: string; availableCredits?: number; jobId?: string };
export type LibraryItem = { id: string; toolId: string; filename: string; mediaType: ToolResultKind; mimeType: string; createdAt: string; url: string };

export async function handleExpiredToolSession(cause: unknown, token: string, restore: () => Promise<void>) {
  // A route awaiting bearer support must not send a valid session into a restore loop.
  if ((cause as { status?: number })?.status === 401 && !await currentMobileUser(token)) await restore();
}

export async function authenticatedRequest(token: string, path: string, options: RequestInit = {}) {
  const response = await fetch(`${saviApiOrigin}${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  if (!response.ok || response.status === 202) {
    const body = await response.json().catch(() => ({})) as { error?: string; category?: string; status?: string };
    const error = new Error(response.status === 202 ? 'SAVI is still processing. Check the same request again; it will not be charged twice.' : body.error || 'SAVI could not complete this request.') as ToolApiError;
    error.status = response.status;
    error.category = body.category;
    throw error;
  }
  return response;
}

function appendFile(form: FormData, key: string, file: SessionFile) {
  form.append(key, { uri: file.uri, type: file.mimeType, name: file.name } as unknown as Blob);
}

export async function inspectNativePdf(token: string, file: SessionFile, signal?: AbortSignal) {
  const form = new FormData();
  appendFile(form, 'file', file);
  const response = await authenticatedRequest(token, '/api/file-tools/preview', { method: 'POST', body: form, signal });
  const body = await response.json() as { pageCount: number };
  if (!Number.isInteger(body.pageCount) || body.pageCount < 1) throw new Error('This PDF has no readable pages.');
  return body.pageCount;
}

export async function quoteNativeTool(token: string, contract: ToolContract, input: ToolInput, files: SessionFile[], signal?: AbortSignal): Promise<ToolQuote> {
  let response: Response;
  if (contract.endpoint === '/api/file-tools/ai') {
    if (!files[0]?.pageCount) throw new Error('Choose a valid PDF to load its quote.');
    const form = new FormData();
    form.append('toolId', contract.executionId);
    appendFile(form, 'file', files[0]);
    response = await authenticatedRequest(token, '/api/pricing/quote', { method: 'POST', body: form, signal });
  } else {
    const params = new URLSearchParams(quoteParameters(contract, input, files));
    response = await authenticatedRequest(token, `/api/pricing/quote?${params}`, { signal });
  }
  const quote = await response.json() as ToolQuote;
  if (quote.toolId !== contract.executionId || !Number.isFinite(quote.credits) || quote.credits <= 0 || !quote.pricingVersion) throw new Error('SAVI returned an invalid tool quote.');
  return quote;
}

export async function executeNativeTool(token: string, contract: ToolContract, input: ToolInput, files: SessionFile[], pagePlan: PagePlan, clientRequestId: string): Promise<NativeToolResult> {
  let options: RequestInit;
  if (contract.pdf) {
    const form = new FormData();
    form.append(contract.endpoint.endsWith('/ai') ? 'toolId' : 'action', contract.executionId);
    form.append('clientRequestId', clientRequestId);
    form.append('prompt', input.prompt.trim());
    form.append('pages', input.pages.trim() || 'all');
    form.append('pagePlan', JSON.stringify(pagePlan.filter(page => page.selected).map(({ pageNumber, rotation }) => ({ pageNumber, rotation }))));
    for (const file of files) appendFile(form, contract.endpoint.endsWith('/ai') ? 'file' : 'files', file);
    options = { method: 'POST', body: form };
  } else {
    const references = [];
    const orderedFiles = contract.tool.id === 'first_last' ? ['Start frame', 'End frame', 'Reference'].flatMap(role => files.filter(file => file.role === role)) : files;
    for (const file of orderedFiles) {
      if (file.size > contract.maxFileBytes) throw new Error('This reference file is too large.');
      references.push({ data: await new File(file.uri).base64(), mimeType: file.mimeType, name: file.role ? `${file.role}: ${file.name}` : file.name });
    }
    options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(jsonExecutionInput(contract, input, references, clientRequestId)) };
  }
  const response = await authenticatedRequest(token, contract.endpoint, options);
  const body = await response.json() as { assetId?: string; filename?: string; availableCredits?: number; jobId?: string };
  if (!body.assetId || !/^[0-9a-f-]{32,36}$/i.test(body.assetId) || !body.filename || !body.jobId) throw new Error('SAVI returned an incomplete result. Retry the same request safely.');
  return { assetId: body.assetId, filename: body.filename, kind: contract.kind, availableCredits: body.availableCredits, jobId: body.jobId };
}

export async function loadNativeLibrary(token: string, offset = 0, signal?: AbortSignal) {
  const response = await authenticatedRequest(token, `/api/assets?offset=${offset}`, { signal });
  const page = await response.json() as { assets: LibraryItem[]; nextOffset: number | null };
  if (!Array.isArray(page.assets)) throw new Error('SAVI returned an invalid Library response.');
  return page;
}

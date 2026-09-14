import { createHmac, randomUUID } from 'node:crypto';

const ILOVE_PDF_API_ORIGIN = 'https://api.ilovepdf.com';
const ILOVE_PDF_API_VERSION = 'v1';
const ILOVE_PDF_REGION = 'eu';
const PROVIDER_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 250 * 1024 * 1024;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type IlovePdfProviderOptions = {
  fetchImpl?: FetchLike;
  sleep?: (milliseconds: number) => Promise<void>;
  publicKey?: string;
  secretKey?: string;
  nowSeconds?: () => number;
};

export type IlovePdfOutput = {
  bytes: Buffer;
  filename: string;
  mimeType: 'application/zip';
  mediaType: 'archive';
  providerRequestId: string;
};

export type IlovePdfErrorCode = 'configuration' | 'authentication' | 'rate_limit' | 'timeout' | 'provider' | 'invalid_response';

export class IlovePdfError extends Error {
  readonly code: IlovePdfErrorCode;
  readonly status: number;
  readonly providerRequestId?: string;

  constructor(
    message: string,
    code: IlovePdfErrorCode,
    status: number,
    providerRequestId?: string
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.providerRequestId = providerRequestId;
    this.name = 'IlovePdfError';
  }
}

export function mapIlovePdfError(error: unknown) {
  if (!(error instanceof IlovePdfError)) {
    return { category: 'PROVIDER_SERVER_ERROR' as const, status: 502, message: 'The PDF conversion service is temporarily unavailable.' };
  }
  if (error.code === 'rate_limit') {
    return { category: 'PROVIDER_RATE_LIMIT' as const, status: 429, message: 'The PDF conversion service is busy. Please try again shortly.', providerRequestId: error.providerRequestId };
  }
  if (error.code === 'timeout') {
    return { category: 'PROVIDER_TIMEOUT' as const, status: 504, message: 'The PDF conversion service took too long. Your credits were not used.', providerRequestId: error.providerRequestId };
  }
  if (error.code === 'configuration') {
    return { category: 'PROVIDER_SERVER_ERROR' as const, status: 503, message: 'PDF conversion is not connected yet. Your credits were not used.' };
  }
  if (error.code === 'authentication') {
    return { category: 'PROVIDER_SERVER_ERROR' as const, status: 502, message: 'The PDF conversion service could not authenticate. Your credits were not used.', providerRequestId: error.providerRequestId };
  }
  return { category: 'PROVIDER_SERVER_ERROR' as const, status: 502, message: 'The PDF conversion service could not complete this file. Your credits were not used.', providerRequestId: error.providerRequestId };
}

function base64Url(value: string) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function createIlovePdfToken(publicKey: string, secretKey: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    jti: publicKey,
    iss: 'api.ilovepdf.com',
    iat: nowSeconds - 5,
    exp: nowSeconds + 3600
  }));
  const signature = createHmac('sha256', secretKey).update(`${header}.${payload}`).digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${signature}`;
}

function safeFilename(name: string) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]/g, '-').replace(/\.+/g, '.').slice(0, 80) || 'savi-file';
  return `${base}.pdf`;
}

function providerRequestId(response: Response) {
  return response.headers.get('x-request-id') || response.headers.get('x-ilovepdf-request-id') || undefined;
}

function serverOrigin(server: unknown) {
  if (typeof server !== 'string' || !server) throw new IlovePdfError('iLoveAPI returned an invalid task server.', 'invalid_response', 502);
  const value = server.startsWith('https://') ? server : `https://${server}`;
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash || !/^[a-z0-9.-]+$/i.test(parsed.hostname)) {
    throw new IlovePdfError('iLoveAPI returned an invalid task server.', 'invalid_response', 502);
  }
  return parsed.origin;
}

async function delay(milliseconds: number, sleep: IlovePdfProviderOptions['sleep']) {
  if (sleep) return sleep(milliseconds);
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function request(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  options: { sleep?: IlovePdfProviderOptions['sleep']; retrySafe?: boolean } = {}
): Promise<Response> {
  const maxAttempts = options.retrySafe ? 2 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new IlovePdfError('iLoveAPI request timed out.', 'timeout', 504);
      }
      throw new IlovePdfError('iLoveAPI request failed.', 'provider', 502);
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) return response;
    const requestId = providerRequestId(response);
    if (options.retrySafe && attempt < maxAttempts && (response.status === 429 || response.status >= 500)) {
      await delay(Math.min(2_000, 250 * attempt), options.sleep);
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      throw new IlovePdfError('iLoveAPI authentication failed.', 'authentication', 502, requestId);
    }
    if (response.status === 429) throw new IlovePdfError('iLoveAPI rate limit reached.', 'rate_limit', 429, requestId);
    throw new IlovePdfError('iLoveAPI rejected the PDF task.', 'provider', response.status >= 500 ? 502 : 422, requestId);
  }
  throw new IlovePdfError('iLoveAPI request failed.', 'provider', 502);
}

async function jsonResponse<T>(response: Response, message: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') throw new IlovePdfError(message, 'invalid_response', 502, providerRequestId(response));
  return data as T;
}

export async function convertPdfToJpg(
  input: { bytes: Buffer; filename: string },
  options: IlovePdfProviderOptions = {}
): Promise<IlovePdfOutput> {
  const publicKey = (options.publicKey ?? process.env.ILOVEPDF_PUBLIC_KEY)?.trim();
  const secretKey = (options.secretKey ?? process.env.ILOVEPDF_SECRET_KEY)?.trim();
  if (!publicKey || !secretKey) {
    throw new IlovePdfError('iLoveAPI is not configured.', 'configuration', 503);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const token = createIlovePdfToken(publicKey, secretKey, options.nowSeconds?.() ?? Math.floor(Date.now() / 1000));
  const headers = { Authorization: `Bearer ${token}` };
  const startResponse = await request(fetchImpl, `${ILOVE_PDF_API_ORIGIN}/${ILOVE_PDF_API_VERSION}/start/pdfjpg/${ILOVE_PDF_REGION}`, {
    method: 'GET',
    headers
  });
  const start = await jsonResponse<{ task?: unknown; server?: unknown }>(startResponse, 'iLoveAPI returned an invalid start response.');
  if (typeof start.task !== 'string' || !start.task) throw new IlovePdfError('iLoveAPI returned an invalid task.', 'invalid_response', 502, providerRequestId(startResponse));
  const taskId = start.task;
  const server = serverOrigin(start.server);

  const upload = new FormData();
  upload.append('task', taskId);
  upload.append('file', new Blob([new Uint8Array(input.bytes)], { type: 'application/pdf' }), safeFilename(input.filename));
  const uploadResponse = await request(fetchImpl, `${server}/${ILOVE_PDF_API_VERSION}/upload`, {
    method: 'POST',
    headers,
    body: upload
  });
  const uploaded = await jsonResponse<{ server_filename?: unknown }>(uploadResponse, 'iLoveAPI returned an invalid upload response.');
  if (typeof uploaded.server_filename !== 'string' || !uploaded.server_filename) {
    throw new IlovePdfError('iLoveAPI did not accept the PDF upload.', 'invalid_response', 502, providerRequestId(uploadResponse));
  }

  const processResponse = await request(fetchImpl, `${server}/${ILOVE_PDF_API_VERSION}/process`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: taskId,
      tool: 'pdfjpg',
      files: [{ server_filename: uploaded.server_filename, filename: safeFilename(input.filename) }],
      pdfjpg_mode: 'pages'
    })
  });
  await jsonResponse(processResponse, 'iLoveAPI returned an invalid process response.');

  const downloadResponse = await request(fetchImpl, `${server}/${ILOVE_PDF_API_VERSION}/download/${taskId}`, {
    method: 'GET',
    headers
  }, { retrySafe: true, sleep: options.sleep });
  const contentLength = Number(downloadResponse.headers.get('content-length') || 0);
  if (contentLength > MAX_OUTPUT_BYTES) throw new IlovePdfError('iLoveAPI returned an oversized file.', 'invalid_response', 502, providerRequestId(downloadResponse));
  const bytes = Buffer.from(await downloadResponse.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) throw new IlovePdfError('iLoveAPI returned an invalid output file.', 'invalid_response', 502, providerRequestId(downloadResponse));

  return {
    bytes,
    filename: `${safeFilename(input.filename).replace(/\.pdf$/i, '')}-jpg-pages.zip`,
    mimeType: 'application/zip',
    mediaType: 'archive',
    providerRequestId: providerRequestId(processResponse) || taskId || randomUUID()
  };
}

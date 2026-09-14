import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { createClientPdfPages, inspectPdfFile, PdfClientValidationError } from './clientValidation.ts';
import { createPagePlanPdf, mergePdfFiles } from './localOperations.ts';
import { convertPdfToJpg, IlovePdfError, mapIlovePdfError } from './ilovePdfServer.ts';

async function makePdfFile(name: string, pageSizes: Array<[number, number]>) {
  const pdf = await PDFDocument.create();
  pageSizes.forEach(([width, height]) => pdf.addPage([width, height]));
  return new File([new Uint8Array(await pdf.save())], name, { type: 'application/pdf' });
}

test('client PDF inspection handles multiple selections without a provider or processing limiter', async () => {
  const files = await Promise.all([
    makePdfFile('first.pdf', [[100, 100]]),
    makePdfFile('second.pdf', [[120, 120]])
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error('client inspection must not call fetch');
  }) as typeof fetch;
  const inspected = await Promise.all(files.map(inspectPdfFile));
  globalThis.fetch = originalFetch;
  assert.deepEqual(inspected.map(({ pageCount }) => pageCount), [1, 1]);
});

test('client page count and page-number preview cards work without thumbnails', async () => {
  const file = await makePdfFile('three-pages.pdf', [[100, 100], [120, 120], [140, 140]]);
  const inspected = await inspectPdfFile(file);
  assert.equal(inspected.pageCount, 3);
  assert.deepEqual(createClientPdfPages(inspected.pageCount, 2).map((page) => page.pageNumber), [1, 2]);
});

test('invalid PDF is rejected with an actionable message', async () => {
  const invalid = new File([new TextEncoder().encode('not a PDF')], 'broken.pdf', { type: 'application/pdf' });
  await assert.rejects(inspectPdfFile(invalid), (error: unknown) => {
    assert.ok(error instanceof PdfClientValidationError);
    assert.match(error.message, /Could not read this PDF/);
    return true;
  });
});

test('Merge, Organize, and Split remain local pdf-lib operations and preserve order', async () => {
  const first = await makePdfFile('first.pdf', [[100, 100]]);
  const second = await makePdfFile('second.pdf', [[200, 200]]);
  const merged = await mergePdfFiles([first, second]);
  const mergedPdf = await PDFDocument.load(merged.bytes);
  assert.deepEqual(mergedPdf.getPages().map((page) => [page.getWidth(), page.getHeight()]), [[100, 100], [200, 200]]);

  const source = await makePdfFile('source.pdf', [[100, 100], [200, 200], [300, 300]]);
  const organized = await createPagePlanPdf(source, [{ pageNumber: 3, rotation: 90 }, { pageNumber: 1 }], 'organize');
  const organizedPdf = await PDFDocument.load(organized.bytes);
  assert.deepEqual(organizedPdf.getPages().map((page) => page.getWidth()), [300, 100]);
  assert.equal(organizedPdf.getPages()[0].getRotation().angle, 90);

  const split = await createPagePlanPdf(source, [{ pageNumber: 2 }], 'split');
  const splitPdf = await PDFDocument.load(split.bytes);
  assert.equal(splitPdf.getPageCount(), 1);
  assert.equal(splitPdf.getPages()[0].getWidth(), 200);
});

test('PDF-to-JPG provider uses the mocked EU iLoveAPI task flow', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/start/pdfjpg/eu')) {
      return new Response(JSON.stringify({ task: 'task-123', server: 'api-test.ilovepdf.com' }), { status: 200 });
    }
    if (url.endsWith('/v1/upload')) {
      return new Response(JSON.stringify({ server_filename: 'uploaded-123.pdf' }), { status: 200 });
    }
    if (url.endsWith('/v1/process')) {
      return new Response(JSON.stringify({ status: 'TaskSuccess' }), { status: 200 });
    }
    if (url.endsWith('/v1/download/task-123')) {
      return new Response(new Uint8Array([80, 75, 3, 4]), { status: 200, headers: { 'content-type': 'application/zip' } });
    }
    return new Response(null, { status: 404 });
  };

  const output = await convertPdfToJpg(
    { bytes: Buffer.from('%PDF-test'), filename: 'selected pages.pdf' },
    { publicKey: 'public-test-key', secretKey: 'secret-test-key', fetchImpl, nowSeconds: () => 1_700_000_000 }
  );
  assert.equal(output.mediaType, 'archive');
  assert.equal(output.mimeType, 'application/zip');
  assert.equal(output.filename, 'selected-pages-jpg-pages.zip');
  assert.equal(calls.length, 4);
  assert.match(calls[0].url, /start\/pdfjpg\/eu$/);
  assert.match(String((calls[0].init.headers as Record<string, string>).Authorization), /^Bearer /);
  const processBody = JSON.parse(String(calls[2].init.body)) as { tool: string; pdfjpg_mode: string };
  assert.equal(processBody.tool, 'pdfjpg');
  assert.equal(processBody.pdfjpg_mode, 'pages');
});

test('provider rate limits and authentication failures map without exposing provider details', () => {
  const rateLimit = mapIlovePdfError(new IlovePdfError('provider detail', 'rate_limit', 429, 'request-1'));
  assert.deepEqual(rateLimit, {
    category: 'PROVIDER_RATE_LIMIT',
    status: 429,
    message: 'The PDF conversion service is busy. Please try again shortly.',
    providerRequestId: 'request-1'
  });
  const auth = mapIlovePdfError(new IlovePdfError('secret provider detail', 'authentication', 502, 'request-2'));
  assert.equal(auth.category, 'PROVIDER_SERVER_ERROR');
  assert.equal(auth.status, 502);
  assert.doesNotMatch(auth.message, /secret provider detail/);
});

test('provider configuration failure is safe before reservation work can settle a request', () => {
  const mapped = mapIlovePdfError(new IlovePdfError('missing configuration', 'configuration', 503));
  assert.equal(mapped.category, 'PROVIDER_SERVER_ERROR');
  assert.equal(mapped.status, 503);
  assert.match(mapped.message, /credits were not used/);
});

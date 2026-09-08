import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import { getConfiguredTextModel, SAVI_AI_PDF_TOOL_IDS, SAVI_TEXT_TO_IMAGE_PROVIDER } from '@/lib/pricing/saviPricing';
import { runProtectedOperation } from '@/lib/savi/protectedOperations';
import { SaviInfrastructureError } from '@/lib/savi/textToImageInfrastructure';
import { createSaviRateLimitResponse, checkSaviRateLimit } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';
import {
  SAVI_AI_PDF_MAX_FILE_BYTES,
  SAVI_AI_PDF_MAX_PAGES,
  SAVI_AI_PDF_MAX_PROMPT_LENGTH
} from '@/lib/pdf/limits';

export const runtime = 'nodejs';

type AiPdfToolId = 'contract_summary' | 'explain_document' | 'translate_summary' | 'pdf_podcast';

const toolInstructions: Record<AiPdfToolId, string> = {
  contract_summary:
    'Summarize this contract in practical plain language. Include key points, obligations, risks, unclear clauses, dates, payment terms, renewal or cancellation terms, and next actions.',
  explain_document:
    'Explain this document simply for a beginner. Avoid legal or technical jargon. Cover what it is, why it matters, the main points, and what the reader should do next.',
  translate_summary:
    'Translate the readable content of this PDF into the language requested by the user. Preserve section order, headings, names, dates, numbers, tables where readable, and obligations. Do not replace translation with an explanation. Add a short summary only if the user explicitly requests it.',
  pdf_podcast:
    'Turn this PDF into a natural, accurate radio podcast script. Include a hosted intro, clear segments grounded in the document, useful transitions, practical takeaways, and a short sign-off. Do not claim unsupported facts.'
};

class AiPdfInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'AiPdfInputError';
  }
}

function isAiPdfTool(value: string | undefined): value is AiPdfToolId {
  return Boolean(value && SAVI_AI_PDF_TOOL_IDS.includes(value as (typeof SAVI_AI_PDF_TOOL_IDS)[number]));
}

function isPdfFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && (value.type === 'application/pdf' || value.name.toLowerCase().endsWith('.pdf'));
}

function extractInteractionText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (typeof record.output_text === 'string') return record.output_text.trim();
  if (typeof record.outputText === 'string') return record.outputText.trim();
  const steps = Array.isArray(record.steps) ? record.steps : [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (!step || typeof step !== 'object') continue;
    const content = (step as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    const text = content
      .map((block) => (block && typeof block === 'object' ? ((block as { text?: unknown }).text ?? '') : ''))
      .filter((part) => typeof part === 'string')
      .join('')
      .trim();
    if (text) return text;
  }
  const candidates = record.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  return candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';
}

function usageFromProvider(data: Record<string, unknown>) {
  const usage = (data.usageMetadata ?? data.usage_metadata) as Record<string, unknown> | undefined;
  if (!usage || typeof usage !== 'object') return undefined;
  const inputTokens = usage.promptTokenCount ?? usage.inputTokens ?? usage.input_tokens;
  const outputTokens = usage.candidatesTokenCount ?? usage.outputTokens ?? usage.output_tokens;
  return {
    inputTokens: typeof inputTokens === 'number' ? inputTokens : undefined,
    outputTokens: typeof outputTokens === 'number' ? outputTokens : undefined
  };
}

async function getPageCount(buffer: Buffer) {
  try {
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch {
    throw new AiPdfInputError('This is not a readable PDF.');
  }
}

async function generateAiPdfText(input: { toolId: AiPdfToolId; prompt: string; fileName: string; buffer: Buffer; pageCount: number; model: string }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new SaviInfrastructureError('PROVIDER_SERVER_ERROR', 503, 'AI document processing is not connected. Your credits were not used.');
  }
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model: input.model,
      system_instruction: [
        'You are SAVI, Smart Assistant for Valuable Ideas by SKH.GLOBAL.',
        'Process only the supplied PDF. Be accurate, clear, practical, and honest.',
        'When a PDF is unreadable or scanned without usable text, say that OCR is needed rather than inventing content.',
        'Respond in the language requested by the user. Do not mention backend implementation, APIs, model names, or code.'
      ].join('\n'),
      input: [
        {
          type: 'text',
          text: [
            toolInstructions[input.toolId],
            '',
            'User instruction:',
            input.prompt || toolInstructions[input.toolId],
            '',
            `File name: ${input.fileName}`,
            `Detected pages: ${input.pageCount}`
          ].join('\n')
        },
        { type: 'document', mime_type: 'application/pdf', data: input.buffer.toString('base64') }
      ],
      generation_config: { thinking_level: 'low', max_output_tokens: input.toolId === 'translate_summary' ? 12000 : 4000 }
    })
  });
  const providerRequestId =
    response.headers.get('x-goog-request-id') ||
    response.headers.get('x-request-id') ||
    response.headers.get('x-guploader-uploadid') ||
    undefined;
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = (data.error as { message?: string } | undefined)?.message || 'Gemini could not process this PDF.';
    const error = new Error(message) as Error & { status?: number; providerRequestId?: string };
    error.status = response.status;
    error.providerRequestId = providerRequestId;
    throw error;
  }
  const result = extractInteractionText(data);
  if (!result) {
    const error = new Error('Gemini returned no document result.') as Error & { status?: number; providerRequestId?: string };
    error.status = 502;
    error.providerRequestId = providerRequestId;
    throw error;
  }
  return { result: result.slice(0, 100_000), providerRequestId, usage: usageFromProvider(data) };
}

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Please sign in before using this tool.', category: 'AUTH_REQUIRED' }, { status: 401 });

  const rateLimit = await checkSaviRateLimit({ rateLimitClass: 'FILE_PROCESSING', identity: getSaviRequestIdentity(request, session.id) });
  if (!rateLimit.allowed) return createSaviRateLimitResponse(rateLimit);

  try {
    const form = await request.formData();
    const toolIdValue = typeof form.get('toolId') === 'string' ? String(form.get('toolId')) : undefined;
    if (!isAiPdfTool(toolIdValue)) throw new AiPdfInputError('Choose a valid AI document tool.');
    const file = form.get('file');
    if (!isPdfFile(file)) throw new AiPdfInputError('Upload a PDF first.');
    if (file.size > SAVI_AI_PDF_MAX_FILE_BYTES) throw new AiPdfInputError('This PDF is too large. Use a file under 25MB.', 413);
    const prompt = typeof form.get('prompt') === 'string' ? String(form.get('prompt')).trim() : '';
    if (prompt.length > SAVI_AI_PDF_MAX_PROMPT_LENGTH) throw new AiPdfInputError(`Instruction is too long. Limit it to ${SAVI_AI_PDF_MAX_PROMPT_LENGTH} characters.`);
    const buffer = Buffer.from(await file.arrayBuffer());
    const pageCount = await getPageCount(buffer);
    if (!pageCount || pageCount > SAVI_AI_PDF_MAX_PAGES) throw new AiPdfInputError(`Use a PDF with up to ${SAVI_AI_PDF_MAX_PAGES} pages for this AI tool.`);
    const model = getConfiguredTextModel();
    let generatedText = '';
    const clientRequestId = typeof form.get('clientRequestId') === 'string' ? String(form.get('clientRequestId')) : '';
    const result = await runProtectedOperation({
      user: session,
      clientRequestId,
      toolId: toolIdValue,
      provider: SAVI_TEXT_TO_IMAGE_PROVIDER,
      model,
      operation: 'document_ai',
      pricingInput: { pageCount, textCharacters: buffer.length },
      pricingOutput: {},
      mediaType: 'text',
      generate: async () => {
        const output = await generateAiPdfText({
          toolId: toolIdValue,
          prompt: prompt || toolInstructions[toolIdValue],
          fileName: file.name,
          buffer,
          pageCount,
          model
        });
        generatedText = output.result;
        return {
          bytes: Buffer.from(output.result, 'utf8'),
          filename: `savi-${toolIdValue}.txt`,
          mimeType: 'text/plain',
          mediaType: 'text',
          providerRequestId: output.providerRequestId,
          usage: output.usage,
          metadata: { documentPageCount: pageCount, inputSizeBytes: buffer.length }
        };
      }
    });
    if (result.state === 'processing') {
      return NextResponse.json({ status: 'processing', jobId: result.jobId, availableCredits: result.availableCredits }, { status: 202 });
    }
    if (!generatedText) {
      const stored = await fetch(new URL(`/api/assets/${result.assetId}`, request.url), {
        headers: { cookie: request.headers.get('cookie') || '' },
        cache: 'no-store'
      });
      generatedText = stored.ok ? (await stored.text()).slice(0, 100_000) : '';
    }
    return NextResponse.json({
      result: generatedText,
      asset: `/api/assets/${result.assetId}`,
      assetId: result.assetId,
      jobId: result.jobId,
      filename: result.filename,
      availableCredits: result.availableCredits
    });
  } catch (error) {
    if (error instanceof SaviInfrastructureError) return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    if (error instanceof AiPdfInputError) return NextResponse.json({ error: error.message, category: 'INVALID_INPUT' }, { status: error.status });
    return NextResponse.json({ error: 'SAVI could not process this PDF. Your credits were not used.', category: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

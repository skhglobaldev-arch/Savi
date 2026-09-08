import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import {
  getConfiguredTextModel,
  SAVI_IMAGE_TEXT_TOOL_IDS,
  SAVI_TEXT_TO_IMAGE_PROVIDER
} from '@/lib/pricing/saviPricing';
import { runProtectedOperation } from '@/lib/savi/protectedOperations';
import { SaviInfrastructureError } from '@/lib/savi/textToImageInfrastructure';
import { createSaviRateLimitResponse, checkSaviRateLimit } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';

export const runtime = 'nodejs';

const MAX_PROMPT_LENGTH = 4000;
const MAX_REFERENCE_BYTES = 12 * 1024 * 1024;

type TextReference = {
  data?: string;
  mimeType?: string;
  name?: string;
};

type TextGenerationRequest = {
  toolId?: string;
  prompt?: string;
  clientRequestId?: string;
  referenceImage?: TextReference;
};

class TextGenerationInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'TextGenerationInputError';
  }
}

function isImageTextTool(toolId: string | undefined) {
  return Boolean(toolId && SAVI_IMAGE_TEXT_TOOL_IDS.includes(toolId as (typeof SAVI_IMAGE_TEXT_TOOL_IDS)[number]));
}

function validateReference(reference: TextReference | undefined) {
  if (!reference) return null;
  if (!reference.data) {
    throw new TextGenerationInputError('The reference image is incomplete. Attach the image again and retry.');
  }
  const mimeType = reference.mimeType?.toLowerCase() || '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new TextGenerationInputError('Use a PNG, JPEG, or WebP reference image.');
  }
  if (Math.ceil(reference.data.length * 0.75) > MAX_REFERENCE_BYTES) {
    throw new TextGenerationInputError('The reference image is too large. Use an image under 12MB.');
  }
  return { data: reference.data, mimeType, name: reference.name || 'reference image' };
}

function buildPrompt(toolId: string, prompt: string) {
  if (toolId === 'instagram_post') {
    return [
      'You are SAVI social copy studio.',
      'Create a concise, premium Instagram post package from the user brief and optional image.',
      'Return clear labeled sections: Hook, Caption, CTA, and Hashtags.',
      'Use natural language and practical hashtags. Do not invent product claims or facts not present in the brief.',
      '',
      'Brief:',
      prompt
    ].join('\n');
  }

  return [
    'You are SAVI product photography prompt studio.',
    'Turn the user brief and optional product image into one high-quality, ready-to-use product photography prompt.',
    'Include subject, material, camera framing, composition, lighting, background, styling, and exclusions only when relevant.',
    'Do not add unsupported brand or medical claims. Keep the final prompt useful for image generation.',
    '',
    'Brief:',
    prompt
  ].join('\n');
}

function extractText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const direct = record.output_text ?? record.outputText ?? record.text;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const result = extractText(item);
        if (result) return result;
      }
    } else if (child && typeof child === 'object') {
      const result = extractText(child);
      if (result) return result;
    }
  }
  return null;
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

async function generateText(toolId: string, prompt: string, reference: ReturnType<typeof validateReference>) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new SaviInfrastructureError(
      'PROVIDER_SERVER_ERROR',
      503,
      'This text service is temporarily unavailable. Your credits were not used.'
    );
  }

  const input: Array<Record<string, string>> = [{ type: 'text', text: buildPrompt(toolId, prompt) }];
  if (reference) input.push({ type: 'image', data: reference.data, mime_type: reference.mimeType });

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      model: getConfiguredTextModel(),
      input,
      generation_config: { max_output_tokens: 1200 }
    })
  });
  const providerRequestId =
    response.headers.get('x-goog-request-id') ||
    response.headers.get('x-request-id') ||
    response.headers.get('x-guploader-uploadid') ||
    undefined;
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = (data.error as { message?: string } | undefined)?.message || 'Text generation failed.';
    const error = new Error(message) as Error & { status?: number; providerRequestId?: string };
    error.status = response.status;
    error.providerRequestId = providerRequestId;
    throw error;
  }
  const result = extractText(data);
  if (!result) {
    const error = new Error('Gemini returned no text output.') as Error & { status?: number; providerRequestId?: string };
    error.status = 502;
    error.providerRequestId = providerRequestId;
    throw error;
  }
  return { result: result.slice(0, 20_000), providerRequestId, usage: usageFromProvider(data) };
}

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Please sign in before using this tool.', category: 'AUTH_REQUIRED' }, { status: 401 });
  }

  const rateLimit = await checkSaviRateLimit({ rateLimitClass: 'PAID_GENERATION', identity: getSaviRequestIdentity(request, session.id) });
  if (!rateLimit.allowed) return createSaviRateLimitResponse(rateLimit);

  try {
    const body = (await request.json().catch(() => ({}))) as TextGenerationRequest;
    const prompt = body.prompt?.trim() || '';
    if (!isImageTextTool(body.toolId)) {
      throw new TextGenerationInputError('This text tool is not available.');
    }
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      throw new TextGenerationInputError(`Write a brief under ${MAX_PROMPT_LENGTH} characters.`);
    }
    const reference = validateReference(body.referenceImage);
    if (body.toolId === 'instagram_post' && !reference) {
      throw new TextGenerationInputError('Instagram Post from Image needs one reference image.');
    }
    const model = getConfiguredTextModel();
    let generatedText = '';
    const result = await runProtectedOperation({
      user: session,
      clientRequestId: body.clientRequestId || '',
      toolId: body.toolId || '',
      provider: SAVI_TEXT_TO_IMAGE_PROVIDER,
      model,
      operation: 'text_generation',
      pricingInput: { textCharacters: prompt.length, referenceImageCount: reference ? 1 : 0 },
      pricingOutput: {},
      mediaType: 'text',
      generate: async () => {
        const output = await generateText(body.toolId || '', prompt, reference);
        generatedText = output.result;
        return {
          bytes: Buffer.from(output.result, 'utf8'),
          filename: `${body.toolId === 'instagram_post' ? 'savi-instagram-post' : 'savi-product-photo-prompt'}.txt`,
          mimeType: 'text/plain',
          mediaType: 'text',
          providerRequestId: output.providerRequestId,
          usage: output.usage
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
      generatedText = stored.ok ? (await stored.text()).slice(0, 20_000) : '';
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
    if (error instanceof SaviInfrastructureError) {
      return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    }
    if (error instanceof TextGenerationInputError) {
      return NextResponse.json({ error: error.message, category: 'INVALID_INPUT' }, { status: error.status });
    }
    return NextResponse.json({ error: 'SAVI could not complete this request. Please try again.', category: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

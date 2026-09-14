import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import { GeminiUnavailableError, requestGeminiWithFallback } from '@/lib/ai/geminiResilience';
import { getConfiguredTextModel, getConfiguredTextModels } from '@/lib/pricing/saviPricing';
import { logOperational } from '@/lib/observability/logger';
import { getSaviFairUseConfig } from '@/lib/savi/fairUse';
import { createSaviUnexpectedErrorResponse } from '@/lib/savi/backendSecurity';
import { createSaviRateLimitResponse, checkSaviRateLimit } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';
import { recordFreeAiUsage } from '@/lib/savi/protectedOperations';
import { assertSaviAccountCanMutate, SaviInfrastructureError } from '@/lib/savi/textToImageInfrastructure';

export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 4000;

type ChatRequest = {
  message?: string;
  mode?: string;
  templateId?: string;
  clientRequestId?: string;
  history?: Array<{ role?: 'user' | 'assistant'; content?: string }>;
};

type GeminiChatResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: Record<string, unknown>;
  usage_metadata?: Record<string, unknown>;
  error?: { message?: string };
  [key: string]: unknown;
};

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

function isPersianOrFinglish(text: string) {
  return /[\u0600-\u06FF]/.test(text) || /\b(salam|khobi|mikham|mikhay?m|mikhastam|safhe|safha|safahat|jabe|jabeja|biad|biare|bere|bzar|bfrst|tabdil|seda|aks|ax|matn|baram|beshe|mishe)\b/i.test(text);
}

function createContinuityAnswer(message: string) {
  const persian = isPersianOrFinglish(message);
  if (persian) {
    return `پیامت را گرفتم. الان پاسخ عمیق SAVI موقتاً در دسترس نیست، اما درخواستت در همین گفت‌وگو می‌ماند و لازم نیست دوباره چیزی را آپلود یا توضیح بدهی.\n\nاگر کارت به یک خروجی مشخص نیاز دارد، می‌توانم در ادامه همان مسیر درست را باز کنم: برای تصویر، PDF، ویدیو یا صدا فقط بگو خروجی نهایی را چه شکلی می‌خواهی.`;
  }
  return 'I have your message. SAVI’s deeper reply is temporarily unavailable, but your request remains in this chat and you do not need to upload or explain anything again. Tell me the exact output you want next and I can continue with the right Image, PDF, Video, or Voice path.';
}

function conversationContext(history: ChatRequest['history']) {
  if (!Array.isArray(history)) return '';
  const entries = history
    .filter((item) => (item?.role === 'user' || item?.role === 'assistant') && typeof item.content === 'string')
    .slice(-14)
    .map((item) => `${item.role === 'user' ? 'User' : 'SAVI'}: ${item.content?.slice(0, 2000)}`);
  return entries.length ? `Conversation memory:\n${entries.join('\n')}\n\n` : '';
}

function usageFromProvider(data: GeminiChatResponse) {
  const usage = data.usageMetadata ?? data.usage_metadata;
  if (!usage || typeof usage !== 'object') return undefined;
  const record = usage as Record<string, unknown>;
  const inputTokens = record.promptTokenCount ?? record.inputTokens ?? record.input_tokens;
  const outputTokens = record.candidatesTokenCount ?? record.outputTokens ?? record.output_tokens;
  return {
    inputTokens: typeof inputTokens === 'number' ? inputTokens : undefined,
    outputTokens: typeof outputTokens === 'number' ? outputTokens : undefined
  };
}

function logProviderFallback(route: string, error: unknown) {
  const attempts = error instanceof GeminiUnavailableError ? error.attempts : [];
  logOperational('warn', 'savi_ai_provider_fallback', {
    route,
    reason: error instanceof GeminiUnavailableError ? 'provider_unavailable' : 'unexpected_provider_failure',
    attemptCount: attempts.length,
    models: attempts.map((attempt) => attempt.model).join(',').slice(0, 240),
    statuses: attempts.map((attempt) => typeof attempt.status === 'number' ? String(attempt.status) : 'network').join(',').slice(0, 120)
  });
}

function groundingRequestCount(value: unknown, depth = 0): number {
  if (depth > 8 || !value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) return value.reduce((count, item) => count + groundingRequestCount(item, depth + 1), 0);
  const record = value as Record<string, unknown>;
  let count = 0;
  for (const [key, child] of Object.entries(record)) {
    const normalized = key.toLowerCase();
    if (normalized.includes('grounding') || normalized.includes('search')) {
      if (Array.isArray(child)) count += Math.max(1, child.length);
      else if (child && typeof child === 'object') count += 1;
      else if (child) count += 1;
    }
    count += groundingRequestCount(child, depth + 1);
  }
  return Math.min(count, 20);
}

async function recordUsageSafely(input: Parameters<typeof recordFreeAiUsage>[0]) {
  await recordFreeAiUsage(input).catch(() => undefined);
}

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Please sign in to chat with SAVI.', category: 'AUTH_REQUIRED' }, { status: 401 });
  }
  try {
    await assertSaviAccountCanMutate(session);
  } catch (error) {
    if (error instanceof SaviInfrastructureError) return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    return NextResponse.json({ error: 'SAVI chat is temporarily unavailable.', category: 'ACCOUNT_UNAVAILABLE' }, { status: 503 });
  }
  const rateLimit = await checkSaviRateLimit({ rateLimitClass: 'FREE_AI', identity: getSaviRequestIdentity(request, session.id) });
  if (!rateLimit.allowed) return createSaviRateLimitResponse(rateLimit);

  const startedAt = Date.now();
  try {
    const body = (await request.json().catch(() => ({}))) as ChatRequest;
    const message = body.message?.trim() ?? '';
    if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: `Message is too long. Limit it to ${MAX_MESSAGE_LENGTH} characters for now.` }, { status: 400 });
    }

    const now = new Date();
    const currentDate = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const userLanguageHint = isPersianOrFinglish(message) ? 'Persian/Finglish' : 'English or user-selected language';
    const model = getConfiguredTextModel();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      await recordUsageSafely({
        user: session,
        clientRequestId: body.clientRequestId,
        toolId: 'ask_savi_chat',
        provider: 'savi_local',
        model: 'continuity',
        success: true,
        durationMs: Date.now() - startedAt,
        metadata: { responseMode: 'continuity_no_provider' }
      });
      return NextResponse.json({ response: createContinuityAnswer(message), mode: 'continuity' });
    }

    const systemInstruction = [
      'You are SAVI, Smart Assistant for Valuable Ideas by SKH.GLOBAL.',
      'Be helpful, clear, practical, concise, warmly energetic, and intelligently proactive.',
      'Reply naturally in the user language. Persian and Finglish should receive Persian-friendly replies.',
      'Normal SAVI chat is free. Never mention provider cost, internal credits, APIs, models, Firebase, keys, or implementation details.',
      'SAVI understands tools for Images, Video, Voice, Files/PDF, and search-grounded help. Recommend the simplest correct SAVI path and ask only the missing question needed to proceed.',
      'Remember active conversation details. Never tell a user to upload an attachment again when it is already present in the supplied conversation context.',
      'For a PDF page reorder/merge/split request, recommend the organizing or merge workflow, not explanation or summary.',
      'For text to speech, first make sure you have the exact text, then voice preferences only if missing.',
      'Do not claim that an output was generated unless the server actually generated it.',
      `Current real date: ${currentDate}.`,
      `User language hint: ${userLanguageHint}.`
    ].join('\n');

    const requestBody = (nextModel: string) => ({
      model: nextModel,
      system_instruction: systemInstruction,
      input: [
        {
          type: 'text',
          text: [
            body.mode ? `Selected mode: ${body.mode === 'Ask AI' ? 'Ask SAVI' : body.mode}` : '',
            body.templateId ? `Selected template: ${body.templateId}` : '',
            `Current date: ${currentDate}`,
            conversationContext(body.history),
            'Latest user message:',
            message
          ].filter(Boolean).join('\n')
        }
      ],
      generation_config: { thinking_level: 'low', max_output_tokens: getSaviFairUseConfig().maxOutputTokens },
      tools: [{ type: 'google_search' }]
    });

    let providerData: GeminiChatResponse;
    let resolvedModel = model;
    let providerRequestId: string | undefined;
    try {
      const provider = await requestGeminiWithFallback<GeminiChatResponse>({
        apiKey,
        models: getConfiguredTextModels(model),
        requestForModel: (nextModel) => ({
          url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
          init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody(nextModel)) }
        }),
        parseError: (value) => value.error?.message
      });
      providerData = provider.data;
      resolvedModel = provider.model;
      providerRequestId = provider.providerRequestId;
    } catch (error) {
      logProviderFallback('ai/chat', error);
      await recordUsageSafely({
        user: session,
        clientRequestId: body.clientRequestId,
        toolId: 'ask_savi_chat',
        provider: 'savi_local',
        model: 'continuity',
        success: true,
        durationMs: Date.now() - startedAt,
        metadata: { responseMode: 'continuity_after_provider_failure' }
      });
      return NextResponse.json({ response: createContinuityAnswer(message), mode: 'continuity' });
    }

    const text = extractInteractionText(providerData);
    const usage = usageFromProvider(providerData);
    const groundedRequests = groundingRequestCount(providerData);
    await recordUsageSafely({
      user: session,
      clientRequestId: body.clientRequestId,
      toolId: groundedRequests ? 'ask_savi_grounded_chat' : 'ask_savi_chat',
      provider: 'gemini',
      model: resolvedModel,
      success: Boolean(text),
      durationMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      groundingRequestCount: groundedRequests,
      providerRequestId,
      metadata: { responseMode: text ? 'provider' : 'continuity_after_empty_provider_response', groundingDetected: groundedRequests > 0 }
    });

    if (!text) return NextResponse.json({ response: createContinuityAnswer(message), mode: 'continuity' });
    return NextResponse.json({ response: text, mode: resolvedModel });
  } catch (error) {
    logOperational('error', 'savi_ai_chat_unexpected_error');
    return NextResponse.json(createSaviUnexpectedErrorResponse(), { status: 500 });
  }
}

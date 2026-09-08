import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import { requestGeminiWithFallback } from '@/lib/ai/geminiResilience';
import { getConfiguredTextModels } from '@/lib/pricing/saviPricing';
import { consumeSaviFairUse } from '@/lib/savi/fairUse';
import { recordFreeAiUsage } from '@/lib/savi/protectedOperations';
import {
  getSaviAgentTool,
  isSaviAgentToolId,
  serializeSaviAgentTools,
  type SaviAgentAttachment,
  type SaviAgentHistoryMessage,
  type SaviAgentPlan
} from '@/lib/ai/saviAgent';

export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 14;
type AgentRequest = {
  message?: string;
  history?: SaviAgentHistoryMessage[];
  attachments?: SaviAgentAttachment[];
  clientRequestId?: string;
};

type RawAgentPlan = Partial<SaviAgentPlan> & {
  toolId?: string;
  pageA?: number;
  pageB?: number;
};

const schema = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: ['chat', 'question', 'tool'] },
    reply: { type: 'STRING' },
    language: { type: 'STRING', enum: ['fa', 'en'] },
    toolId: { type: 'STRING' },
    prompt: { type: 'STRING' },
    missingInput: { type: 'STRING', enum: ['none', 'text', 'image', 'pdf', 'video', 'audio'] },
    quickReplies: { type: 'ARRAY', items: { type: 'STRING' } },
    nextToolId: { type: 'STRING' },
    pageA: { type: 'INTEGER' },
    pageB: { type: 'INTEGER' },
    voice: { type: 'STRING' },
    style: { type: 'STRING' },
    aspectRatio: { type: 'STRING', enum: ['1:1', '16:9', '9:16', '4:5'] },
    quality: { type: 'STRING', enum: ['720', '1080', '4K'] },
    duration: { type: 'STRING', enum: ['4', '6', '8'] }
  },
  required: ['intent', 'reply', 'language', 'toolId', 'prompt', 'missingInput', 'quickReplies']
};

function isPersianOrFinglish(text: string) {
  return /[\u0600-\u06FF]/.test(text) || /\b(salam|khobi|mikham|mikhay?m|mikhastam|safhe|safha|safahat|jabe|jabeja|biad|biare|bere|bzar|bfrst|tabdil|seda|aks|ax|matn|baram|beshe|mishe)\b/i.test(text);
}

function extractText(data: unknown) {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;
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

async function recordUsageSafely(input: Parameters<typeof recordFreeAiUsage>[0]) {
  await recordFreeAiUsage(input).catch(() => undefined);
}

function safeHistory(value: unknown): SaviAgentHistoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is SaviAgentHistoryMessage => Boolean(item && typeof item === 'object' && ((item as SaviAgentHistoryMessage).role === 'user' || (item as SaviAgentHistoryMessage).role === 'assistant') && typeof (item as SaviAgentHistoryMessage).content === 'string'))
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 2000) }));
}

function safeAttachments(value: unknown): SaviAgentAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is SaviAgentAttachment => Boolean(item && typeof item === 'object' && typeof (item as SaviAgentAttachment).name === 'string' && typeof (item as SaviAgentAttachment).kind === 'string'))
    .slice(0, 6)
    .map((item) => ({
      id: item.id || '',
      name: item.name.slice(0, 160),
      mimeType: item.mimeType || 'application/octet-stream',
      size: Number.isFinite(item.size) ? item.size : 0,
      kind: item.kind
    }));
}

function normalizePlan(raw: RawAgentPlan, message: string): SaviAgentPlan {
  const tool = getSaviAgentTool(isSaviAgentToolId(raw.toolId) ? raw.toolId : 'chat');
  const intent = raw.intent === 'tool' || raw.intent === 'question' ? raw.intent : 'chat';
  const language = raw.language === 'fa' ? 'fa' : isPersianOrFinglish(message) ? 'fa' : 'en';
  const missingInput = ['none', 'text', 'image', 'pdf', 'video', 'audio'].includes(raw.missingInput || '')
    ? raw.missingInput as SaviAgentPlan['missingInput']
    : 'none';
  const pageA = Number(raw.pageA);
  const pageB = Number(raw.pageB);

  return {
    intent,
    reply: typeof raw.reply === 'string' && raw.reply.trim() ? raw.reply.trim().slice(0, 1400) : language === 'fa' ? 'متوجه شدم. بگذار بهترین مسیر را آماده کنم.' : 'Got it. I will prepare the best next step.',
    language,
    toolId: tool.id,
    prompt: typeof raw.prompt === 'string' && raw.prompt.trim() ? raw.prompt.trim().slice(0, MAX_MESSAGE_LENGTH) : message,
    missingInput,
    quickReplies: Array.isArray(raw.quickReplies) ? raw.quickReplies.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).slice(0, 4) : [],
    nextToolId: isSaviAgentToolId(raw.nextToolId) ? raw.nextToolId : undefined,
    pageA: Number.isInteger(pageA) && pageA > 0 ? pageA : undefined,
    pageB: Number.isInteger(pageB) && pageB > 0 && pageB !== pageA ? pageB : undefined,
    voice: typeof raw.voice === 'string' ? raw.voice.slice(0, 60) : undefined,
    style: typeof raw.style === 'string' ? raw.style.slice(0, 180) : undefined,
    aspectRatio: ['1:1', '16:9', '9:16', '4:5'].includes(raw.aspectRatio || '') ? raw.aspectRatio as SaviAgentPlan['aspectRatio'] : undefined,
    quality: ['720', '1080', '4K'].includes(raw.quality || '') ? raw.quality as SaviAgentPlan['quality'] : undefined,
    duration: ['4', '6', '8'].includes(raw.duration || '') ? raw.duration as SaviAgentPlan['duration'] : undefined
  };
}

function pageSwapFromMessage(message: string): [number, number] | null {
  const match = message.match(/(?:page|pages|صفحه)\s*(\d+)\D{0,28}(?:and|with|to|and then|و|با|به)?\s*(?:page|صفحه)?\s*(\d+)/i);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  return Number.isInteger(first) && Number.isInteger(second) && first > 0 && second > 0 && first !== second
    ? [first, second]
    : null;
}

function localPlan(message: string, attachments: SaviAgentAttachment[] = []): SaviAgentPlan {
  const language = isPersianOrFinglish(message) ? 'fa' : 'en';
  const hasPdf = attachments.some((attachment) => attachment.kind === 'pdf');
  const pdfCount = attachments.filter((attachment) => attachment.kind === 'pdf').length;
  const hasImage = attachments.some((attachment) => attachment.kind === 'image');
  const hasVideo = attachments.some((attachment) => attachment.kind === 'video');
  const reply = (fa: string, en: string) => language === 'fa' ? fa : en;
  const has = (pattern: RegExp) => pattern.test(message);
  const swapPages = pageSwapFromMessage(message);

  if (has(/\b(merge|combine|join)\b|ادغام|یکی\s*کن/i)) {
    return {
      intent: pdfCount >= 2 ? 'tool' : 'question',
      reply: pdfCount >= 2
        ? reply('PDFهای موجود را در همان ترتیب به یک فایل تبدیل می‌کنم.', 'I will merge the attached PDFs in their current order.')
        : reply('برای ادغام، حداقل دو PDF را همین‌جا اضافه کن.', 'Attach at least two PDFs here and I will merge them.'),
      language,
      toolId: 'merge_pdf',
      prompt: message,
      missingInput: pdfCount >= 2 ? 'none' : 'pdf',
      quickReplies: []
    };
  }

  if (has(/\b(pdf\s*to\s*(jpg|image)|convert.*pdf.*(jpg|image)|export.*pages)\b|تبدیل.*(jpg|عکس)|خروجی.*عکس/i)) {
    return {
      intent: hasPdf ? 'tool' : 'question',
      reply: hasPdf
        ? reply('صفحه‌های PDF موجود را به یک ZIP از تصاویر تبدیل می‌کنم.', 'I will export the attached PDF pages as a ZIP of images.')
        : reply('PDF را همین‌جا اضافه کن تا صفحه‌ها را به تصویر تبدیل کنم.', 'Attach the PDF here and I will export its pages as images.'),
      language,
      toolId: 'pdf_to_jpg',
      prompt: message,
      missingInput: hasPdf ? 'none' : 'pdf',
      quickReplies: []
    };
  }

  if (has(/\b(extract.*images?|images?.*extract)\b|استخراج.*عکس|خارج.*عکس/i)) {
    return {
      intent: hasPdf ? 'tool' : 'question',
      reply: hasPdf
        ? reply('تصاویر embedded در PDF موجود را در یک ZIP جمع می‌کنم.', 'I will extract the embedded images from the attached PDF into a ZIP.')
        : reply('PDF را همین‌جا اضافه کن تا تصاویر embedded آن را استخراج کنم.', 'Attach the PDF here and I will extract its embedded images.'),
      language,
      toolId: 'extract_images',
      prompt: message,
      missingInput: hasPdf ? 'none' : 'pdf',
      quickReplies: []
    };
  }

  if (has(/\b(swap|reorder|organize|move)\b|جابج|جا\s*به\s*جا|مرتب\s*(کردن|کن)/i)) {
    return {
      intent: hasPdf ? 'tool' : 'question',
      reply: hasPdf
        ? reply('PDF موجود را با ابزار مرتب‌سازی صفحات آماده می‌کنم.', 'I will organize the PDF already attached to this chat.')
        : reply('برای مرتب‌سازی صفحات، PDF را همین‌جا اضافه کن.', 'Attach the PDF here and I will organize its pages.'),
      language,
      toolId: 'organize_pdf',
      prompt: message,
      missingInput: hasPdf ? 'none' : 'pdf',
      quickReplies: hasPdf && !swapPages
        ? [reply('صفحه ۱ و ۲ را جابه‌جا کن', 'Swap page 1 and page 2')]
        : [],
      pageA: swapPages?.[0],
      pageB: swapPages?.[1]
    };
  }

  if (has(/\b(translate|translation)\b|ترجمه/i)) {
    return {
      intent: hasPdf ? 'tool' : 'question',
      reply: hasPdf
        ? reply('PDF موجود را به زبان خواسته‌شده ترجمه می‌کنم.', 'I will translate the PDF already attached to this chat.')
        : reply('برای ترجمه، PDF را همین‌جا اضافه کن و زبان مقصد را بگو.', 'Attach the PDF here and tell me the target language.'),
      language,
      toolId: 'translate_summary',
      prompt: message,
      missingInput: hasPdf ? 'none' : 'pdf',
      quickReplies: []
    };
  }

  if (has(/\b(summarize|summary|explain)\b|خلاصه|توضیح|بفهم/i)) {
    const isSimpleExplanation = has(/\b(explain|simple)\b|ساده|توضیح/i);
    return {
      intent: hasPdf ? 'tool' : 'question',
      reply: hasPdf
        ? reply('PDF موجود را دقیقاً با همان خروجی درخواستی پردازش می‌کنم.', 'I will process the PDF already attached with the requested output.')
        : reply('PDF را همین‌جا اضافه کن تا آن را پردازش کنم.', 'Attach the PDF here and I will process it.'),
      language,
      toolId: isSimpleExplanation ? 'explain_document' : 'contract_summary',
      prompt: message,
      missingInput: hasPdf ? 'none' : 'pdf',
      quickReplies: []
    };
  }

  if (has(/\b(text.?to.?speech|tts|voice|audio)\b|تبدیل.*(صدا|صوت)|متن.*(صدا|صوت)/i)) {
    return {
      intent: 'question',
      reply: reply('حتماً. متن دقیق را بفرست؛ بعد فقط صدای دلخواه و لحن را از تو می‌پرسم.', 'Absolutely. Send the exact text first; then I will ask only for the voice and tone.'),
      language,
      toolId: 'text_to_speech',
      prompt: message,
      missingInput: 'text',
      quickReplies: []
    };
  }

  if (has(/\b(video|reel|clip)\b|ویدیو|ریل/i)) {
    const needsReference = has(/\b(from image|animate|reference)\b|از.*(عکس|تصویر)|انیم/i);
    const toolId = needsReference || hasImage || hasVideo ? 'image_video' : 'text_video';
    return {
      intent: toolId === 'image_video' && !hasImage && !hasVideo ? 'question' : 'tool',
      reply: toolId === 'image_video' && !hasImage && !hasVideo
        ? reply('برای این ویدیو یک عکس یا ویدیوی مرجع لازم دارم.', 'I need an image or video reference for this video.')
        : reply('مسیر درست ویدیو را آماده می‌کنم.', 'I will prepare the right video workflow.'),
      language,
      toolId,
      prompt: message,
      missingInput: toolId === 'image_video' && !hasImage && !hasVideo ? 'image' : 'none',
      quickReplies: []
    };
  }

  if (has(/\b(image|photo|picture|edit)\b|عکس|اکس|تصویر|ویرایش/i)) {
    const isEdit = has(/\b(edit|remove|change|background|object)\b|ویرایش|حذف|پس.?زمینه|تغییر/i);
    const toolId = isEdit ? 'edit_image' : 'text_to_image';
    const needsImage = isEdit && !hasImage;
    return {
      intent: needsImage ? 'question' : 'tool',
      reply: needsImage
        ? reply('برای ادیت، همان عکس را همین‌جا اضافه کن؛ بعد تغییر موردنظرت را انجام می‌دهم.', 'Attach the image here and I will make the requested edit.')
        : reply('مسیر درست تصویر را آماده می‌کنم.', 'I will prepare the right image workflow.'),
      language,
      toolId,
      prompt: message,
      missingInput: needsImage ? 'image' : 'none',
      quickReplies: []
    };
  }

  return {
    intent: 'chat',
    reply: language === 'fa' ? 'متوجه شدم. در این لحظه پاسخ گفتگویی آماده می‌کنم.' : 'Got it. I will answer this as a chat request.',
    language,
    toolId: 'chat',
    prompt: message,
    missingInput: 'none',
    quickReplies: []
  };
}

function agentPlanResponse(plan: SaviAgentPlan) {
  const tool = getSaviAgentTool(plan.toolId);
  return {
    ...plan,
    title: tool.title,
    requiredInput: tool.requiredInput,
    output: tool.output
  };
}

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Please sign in to use SAVI Agent.', category: 'AUTH_REQUIRED' }, { status: 401 });
  }
  const fairUse = consumeSaviFairUse(session.id);
  if (!fairUse.allowed) {
    return NextResponse.json(
      { error: `SAVI is taking a short breather. Please try again in ${fairUse.retryAfterSeconds} seconds.`, category: 'FAIR_USE_LIMIT' },
      { status: 429, headers: { 'Retry-After': String(fairUse.retryAfterSeconds) } }
    );
  }
  const startedAt = Date.now();
  try {
    const body = (await request.json().catch(() => ({}))) as AgentRequest;
    const message = body.message?.trim() || '';
    if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    if (message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: `Message is too long. Limit it to ${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });

    const history = safeHistory(body.history);
    const attachments = safeAttachments(body.attachments);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      await recordUsageSafely({
        user: session,
        clientRequestId: body.clientRequestId,
        toolId: 'ask_savi_agent',
        provider: 'savi_local',
        model: 'continuity',
        success: true,
        durationMs: Date.now() - startedAt,
        metadata: { responseMode: 'continuity_no_provider' }
      });
      return NextResponse.json({ plan: agentPlanResponse(localPlan(message, attachments)), mode: 'continuity' });
    }

    const language = isPersianOrFinglish(message) ? 'Persian or Finglish Persian' : 'the same language and style as the user';
    const systemInstruction = [
      'You are SAVI Agent, the private product agent for SAVI by SKH.GLOBAL.',
      'Your job is to understand the user goal, remember their active conversation and supplied files, and choose the smallest correct next SAVI action.',
      `Always reply in ${language}. Persian and Finglish must receive Persian-friendly replies.`,
      'SAVI chat is free. Only select a tool when the user asks for a generated output or a concrete file/media operation.',
      'Never use a PDF explanation or summary when the user asked to reorder, merge, split, export, or translate pages.',
      'When an active attachment is already listed, do not ask the user to upload it again.',
      'If input is missing, set intent to question, choose the intended tool, set missingInput, and ask exactly one concise useful question. Do not show price yet.',
      'If input is available, set intent to tool, choose the one next action, and give a concise reply describing what will happen. The interface will show the calculated cost and request confirmation.',
      'For multi-step requests, select the first executable tool only and state the next logical step briefly in reply. For example, organize a PDF before creating its audio.',
      'For text to speech, first obtain the exact text. Then ask voice/tone only if not already given.',
      'For image editing, request an image only if none is in active attachments. For video reference workflows, use up to three existing image/video attachments.',
      'For video generation, the only currently supported output quality is 720. Do not plan a higher video quality.',
      'Set pageA and pageB only for an explicit PDF page swap. Do not guess page numbers.',
      'Do not claim that an output already exists. Do not mention APIs, model names, backend, keys, credits, or code.',
      'Tool catalog follows. Choose only from it:',
      JSON.stringify(serializeSaviAgentTools())
    ].join('\n');

    const context = [
      'Conversation memory:',
      history.length ? history.map((item) => `${item.role === 'user' ? 'User' : 'SAVI'}: ${item.content}`).join('\n') : '(new conversation)',
      '',
      'Active attachments for this conversation:',
      attachments.length ? attachments.map((item) => `- ${item.name} | ${item.kind} | ${item.mimeType}`).join('\n') : '(none)',
      '',
      `Latest user message: ${message}`
    ].join('\n');

    type GeminiAgentResponse = Record<string, unknown> & { error?: { message?: string } };
    let data: GeminiAgentResponse;
    let model = 'local-continuity';
    let providerRequestId: string | undefined;
    try {
      const result = await requestGeminiWithFallback<GeminiAgentResponse>({
        apiKey,
        models: getConfiguredTextModels(),
        requestForModel: (nextModel) => ({
          url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(nextModel)}:generateContent`,
          init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents: [{ role: 'user', parts: [{ text: context }] }],
              generationConfig: {
                temperature: 0.15,
                responseMimeType: 'application/json',
                responseSchema: schema
              }
            })
          }
        }),
        parseError: (value) => value.error?.message
      });
      data = result.data;
      model = result.model;
      providerRequestId = result.providerRequestId;
    } catch {
      await recordUsageSafely({
        user: session,
        clientRequestId: body.clientRequestId,
        toolId: 'ask_savi_agent',
        provider: 'savi_local',
        model: 'continuity',
        success: true,
        durationMs: Date.now() - startedAt,
        metadata: { responseMode: 'continuity_after_provider_failure' }
      });
      return NextResponse.json({ plan: agentPlanResponse(localPlan(message, attachments)), mode: 'continuity' });
    }

    const rawText = extractText(data);
    if (!rawText) {
      await recordUsageSafely({
        user: session,
        clientRequestId: body.clientRequestId,
        toolId: 'ask_savi_agent',
        provider: 'gemini',
        model,
        success: false,
        durationMs: Date.now() - startedAt,
        providerRequestId,
        metadata: { responseMode: 'empty_provider_response' }
      });
      return NextResponse.json({ plan: agentPlanResponse(localPlan(message, attachments)), mode: 'continuity' });
    }

    let rawPlan: RawAgentPlan;
    try {
      rawPlan = JSON.parse(rawText) as RawAgentPlan;
    } catch {
      return NextResponse.json({ plan: localPlan(message, attachments), mode: 'continuity' });
    }

    const plan = normalizePlan(rawPlan, message);
    const usage = usageFromProvider(data);
    await recordUsageSafely({
      user: session,
      clientRequestId: body.clientRequestId,
      toolId: 'ask_savi_agent',
      provider: 'gemini',
      model,
      success: true,
      durationMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      providerRequestId,
      metadata: { responseMode: 'provider', plannedToolId: plan.toolId }
    });
    return NextResponse.json({
      plan: agentPlanResponse(plan),
      mode: model
    });
  } catch {
    return NextResponse.json({ plan: agentPlanResponse(localPlan('', [])), mode: 'continuity' });
  }
}

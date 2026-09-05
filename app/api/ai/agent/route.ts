import { NextResponse } from 'next/server';
import { requestGeminiWithFallback } from '@/lib/ai/geminiResilience';
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
const DEFAULT_TEXT_MODEL = 'gemini-3.6-flash';

type AgentRequest = {
  message?: string;
  history?: SaviAgentHistoryMessage[];
  attachments?: SaviAgentAttachment[];
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

function localPlan(message: string): SaviAgentPlan {
  const language = isPersianOrFinglish(message) ? 'fa' : 'en';
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

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AgentRequest;
    const message = body.message?.trim() || '';
    if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    if (message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: `Message is too long. Limit it to ${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });

    const history = safeHistory(body.history);
    const attachments = safeAttachments(body.attachments);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ plan: localPlan(message), mode: 'local-preview' });

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

    type GeminiAgentResponse = { error?: { message?: string } };
    let data: GeminiAgentResponse;
    let model = 'local-continuity';
    try {
      const result = await requestGeminiWithFallback<GeminiAgentResponse>({
        apiKey,
        models: [process.env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL, 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
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
    } catch {
      return NextResponse.json({ plan: localPlan(message), mode: 'local-continuity' });
    }

    const rawText = extractText(data);
    if (!rawText) return NextResponse.json({ error: 'SAVI Agent returned no plan.' }, { status: 502 });

    let rawPlan: RawAgentPlan;
    try {
      rawPlan = JSON.parse(rawText) as RawAgentPlan;
    } catch {
      return NextResponse.json({ error: 'SAVI Agent returned an invalid plan.' }, { status: 502 });
    }

    const plan = normalizePlan(rawPlan, message);
    const tool = getSaviAgentTool(plan.toolId);
    return NextResponse.json({
      plan: {
        ...plan,
        title: tool.title,
        creditCost: tool.creditCost,
        requiredInput: tool.requiredInput,
        output: tool.output
      },
      mode: model
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'SAVI Agent failed.' }, { status: 500 });
  }
}

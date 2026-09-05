import { NextResponse } from 'next/server';
import { requestGeminiWithFallback } from '@/lib/ai/geminiResilience';

export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 4000;
const DEFAULT_TEXT_MODEL = 'gemini-3.6-flash';

type ChatRequest = {
  message?: string;
  mode?: string;
  templateId?: string;
  history?: Array<{
    role?: 'user' | 'assistant';
    content?: string;
  }>;
};

function extractInteractionText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;

  if (typeof record.output_text === 'string') return record.output_text.trim();
  if (typeof record.outputText === 'string') return record.outputText.trim();

  const steps = Array.isArray(record.steps) ? record.steps : [];
  for (const step of [...steps].reverse()) {
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

function createLocalAnswer(message: string, mode?: string, templateId?: string, continuity = false) {
  const clean = message.trim();
  const visibleMode = mode === 'Ask AI' ? 'Ask SAVI' : mode;
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const persian = isPersianOrFinglish(clean);
  const heading = continuity
    ? persian
      ? 'SAVI اینجاست'
      : 'SAVI is here'
    : 'SAVI answer';
  const note = continuity
    ? persian
      ? '\nبرای اینکه پاسخ دقیق از دست نرود، همین پیام را نگه داشتم. اگر سوالت به یک ابزار SAVI مربوط است، می‌توانم مسیر درست را قدم‌به‌قدم جلو ببرم.\n'
      : '\nI kept your request intact. If this needs a SAVI tool, I can still guide the right next step while the detailed reply reconnects.\n'
    : '';

  return `${heading}

Today is ${today}.

I understood your request${visibleMode ? ` in ${visibleMode} mode` : ''}${templateId ? ` using ${templateId}` : ''}.

Summary
- ${clean.slice(0, 220)}${clean.length > 220 ? '...' : ''}

Useful next steps
1. Clarify the exact output you want.
2. Add any file, image, or context if the tool needs it.
3. Generate the final result and download it from SAVI.${note}

SAVI is ready to continue.`;
}

function isPersianOrFinglish(text: string) {
  return /[\u0600-\u06FF]/.test(text) || /\b(salam|khobi|mikham|mikhay?m|mikhastam|safhe|safha|safahat|jabe|jabeja|biad|biare|bere|bzar|bfrst|tabdil|seda|aks|ax|matn|baram|beshe|mishe)\b/i.test(text);
}

function conversationContext(history: ChatRequest['history']) {
  if (!Array.isArray(history)) return '';
  const entries = history
    .filter((item) => (item?.role === 'user' || item?.role === 'assistant') && typeof item.content === 'string')
    .slice(-14)
    .map((item) => `${item.role === 'user' ? 'User' : 'SAVI'}: ${item.content?.slice(0, 2000)}`);
  return entries.length ? `Conversation memory:\n${entries.join('\n')}\n\n` : '';
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ChatRequest;
    const message = body.message?.trim() ?? '';

    if (!message) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: `Message is too long. Limit it to ${MAX_MESSAGE_LENGTH} characters for now.` }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const userLanguageHint = isPersianOrFinglish(message) ? 'Persian/Finglish' : 'English or user-selected language';
    if (!apiKey) {
      return NextResponse.json({
        response: createLocalAnswer(message, body.mode, body.templateId),
        mode: 'local-preview'
      });
    }

    const systemInstruction = [
      'You are SAVI, Smart Assistant for Valuable Ideas by SKH.GLOBAL.',
      'Be helpful, clear, practical, concise, and warmly energetic. Sound like a sharp, encouraging creative partner, never like a cold support bot.',
      'Answer like a premium AI workspace assistant.',
      'Do not repeat the same guidance twice.',
      'For normal chat, reply naturally in the user language and do not add file download language.',
      'Normal chat guidance is free in the SAVI interface; do not tell users that chat consumes credits.',
      'SAVI has tools for Images, Voice, Radio Talk, Files/PDF, and Video. If a user asks for one of those workflows, give a short useful next step instead of a long checklist.',
      'Know SAVI tools as capabilities: text chat, text to image, image editing, remove background/object, mockups, story sketch, sketch to image, visual mixer, text to speech, radio podcast, PDF summarizing/explaining/translating, PDF to podcast script, and video script/video generation workflows.',
      'When the user describes a goal, think like a product assistant: recommend the simplest SAVI path, mention if multiple tools may be useful, and ask only the missing questions needed to proceed.',
      'Do not show coding words, backend terms, API names, Firebase, Stripe, or implementation details to the user.',
      'If the user needs to upload something, tell them to use the + button in SAVI.',
      'Do not pretend a tool output was generated unless the server actually generated it.',
      'Only claim to process files/images/audio when the selected tool actually provided that content.',
      `Current real date: ${currentDate}. Use this exact date when the user asks about today, tomorrow, yesterday, schedules, or current time-sensitive context.`,
      `User language hint: ${userLanguageHint}. Reply in the same language/style unless the user asks otherwise. Finglish should receive Persian/Finglish-friendly Persian guidance.`
    ].join('\n');

    const requestBody = (model: string) => ({
      model,
      system_instruction: systemInstruction,
      input: [
        {
          type: 'text',
          text: [
            body.mode ? `Selected mode: ${body.mode === 'Ask AI' ? 'Ask SAVI' : body.mode}` : '',
            body.templateId ? `Selected template: ${body.templateId}` : '',
            `Current date: ${currentDate}`,
            `Reply language: ${userLanguageHint}`,
            '',
            conversationContext(body.history),
            'Latest user message:',
            message
          ]
            .filter(Boolean)
            .join('\n')
        }
      ],
      generation_config: { thinking_level: 'low' },
      tools: [{ type: 'google_search' }]
    });

    type GeminiChatResponse = {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    let data: GeminiChatResponse;
    let model = 'local-continuity';
    try {
      const result = await requestGeminiWithFallback<GeminiChatResponse>({
        apiKey,
        models: [process.env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL, 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
        requestForModel: (nextModel) => ({
          url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
          init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody(nextModel))
          }
        }),
        parseError: (value) => value.error?.message
      });
      data = result.data;
      model = result.model;
    } catch {
      // A warm in-app response is better than forwarding a provider capacity error.
      return NextResponse.json({
        response: createLocalAnswer(message, body.mode, body.templateId, true),
        mode: 'continuity'
      });
    }

    const text = extractInteractionText(data);

    if (!text) {
      return NextResponse.json({
        response: createLocalAnswer(message, body.mode, body.templateId, true),
        mode: 'continuity'
      });
    }

    return NextResponse.json({
      response: text,
      mode: model
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat request failed.' },
      { status: 500 }
    );
  }
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TemplateItem } from '@/lib/templates';
import type { ToolMode } from '@/components/ToolModeSelector';
import type { SidebarMode } from '@/components/SaviSidebar';
import { ToolStatus } from '@/components/SaviToolUI';
import { recordMediaItem } from '@/lib/mediaLibrary';
import { getSaviAgentTool, type SaviAgentPlan, type SaviAgentToolId } from '@/lib/ai/saviAgent';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';
import { createSaviRadioScript } from '@/lib/voice/radioScript';
import { SAVI_EXTRACT_IMAGES_AVAILABLE } from '@/lib/pdf/workflowState';
import {
  canonicalTtsTone,
  canonicalTtsVoice,
  SAVI_IMAGE_VIDEO_OPTIONS,
  SAVI_TTS_TONES,
  SAVI_TTS_VOICES,
  ttsStyle,
  type SaviImageVideoDuration,
  type SaviImageVideoRatio,
  type SaviTtsTone,
  type SaviTtsVoice
} from '@/lib/ai/toolAssistant';
import {
  applyAuthoritativeBalance,
  clearSaviClientRequestId,
  createSaviClientRequestId,
  createSaviRequestScope,
  readPrivateTextAsset,
  revokeOwnedObjectUrl
} from '@/lib/savi/clientGeneration';

type AssistantTool =
  | 'smart_chat'
  | 'image_text'
  | 'voice_tts'
  | 'radio_talk'
  | 'video_studio'
  | 'file_studio'
  | 'image_studio';

type PendingAction = {
  id: string;
  tool: AssistantTool;
  title: string;
  mode: ToolMode;
  prompt: string;
  // This is populated only by the authenticated pricing endpoint immediately
  // before confirmation. It is never a client-side pricing authority.
  cost?: number;
  reason: string;
  canRunInChat: boolean;
  toolId?: string;
  language?: 'fa' | 'en';
  swapPages?: [number, number];
  followUpVoice?: boolean;
  attachmentIds?: string[];
  attachments?: ChatAttachment[];
  voice?: string;
  style?: string;
  radioSource?: 'topic' | 'script';
  intro?: string;
  agentToolId?: SaviAgentToolId;
  requiredInput?: 'none' | 'text' | 'image' | 'pdf' | 'video' | 'audio';
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:5';
  quality?: '720' | '1080' | '4K';
  duration?: '4' | '6' | '8';
};

type AgentPlanResponse = SaviAgentPlan & {
  title: string;
  requiredInput: PendingAction['requiredInput'];
  output: ChatResult['type'] | 'chat';
};

type ToolDraft = {
  tool: 'voice_tts' | 'radio_talk';
  stage: 'text' | 'voice' | 'settings';
  text?: string;
  language?: 'fa' | 'en';
  voice?: SaviTtsVoice;
  tone?: SaviTtsTone;
};

type ChatResult = {
  type: 'text' | 'image' | 'audio' | 'video' | 'file';
  text?: string;
  url?: string;
  filename?: string;
  helper?: string;
};

type ChatAttachmentKind = 'image' | 'pdf' | 'video' | 'audio' | 'file';

type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: ChatAttachmentKind;
  file: File;
  base64: string;
  previewUrl?: string;
};

type ChatAttachmentPreview = Pick<ChatAttachment, 'id' | 'name' | 'mimeType' | 'size' | 'kind' | 'previewUrl'>;

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  attachments?: ChatAttachmentPreview[];
  pendingAction?: PendingAction;
  quickReplies?: string[];
  result?: ChatResult;
  status?: 'idle' | 'running' | 'error';
};

type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

const CHAT_STORAGE_KEY = 'savi.ask.chat.v2';
const CHAT_SESSIONS_KEY = 'savi.chat.sessions.v1';
const ACTIVE_CHAT_KEY = 'savi.chat.active.v1';
const CHAT_SESSIONS_EVENT = 'savi-chat-sessions-updated';
const CHAT_NEW_EVENT = 'savi-new-chat-requested';
const CHAT_OPEN_EVENT = 'savi-open-chat-requested';
const CHAT_DELETE_EVENT = 'savi-chat-deleted';
const OUTPUT_STORAGE_KEY = 'savi.ask.outputs.v2';
const MAX_MEMORY_MESSAGES = 50;
const MAX_CHAT_ATTACHMENTS = 6;
const MAX_CHAT_ATTACHMENT_SIZE = 25 * 1024 * 1024;

const PDF_TOOL_TITLES: Record<string, string> = {
  organize_pdf: 'Organize PDF pages',
  merge_pdf: 'Merge PDF',
  pdf_to_jpg: 'PDF to JPG',
  extract_images: 'Extract PDF images',
  contract_summary: 'Contract Summary',
  explain_document: 'Explain Document',
  translate_summary: 'Translate PDF',
  pdf_podcast: 'PDF to Podcast Script'
};

function extractImagesUnavailableMessage(language: 'fa' | 'en' = 'en') {
  return localizedText(
    language,
    'ابزار استخراج تصاویر PDF فعلاً در دسترس نیست و هیچ اعتباری کم نمی‌شود.',
    'Extract Images is temporarily unavailable. No credits will be used.'
  );
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadStoredMessages() {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.map(stripLegacyClientQuote).slice(-MAX_MEMORY_MESSAGES) : [];
  } catch {
    return [];
  }
}

function stripLegacyClientQuote(message: ChatMessage): ChatMessage {
  if (!message.pendingAction) return message;
  const { cost: _legacyClientQuote, ...pendingAction } = message.pendingAction;
  return { ...message, pendingAction };
}

function loadStoredOutputs() {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(OUTPUT_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isMatch(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function normalizeDigits(text: string) {
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  return text.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = persianDigits.indexOf(digit);
    if (persianIndex >= 0) return String(persianIndex);
    const arabicIndex = arabicDigits.indexOf(digit);
    return arabicIndex >= 0 ? String(arabicIndex) : digit;
  });
}

function isPersian(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

function userLanguage(text: string): 'fa' | 'en' {
  if (/\b(salam|khobi|mikham|mikhay?m|mikhastam|safhe|safha|safah|safahat|safheha|jabe|jabeja|biad|biare|bere|bzar|bfrst|tabdil|seda|voice|aks|ax|matn|gharar|inja|baram|beshe|mishe|mikhastm|bede)\b/i.test(text)) {
    return 'fa';
  }
  return isPersian(text) ? 'fa' : 'en';
}

function localizedText(language: 'fa' | 'en', fa: string, en: string) {
  return language === 'fa' ? fa : en;
}

function isUploadQuickReply(reply: string) {
  return /\b(upload|attach|choose|select)\b|آپلود|ارسال|انتخاب|بارگذاری/i.test(reply);
}

function voiceScriptForAction(action: PendingAction) {
  if (action.tool !== 'radio_talk' || action.radioSource === 'script') return action.prompt.trim();
  return createSaviRadioScript(action.prompt, 'solo', 'short');
}

function wantsPdfPageOrganization(message: string) {
  const lower = normalizeDigits(message).toLowerCase();
  return isMatch(lower, [
    'organize page',
    'organize pages',
    'reorder page',
    'reorder pages',
    'swap page',
    'move page',
    'page order',
    'pages order',
    'sort pages',
    'moratab',
    'safhe',
    'safheha',
    'safhe hasho',
    'safhehasho',
    'safha',
    'safah',
    'safahat',
    'safahatesho',
    'page ha',
    'page hasho',
    'pagehasho',
    'jabe ja',
    'jabeja',
    'ja be ja',
    'bere be',
    'biad be',
    'biare be',
    'page ha',
    'barge',
    'مرتب',
    'جابه',
    'جابجا',
    'جا به جا',
    'صفحه',
    'صفحات',
    'صفحه‌ها',
    'صفحه هاشو',
    'صفحه‌هاشو',
    'برگه',
    'برگ',
    'بذار صفحه',
    'بیاد صفحه'
  ]);
}

function parseSwapPages(message: string): [number, number] | null {
  const lower = normalizeDigits(message).toLowerCase();
  const direct = lower.match(/(?:page|pages|صفحه|صفحات|safhe|safah|safahat|safahate?)\s*(\d{1,3})[\s\S]{0,120}?(?:page|pages|صفحه|صفحات|safhe|safah|safahat|safahate?)?\s*(\d{1,3})/);
  if (direct) {
    const first = Number(direct[1]);
    const second = Number(direct[2]);
    if (first > 0 && second > 0 && first !== second) return [first, second];
  }

  const numbers = Array.from(lower.matchAll(/\d{1,3}/g)).map((match) => Number(match[0])).filter((value) => value > 0);
  const hasPageMovementLanguage = /\b(page|pages|safhe|safha|safah|safahat|safheha|safahatesho|moratab|jabe|jabeja|bere|biad|biare|move|swap|reorder|organize|sort)\b|صفحه|صفحات|مرتب|جابه|جابجا|جا به جا|بیاد|بره|بذار/.test(lower);
  if (numbers.length >= 2 && hasPageMovementLanguage && numbers[0] !== numbers[1]) {
    return [numbers[0], numbers[1]];
  }

  return null;
}

function wantsPdfVoice(message: string) {
  const lower = normalizeDigits(message).toLowerCase();
  return isMatch(lower, ['podcast', 'radio', 'voice', 'audio', 'tts', 'seda', 'vis', 'وویس', 'ویس', 'صدا', 'رادیو', 'پادکست']);
}

function wantsPdfTranslation(message: string) {
  const lower = normalizeDigits(message).toLowerCase();
  return isMatch(lower, [
    'translate',
    'translation',
    'tarjome',
    'tarjoma',
    'tarjomash',
    'tarjomeh',
    'translate to persian',
    'to farsi',
    'same layout',
    'same format',
    'همون شکل',
    'همان شکل',
    'ترجمه',
    'فارسی',
    'فارس',
    'همون فرم',
    'همان فرم'
  ]);
}

function defaultPdfPrompt(toolId: string, language: 'fa' | 'en') {
  if (toolId === 'translate_summary') {
    return localizedText(
      language,
      'این PDF را به فارسی روان ترجمه کن و تا جای ممکن ساختار، تیترها، ترتیب بخش‌ها و قالب اصلی را حفظ کن. در پایان اگر لازم بود یک خلاصه کوتاه هم بده.',
      'Translate this PDF into clear Persian and preserve the original structure, headings, section order, and format as much as possible. Add a short summary only if useful.'
    );
  }
  if (toolId === 'contract_summary') {
    return localizedText(
      language,
      'این قرارداد را خلاصه کن؛ نکات اصلی، ریسک‌ها، تعهدات، تاریخ‌ها، مبلغ‌ها و قدم بعدی را واضح بنویس.',
      'Summarize this contract with key points, risks, obligations, dates, amounts, and next actions.'
    );
  }
  if (toolId === 'pdf_podcast') {
    return localizedText(
      language,
      'این PDF را به یک متن پادکست رادیویی کوتاه و قابل خواندن تبدیل کن؛ مقدمه، نکات اصلی و جمع‌بندی داشته باشد.',
      'Turn this PDF into a short readable radio podcast script with an intro, main points, and recap.'
    );
  }
  return localizedText(
    language,
    'این سند را ساده و قابل فهم توضیح بده؛ بگو موضوع چیست، چه چیزهایی مهم است و قدم بعدی چیست.',
    'Explain this PDF simply: what it is, what matters, and what the next step should be.'
  );
}

function makeSequentialPagePlan(pageCount: number, swapPages?: [number, number]) {
  const plan = Array.from({ length: pageCount }, (_, index) => ({
    pageNumber: index + 1,
    rotation: 0
  }));

  if (swapPages) {
    const [first, second] = swapPages;
    if (first >= 1 && second >= 1 && first <= pageCount && second <= pageCount) {
      const firstIndex = first - 1;
      const secondIndex = second - 1;
      [plan[firstIndex], plan[secondIndex]] = [plan[secondIndex], plan[firstIndex]];
    }
  }

  return plan;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentKind(file: File): ChatAttachmentKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return 'pdf';
  return 'file';
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',').pop() || '' : result);
    };
    reader.onerror = () => reject(reader.error || new Error('File could not be read.'));
    reader.readAsDataURL(file);
  });
}

function attachmentPreview(item: ChatAttachment): ChatAttachmentPreview {
  return {
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    size: item.size,
    kind: item.kind,
    previewUrl: item.previewUrl
  };
}

function inferToolIdFromImagePrompt(message: string, hasImage: boolean) {
  const lower = message.toLowerCase();
  if (!hasImage) return 'text_to_image';
  if (isMatch(lower, ['remove background', 'background', 'بک گراند', 'پس زمینه', 'پس‌زمینه'])) return 'remove_background';
  if (isMatch(lower, ['remove object', 'delete object', 'hazf', 'حذف', 'پاک کن', 'پاک'])) return 'remove_object';
  if (isMatch(lower, ['clothes', 'outfit', 'style', 'لباس', 'استایل'])) return 'change_style';
  if (isMatch(lower, ['mockup', 'موکاپ', 'product', 'محصول'])) return 'mockup';
  return 'edit_image';
}

function inferPdfToolId(message: string) {
  const lower = message.toLowerCase();
  if (isMatch(lower, ['merge', 'combine', 'join pdf', 'ادغام', 'یکی کن'])) return 'merge_pdf';
  if (isMatch(lower, ['pdf to jpg', 'convert to jpg', 'export pages', 'تبدیل به jpg', 'تبدیل به عکس'])) return 'pdf_to_jpg';
  if (isMatch(lower, ['extract images', 'extract image', 'خارج کردن عکس', 'استخراج عکس'])) return 'extract_images';
  if (parseSwapPages(lower)) return 'organize_pdf';
  if (wantsPdfPageOrganization(lower)) return 'organize_pdf';
  if (wantsPdfVoice(lower)) return 'pdf_podcast';
  if (wantsPdfTranslation(lower)) return 'translate_summary';
  if (isMatch(lower, ['contract', 'agreement', 'قرارداد'])) return 'contract_summary';
  return 'explain_document';
}

function inferActionWithAttachments(message: string, attachments: ChatAttachment[]): PendingAction | null {
  if (!attachments.length) return null;
  const prompt = message.trim();
  const imageAttachments = attachments.filter((item) => item.kind === 'image');
  const pdfAttachments = attachments.filter((item) => item.kind === 'pdf');
  const videoAttachments = attachments.filter((item) => item.kind === 'video');

  if (pdfAttachments.length) {
    const toolId = inferPdfToolId(prompt);
    const language = userLanguage(prompt);
    const swapPages = parseSwapPages(prompt);
    if (toolId === 'organize_pdf' && !swapPages) {
      return {
        id: makeId(),
        tool: 'file_studio',
        title: PDF_TOOL_TITLES.organize_pdf,
        mode: 'Files',
        prompt: prompt || 'Organize this PDF.',
        reason: localizedText(
          language,
          `فایل ${pdfAttachments[0].name} را دارم. فقط ترتیب دقیق صفحات را بگو؛ مثلا «صفحه ۱ و ۲ را جابه‌جا کن».`,
          `I have ${pdfAttachments[0].name}. Tell me the exact page order, for example: "swap page 1 and page 2".`
        ),
        canRunInChat: false,
        toolId,
        language,
        attachmentIds: [pdfAttachments[0].id],
        attachments: [pdfAttachments[0]]
      };
    }

    const unavailable = toolId === 'extract_images' && !SAVI_EXTRACT_IMAGES_AVAILABLE;
    return {
      id: makeId(),
      tool: 'file_studio',
      title: PDF_TOOL_TITLES[toolId] || 'PDF Tool',
      mode: 'Files',
      prompt: prompt || (toolId === 'organize_pdf' ? 'Organize this PDF.' : defaultPdfPrompt(toolId, language)),
      reason: unavailable
        ? extractImagesUnavailableMessage(language)
        : localizedText(language, `فایل ${pdfAttachments[0].name} آماده است. همین‌جا خروجی را می‌سازم.`, `I can process ${pdfAttachments[0].name} in this chat and return the result here.`),
      canRunInChat: !unavailable,
      toolId,
      language,
      swapPages: swapPages || undefined,
      followUpVoice: wantsPdfVoice(prompt),
      attachmentIds: toolId === 'merge_pdf' ? pdfAttachments.map((item) => item.id) : [pdfAttachments[0].id],
      attachments: toolId === 'merge_pdf' ? pdfAttachments : [pdfAttachments[0]]
    };
  }

  if (imageAttachments.length) {
    if (isMatch(prompt, ['video', 'animate', 'reel', 'motion', 'ویدیو', 'ويديو', 'کلیپ', 'متحرک', 'انیمیت'])) {
      return {
        id: makeId(),
        tool: 'video_studio',
        title: 'Image to Video',
        mode: 'Video',
        prompt: prompt || 'Animate this image into a short polished SAVI video.',
        reason: `I can use the uploaded image as a video reference and create the clip here.`,
        canRunInChat: true,
        toolId: 'image_video',
        attachmentIds: imageAttachments.slice(0, 3).map((item) => item.id),
        attachments: imageAttachments.slice(0, 3)
      };
    }

    const toolId = inferToolIdFromImagePrompt(prompt, true);
    return {
      id: makeId(),
      tool: 'image_studio',
      title: toolId === 'remove_background' ? 'Remove Background' : toolId === 'remove_object' ? 'Remove Object' : toolId === 'change_style' ? 'Change Style' : toolId === 'mockup' ? 'Mockup' : 'Edit Image',
      mode: 'Images',
      prompt: prompt || 'Edit this image while preserving the original subject.',
      reason: `I can use the uploaded image and create the output here.`,
      canRunInChat: true,
      toolId,
      attachmentIds: imageAttachments.slice(0, toolId === 'mockup' ? 2 : 3).map((item) => item.id),
      attachments: imageAttachments.slice(0, toolId === 'mockup' ? 2 : 3)
    };
  }

  if (videoAttachments.length) {
    return {
      id: makeId(),
      tool: 'video_studio',
      title: 'Video Tool',
      mode: 'Video',
      prompt: prompt || 'Use this reference video and create a polished SAVI output.',
      reason: `I can send this reference to the video tool. I will ask confirmation before generation.`,
      canRunInChat: true,
      toolId: 'extend',
      attachmentIds: videoAttachments.slice(0, 3).map((item) => item.id),
      attachments: videoAttachments.slice(0, 3)
    };
  }

  return null;
}

function inferContextualToolKind(message: string): ChatAttachmentKind | null {
  const lower = message.toLowerCase();
  if (
    isMatch(lower, ['pdf', 'document', 'contract', 'file', 'page', 'pages', 'پی دی اف', 'پی‌دی‌اف', 'فایل', 'سند', 'قرارداد', 'صفحه', 'صفحات']) ||
    parseSwapPages(lower) ||
    wantsPdfPageOrganization(lower)
  ) {
    return 'pdf';
  }

  if (isMatch(lower, ['image', 'photo', 'picture', 'عکس', 'تصویر'])) return 'image';
  if (isMatch(lower, ['video', 'clip', 'ویدیو', 'ويديو', 'کلیپ'])) return 'video';
  if (isMatch(lower, ['audio', 'voice', 'صدا', 'ویس', 'وویس'])) return 'audio';
  return null;
}

function updateMessage(messages: ChatMessage[], id: string, updates: Partial<ChatMessage>) {
  return messages.map((message) => (message.id === id ? { ...message, ...updates } : message));
}

function getTextDirection(text: string): 'rtl' | 'ltr' {
  return /[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr';
}

function createChatTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content.trim();
  if (!firstUserMessage) return 'New chat';
  const normalized = firstUserMessage.replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  const topic = normalized.replace(/^(please|can you|could you|help me|i need|i want to)\s+/i, '');
  return topic.slice(0, 42).trim() || 'Conversation';
}

function hasRealUserMessage(message: ChatMessage) {
  return message.role === 'user' && Boolean(message.content.trim() || message.attachments?.length);
}

function loadStoredSessions(): ChatSession[] {
  if (typeof window === 'undefined') return [];

  try {
    const value = window.localStorage.getItem(CHAT_SESSIONS_KEY);
    if (value) {
      const parsed = JSON.parse(value) as ChatSession[];
      if (Array.isArray(parsed)) {
        const storedSessions = parsed
          .filter((session) => Array.isArray(session.messages) && session.messages.some(hasRealUserMessage))
          .map((session) => {
            const messages = session.messages.map(stripLegacyClientQuote);
            return {
              ...session,
              title: createChatTitle(messages),
              messages
            };
          });
        if (storedSessions.length) return storedSessions;
      }
    }

    const oldMessages = loadStoredMessages();
    if (oldMessages.some(hasRealUserMessage)) {
      const now = Date.now();
      return [{
        id: makeId(),
        title: createChatTitle(oldMessages),
        createdAt: oldMessages[0]?.createdAt || now,
        updatedAt: oldMessages[oldMessages.length - 1]?.createdAt || now,
        messages: oldMessages.slice(-MAX_MEMORY_MESSAGES)
      }];
    }
  } catch {
    return [];
  }

  return [];
}

function loadInitialChatState() {
  const sessions = loadStoredSessions();
  // A bare Ask SAVI workspace is always a new, ephemeral chat. Stored chats
  // are restored for the sidebar, then opened only through an explicit route
  // or the existing chat-open event.
  return {
    sessions,
    activeChatId: '',
    messages: []
  };
}

function extractQuotedOrLongText(message: string) {
  const markerMatch = message.match(/(?:text|matn|متن)\s*[:：]\s*([\s\S]+)/i);
  if (markerMatch?.[1]?.trim()) return markerMatch[1].trim();

  const quoteMatch = message.match(/["“”']([^"“”']{24,})["“”']/);
  if (quoteMatch?.[1]?.trim()) return quoteMatch[1].trim();

  if (message.includes('\n') || message.length > 150) return message.trim();
  return '';
}

function actionFromTemplate(template: TemplateItem, prompt: string): PendingAction {
  if (template.inputType === 'PDF') {
    return {
      id: makeId(),
      tool: 'file_studio',
      title: template.title,
      mode: 'Files',
      prompt,
      reason: 'This needs a PDF. I will open the exact file workflow for you.',
      canRunInChat: false
    };
  }

  if (template.inputType === 'Image') {
    return {
      id: makeId(),
      tool: 'image_studio',
      title: template.title,
      mode: 'Images',
      prompt,
      reason: 'This needs an image upload. I will open the image workflow for you.',
      canRunInChat: false
    };
  }

  if (template.id === 'blog-to-audio') {
    return {
      id: makeId(),
      tool: 'voice_tts',
      title: 'Text to Speech',
      mode: 'Voice',
      prompt,
      reason: 'I can make this into downloadable audio.',
      canRunInChat: true,
      voice: 'Kore',
      style: 'natural text to speech, warm clear delivery'
    };
  }

  return {
    id: makeId(),
    tool: 'smart_chat',
    title: template.title,
    mode: 'Ask AI',
    prompt,
    reason: 'This text workflow can run directly here.',
    canRunInChat: true
  };
}

function detectAction(message: string, template?: TemplateItem): PendingAction {
  const prompt = message.trim();
  const language = userLanguage(prompt);
  if (template) return actionFromTemplate(template, prompt || template.prompt);
  const mentionsImage = isMatch(prompt, ['image', 'photo', 'picture', 'aks', 'ax', 'عکس', 'تصویر']);
  const wantsImageEdit = isMatch(prompt, ['edit', 'change', 'modify', 'remove', 'replace', 'retouch', 'taghir', 'taghyir', 'hazf', 'عوض', 'تغییر', 'ویرایش', 'ادیت', 'حذف']);
  const swapPages = parseSwapPages(prompt);
  const wantsOrganizePdf = Boolean(swapPages) || wantsPdfPageOrganization(prompt);
  const wantsTranslatePdf = wantsPdfTranslation(prompt);

    if (
      wantsOrganizePdf ||
      wantsTranslatePdf ||
      isMatch(prompt, ['pdf', 'document', 'contract', 'file', 'merge', 'organize pages', 'summarize pdf', 'translate pdf', 'پی دی اف', 'پی‌دی‌اف', 'فایل', 'قرارداد', 'سند'])
  ) {
    const toolId = wantsOrganizePdf ? 'organize_pdf' : wantsTranslatePdf ? 'translate_summary' : undefined;
    return {
      id: makeId(),
      tool: 'file_studio',
      title: toolId ? PDF_TOOL_TITLES[toolId] : 'File tools',
      mode: 'Files',
      prompt: prompt || (toolId ? defaultPdfPrompt(toolId, language) : ''),
      reason: 'This needs upload, preview, or page controls.',
      canRunInChat: false,
      toolId,
      language,
      swapPages: swapPages || undefined
    };
  }

  if (isMatch(prompt, ['remove background', 'remove object', 'change clothes', 'edit image', 'image edit', 'حذف بک', 'حذف پس', 'عوض کردن لباس', 'تغییر لباس']) || (mentionsImage && wantsImageEdit)) {
    return {
      id: makeId(),
      tool: 'image_studio',
      title: 'Image editing',
      mode: 'Images',
      prompt,
      reason: 'This needs an uploaded image and edit controls.',
      canRunInChat: false
    };
  }

  if (isMatch(prompt, ['text to image', 'generate image', 'create image', 'make image', 'photo', 'picture', 'nano banana', 'تصویر', 'عکس', 'بساز عکس'])) {
    return {
      id: makeId(),
      tool: 'image_text',
      title: 'Text to Image',
      mode: 'Images',
      prompt,
      reason: 'I can create this image directly in chat.',
      canRunInChat: true
    };
  }

  if (isMatch(prompt, ['radio', 'podcast', 'talk show', 'رادیو', 'پادکست', 'رادیویی'])) {
    return {
      id: makeId(),
      tool: 'radio_talk',
      title: 'Radio Talk AI',
      mode: 'Voice',
      prompt,
      reason: 'I can shape this into a hosted radio segment with audio.',
      canRunInChat: true
    };
  }

  if (isMatch(prompt, ['text to speech', 'text to voice', 'tts', 'voice', 'audio', 'read this', 'speech', 'matn', 'matno', 'tabdil', 'صدا', 'ویس', 'وویس', 'بخون', 'متن'])) {
    return {
      id: makeId(),
      tool: 'voice_tts',
      title: 'Text to Speech',
      mode: 'Voice',
      prompt,
      reason: 'I can turn the text into downloadable audio.',
      canRunInChat: true
    };
  }

  if (isMatch(prompt, ['video', 'veo', 'reel', 'animate', 'ویدیو', 'ويديو', 'کلیپ', 'ریل', 'ریلز'])) {
    const wantsScript = isMatch(prompt, ['script', 'ad script', 'سناریو', 'اسکریپت', 'تبلیغ']);
    if (wantsScript) {
      return {
        id: makeId(),
        tool: 'smart_chat',
        title: 'Ask SAVI',
        mode: 'Ask AI',
        prompt,
        reason: 'I can help plan the script in chat.',
        canRunInChat: true
      };
    }

    return {
      id: makeId(),
      tool: 'video_studio',
      title: 'Video tools',
      mode: 'Video',
      prompt,
      reason: 'Video needs duration, ratio, references, and confirmation.',
      canRunInChat: true,
      toolId: 'text_video'
    };
  }

  return {
    id: makeId(),
    tool: 'smart_chat',
    title: 'Ask SAVI',
    mode: 'Ask AI',
    prompt,
    reason: 'Normal chat is free.',
    canRunInChat: true
  };
}

function agentToolToAssistantTool(toolId: SaviAgentToolId): AssistantTool {
  if (['text_to_image', 'story_sketch', 'text_design', 'instagram_post', 'product_prompt'].includes(toolId)) return 'image_text';
  if (['edit_image', 'remove_background', 'remove_object', 'change_style', 'mockup', 'visual_mixer', 'sketch_to_image', 'product_photo', 'variations'].includes(toolId)) return 'image_studio';
  if (toolId === 'text_to_speech') return 'voice_tts';
  if (toolId === 'radio_talk') return 'radio_talk';
  if (['text_video', 'story_video', 'image_video', 'first_last', 'product_ad', 'social_reel', 'extend'].includes(toolId)) return 'video_studio';
  if (['merge_pdf', 'organize_pdf', 'pdf_to_jpg', 'extract_images', 'contract_summary', 'explain_document', 'translate_summary', 'pdf_podcast'].includes(toolId)) return 'file_studio';
  return 'smart_chat';
}

function agentToolApiId(toolId: string) {
  // Older browser-saved actions can retain the former UI aliases. New plans
  // always use the canonical server tool IDs above.
  const mapping: Record<string, string> = {
    first_last_video: 'first_last',
    product_ad_video: 'product_ad',
    social_reel_video: 'social_reel',
    extend_video: 'extend',
    translate_pdf: 'translate_summary',
    extract_pdf_images: 'extract_images'
  };
  return mapping[toolId] || toolId;
}

function toolAttachmentsForPlan(plan: AgentPlanResponse, attachments: ChatAttachment[]) {
  if (plan.requiredInput === 'pdf') return attachments.filter((item) => item.kind === 'pdf');
  if (plan.requiredInput === 'image') return attachments.filter((item) => item.kind === 'image');
  if (plan.requiredInput === 'video') return attachments.filter((item) => item.kind === 'video');
  if (plan.requiredInput === 'audio') return attachments.filter((item) => item.kind === 'audio');
  return [];
}

function actionFromAgentPlan(plan: AgentPlanResponse, attachments: ChatAttachment[]): PendingAction {
  const tool = getSaviAgentTool(plan.toolId);
  const toolId = agentToolApiId(plan.toolId);
  const actionAttachments = toolAttachmentsForPlan(plan, attachments);
  const attachmentLimit = plan.toolId === 'mockup' ? 2 : plan.toolId === 'visual_mixer' ? 6 : plan.toolId === 'merge_pdf' ? 12 : 3;
  const selectedAttachments = actionAttachments.slice(0, attachmentLimit);
  const assistantTool = agentToolToAssistantTool(plan.toolId);
  const requiresUpload = ['image', 'pdf', 'video', 'audio'].includes(plan.requiredInput || tool.requiredInput);
  const hasRequiredInput = !requiresUpload || actionAttachments.length > 0;
  const shouldRunInChat = plan.intent === 'tool' && hasRequiredInput;
  const language = plan.language || userLanguage(plan.prompt);
  const unavailable = toolId === 'extract_images' && !SAVI_EXTRACT_IMAGES_AVAILABLE;

  return {
    id: makeId(),
    tool: assistantTool,
    title: tool.title,
    mode: tool.category === 'image' ? 'Images' : tool.category === 'voice' ? 'Voice' : tool.category === 'video' ? 'Video' : tool.category === 'file' ? 'Files' : 'Ask AI',
    prompt: plan.prompt,
    reason: unavailable ? extractImagesUnavailableMessage(language) : plan.reply,
    intro: unavailable ? extractImagesUnavailableMessage(language) : plan.reply,
    canRunInChat: shouldRunInChat && !unavailable,
    toolId: assistantTool === 'smart_chat' || assistantTool === 'voice_tts' || assistantTool === 'radio_talk' ? undefined : toolId,
    language,
    swapPages: plan.pageA && plan.pageB ? [plan.pageA, plan.pageB] : undefined,
    followUpVoice: plan.nextToolId === 'text_to_speech' || plan.nextToolId === 'radio_talk',
    attachments: selectedAttachments,
    attachmentIds: selectedAttachments.map((item) => item.id),
    voice: plan.voice,
    style: plan.style,
    agentToolId: plan.toolId,
    requiredInput: plan.requiredInput,
    aspectRatio: plan.aspectRatio,
    quality: plan.quality,
    duration: plan.duration
  };
}

export function AskSaviChat({
  credits,
  onCreditsChange,
  onOpenTool,
  template,
  templateLaunchKey = 0,
  initialMessage = '',
  initialMessageLaunchKey = 0,
  newChatLaunchKey = 0
}: {
  credits: number | null;
  onCreditsChange: (credits: number) => void;
  onOpenTool: (mode: SidebarMode, template?: TemplateItem) => void;
  template?: TemplateItem;
  templateLaunchKey?: number;
  initialMessage?: string;
  initialMessageLaunchKey?: number;
  newChatLaunchKey?: number;
}) {
  const { user, isLoading: isAuthLoading, signIn } = useSaviAuth();
  // Storage is browser-only. Hydrating it after the first render prevents a
  // server/client mismatch when an existing chat is present in localStorage.
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [savedOutputs, setSavedOutputs] = useState<ChatMessage[]>([]);
  const [chatHydrated, setChatHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [draftTemplate, setDraftTemplate] = useState<TemplateItem | undefined>();
  const [toolDraft, setToolDraft] = useState<ToolDraft | undefined>();
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [guidedVideoAction, setGuidedVideoAction] = useState<PendingAction | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const actionAttachmentStoreRef = useRef<Record<string, ChatAttachment[]>>({});
  const pendingUploadActionRef = useRef<PendingAction | null>(null);
  const recentAttachmentsRef = useRef<Record<ChatAttachmentKind, ChatAttachment[]>>({
    image: [],
    pdf: [],
    video: [],
    audio: [],
    file: []
  });
  const handledInitialMessageKey = useRef(0);
  const handledNewChatKey = useRef(0);
  const handledRouteChat = useRef(false);
  const submitInFlightRef = useRef(false);

  const isFreshWorkspace = !activeChatId && messages.length === 0;

  const visibleMessages = useMemo(() => {
    if (messages.length) return messages;
    return [
      {
        id: 'welcome',
        role: 'assistant' as const,
        createdAt: Date.now(),
        content:
          'Tell me what you want to do. Chat is free. When a tool is needed, I will ask for the missing details, show the credit cost, and wait for your confirmation.'
      }
    ];
  }, [messages]);

  useEffect(() => {
    const initial = loadInitialChatState();
    setChatSessions(initial.sessions);
    setActiveChatId(initial.activeChatId);
    setMessages(initial.messages);
    setSavedOutputs(loadStoredOutputs());
    setChatHydrated(true);
  }, []);

  useEffect(() => {
    if (!chatHydrated || typeof window === 'undefined') return;
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    const activeSession = chatSessions.find((session) => session.id === activeChatId);
    if (!activeSession) return;
    setMessages(activeSession.messages.slice(-MAX_MEMORY_MESSAGES));
  }, [activeChatId]);

  useEffect(() => {
    if (!chatHydrated || typeof window === 'undefined') return;
    const hasRealMessages = messages.some(hasRealUserMessage);

    if (!activeChatId) {
      if (!hasRealMessages) {
        window.localStorage.removeItem(CHAT_STORAGE_KEY);
        return;
      }

      const now = Date.now();
      const session: ChatSession = {
        id: makeId(),
        title: createChatTitle(messages),
        createdAt: messages[0]?.createdAt || now,
        updatedAt: now,
        messages: messages.slice(-MAX_MEMORY_MESSAGES)
      };
      setChatSessions((current) => [session, ...current]);
      setActiveChatId(session.id);
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(session.messages));
      return;
    }

    setChatSessions((current) => {
      const now = Date.now();
      const next = current.map((session) =>
        session.id === activeChatId
          ? {
              ...session,
              title: createChatTitle(messages),
              updatedAt: messages.length ? now : session.updatedAt,
              messages: messages.slice(-MAX_MEMORY_MESSAGES)
            }
          : session
      );
      return next.sort((a, b) => b.updatedAt - a.updatedAt);
    });
    if (hasRealMessages) {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MEMORY_MESSAGES)));
    }
  }, [activeChatId, chatHydrated, messages]);

  useEffect(() => {
    if (!chatHydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(chatSessions.slice(0, 40)));
    if (activeChatId) window.localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
    else window.localStorage.removeItem(ACTIVE_CHAT_KEY);
    window.dispatchEvent(new CustomEvent(CHAT_SESSIONS_EVENT));
  }, [activeChatId, chatHydrated, chatSessions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function createNewChatFromEvent() {
      createNewChat();
    }

    function openChatFromEvent(event: Event) {
      const chatId = (event as CustomEvent<{ chatId?: string }>).detail?.chatId;
      if (chatId) openChat(chatId);
    }

    function deleteChatFromEvent(event: Event) {
      const chatId = (event as CustomEvent<{ chatId?: string }>).detail?.chatId;
      const nextSessions = loadStoredSessions();
      if (!nextSessions.length) {
        setChatSessions([]);
        setActiveChatId('');
        setMessages([]);
        return;
      }

      setChatSessions(nextSessions);
      if (chatId === activeChatId) {
        const fallback = nextSessions[0];
        setActiveChatId(fallback.id);
        setMessages(fallback.messages.slice(-MAX_MEMORY_MESSAGES));
      }
    }

    window.addEventListener(CHAT_NEW_EVENT, createNewChatFromEvent);
    window.addEventListener(CHAT_OPEN_EVENT, openChatFromEvent);
    window.addEventListener(CHAT_DELETE_EVENT, deleteChatFromEvent);
    return () => {
      window.removeEventListener(CHAT_NEW_EVENT, createNewChatFromEvent);
      window.removeEventListener(CHAT_OPEN_EVENT, openChatFromEvent);
      window.removeEventListener(CHAT_DELETE_EVENT, deleteChatFromEvent);
    };
  }, [activeChatId, chatSessions]);

  useEffect(() => {
    if (!chatHydrated || handledRouteChat.current || typeof window === 'undefined') return;
    handledRouteChat.current = true;

    const params = new URLSearchParams(window.location.search);
    if (params.get('newChat') === '1') {
      createNewChat();
      window.history.replaceState(null, '', '/workspace');
      return;
    }

    const chatId = params.get('chat');
    if (chatId) openChat(chatId);
  }, [chatHydrated, chatSessions]);

  useEffect(() => {
    if (!chatHydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(OUTPUT_STORAGE_KEY, JSON.stringify(savedOutputs.slice(0, 10)));
  }, [chatHydrated, savedOutputs]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, runningActionId]);

  useEffect(() => {
    if (!template || templateLaunchKey === 0) return;
    setDraftTemplate(template);
    setInput(`${template.prompt}\n\n`);
  }, [template, templateLaunchKey]);

  useEffect(() => {
    if (!chatHydrated || !initialMessage.trim() || initialMessageLaunchKey === 0) return;
    if (handledInitialMessageKey.current === initialMessageLaunchKey) return;
    handledInitialMessageKey.current = initialMessageLaunchKey;
    void submitText(initialMessage);
  }, [chatHydrated, initialMessage, initialMessageLaunchKey]);

  useEffect(() => {
    if (!chatHydrated || newChatLaunchKey === 0 || handledNewChatKey.current === newChatLaunchKey) return;
    handledNewChatKey.current = newChatLaunchKey;
    createNewChat();
  }, [chatHydrated, newChatLaunchKey]);

  function createNewChat() {
    setActiveChatId('');
    setMessages([]);
    setInput('');
    setDraftTemplate(undefined);
    setToolDraft(undefined);
    setAttachments((current) => {
      current.forEach((attachment) => revokeOwnedObjectUrl(attachment.previewUrl));
      return [];
    });
    setUploadError('');
    setShowQuickMenu(false);
    actionAttachmentStoreRef.current = {};
    pendingUploadActionRef.current = null;
    setGuidedVideoAction(null);
    recentAttachmentsRef.current = { image: [], pdf: [], video: [], audio: [], file: [] };
    setRunningActionId(null);
  }

  function openChat(chatId: string) {
    const session = chatSessions.find((item) => item.id === chatId);
    if (!session) return;
    setActiveChatId(session.id);
    setMessages(session.messages.slice(-MAX_MEMORY_MESSAGES));
    setInput('');
    setDraftTemplate(undefined);
    setToolDraft(undefined);
    setAttachments((current) => {
      current.forEach((attachment) => revokeOwnedObjectUrl(attachment.previewUrl));
      return [];
    });
    setUploadError('');
    actionAttachmentStoreRef.current = {};
    pendingUploadActionRef.current = null;
    setGuidedVideoAction(null);
    recentAttachmentsRef.current = { image: [], pdf: [], video: [], audio: [], file: [] };
    setRunningActionId(null);
  }

  function inferContextualAttachments(message: string) {
    const kind = inferContextualToolKind(message);
    if (!kind) return [];
    return recentAttachmentsRef.current[kind] || [];
  }

  function rememberActionAttachments(items: ChatAttachment[]) {
    for (const item of items) {
      recentAttachmentsRef.current[item.kind] = [item, ...recentAttachmentsRef.current[item.kind].filter((existing) => existing.id !== item.id)].slice(0, 6);
    }
  }

  function continuePendingUploadAction(newAttachments: ChatAttachment[]) {
    const pending = pendingUploadActionRef.current;
    if (!pending) return;

    const uploadedPdfs = newAttachments.filter((item) => item.kind === 'pdf');
    const pdf = uploadedPdfs[0];
    if (pending.tool === 'file_studio' && pdf) {
      const language = pending.language || userLanguage(pending.prompt);
      const toolId = pending.toolId || inferPdfToolId(pending.prompt);
      const allPdfs = [...uploadedPdfs, ...recentAttachmentsRef.current.pdf]
        .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);

      if (toolId === 'extract_images' && !SAVI_EXTRACT_IMAGES_AVAILABLE) {
        pendingUploadActionRef.current = null;
        addAssistantMessage(extractImagesUnavailableMessage(language));
        return;
      }

      if (toolId === 'merge_pdf') {
        if (allPdfs.length < 2) {
          pendingUploadActionRef.current = { ...pending, attachments: allPdfs, attachmentIds: allPdfs.map((item) => item.id) };
          addAssistantMessage(
            localizedText(language, 'برای ادغام، یک PDF دیگر هم با دکمه + اضافه کن.', 'Add one more PDF with the + button so I can merge them.')
          );
          return;
        }

        pendingUploadActionRef.current = null;
        addPendingAction({
          ...pending,
          id: makeId(),
          canRunInChat: true,
          attachments: allPdfs,
          attachmentIds: allPdfs.map((item) => item.id),
          reason: localizedText(language, `${allPdfs.length} فایل آماده ادغام هستند.`, `${allPdfs.length} PDFs are ready to merge.`),
          intro: pending.reason
        });
        return;
      }

      pendingUploadActionRef.current = null;
      const swapPages = pending.swapPages || parseSwapPages(pending.prompt);

      if (toolId === 'organize_pdf' && !swapPages) {
        addAssistantMessage(
          localizedText(
            language,
            `فایل ${pdf.name} را گرفتم. فقط ترتیب دقیق صفحات را بگو؛ مثلا «صفحه ۱ و ۲ را جابه‌جا کن». تا وقتی تایید نکنی credit کم نمی‌شود.`,
            `I have ${pdf.name}. Tell me the exact page order, for example: "swap page 1 and page 2". No credits are used until you confirm.`
          )
        );
        pendingUploadActionRef.current = { ...pending, attachments: [pdf], attachmentIds: [pdf.id] };
        return;
      }

      addPendingAction({
        ...pending,
        id: makeId(),
        title: PDF_TOOL_TITLES[toolId] || pending.title,
        prompt: pending.prompt || defaultPdfPrompt(toolId, language),
        reason: localizedText(
          language,
          toolId === 'translate_summary'
            ? `فایل ${pdf.name} آماده است. آن را به فارسی ترجمه می‌کنم و ساختار متن را تا جای ممکن نگه می‌دارم.`
            : `فایل ${pdf.name} آماده است. همین‌جا خروجی را می‌سازم.`,
          toolId === 'translate_summary'
            ? `${pdf.name} is ready. I will translate it into Persian and preserve the structure as much as possible.`
            : `${pdf.name} is ready. I can return the output here.`
        ),
        canRunInChat: true,
        toolId,
        language,
        swapPages: swapPages || undefined,
        attachments: [pdf],
        attachmentIds: [pdf.id],
        followUpVoice: pending.followUpVoice || wantsPdfVoice(pending.prompt)
      });
      return;
    }

    const imageAttachments = newAttachments.filter((item) => item.kind === 'image');
    if (pending.tool === 'image_studio' && imageAttachments.length) {
      pendingUploadActionRef.current = null;
      addPendingAction({
        ...pending,
        id: makeId(),
        canRunInChat: true,
        attachments: imageAttachments.slice(0, pending.toolId === 'mockup' ? 2 : 3),
        attachmentIds: imageAttachments.slice(0, pending.toolId === 'mockup' ? 2 : 3).map((item) => item.id),
        reason: localizedText(pending.language || userLanguage(pending.prompt), 'تصویر آماده است. خروجی را همین‌جا می‌سازم.', 'The image is ready. I can create the output here.'),
        intro: pending.reason
      });
      return;
    }

    const videoReferences = newAttachments.filter((item) => item.kind === 'image' || item.kind === 'video');
    if (pending.tool === 'video_studio' && videoReferences.length) {
      pendingUploadActionRef.current = null;
      beginGuidedImageVideo({
        ...pending,
        attachments: videoReferences.slice(0, 3),
        attachmentIds: videoReferences.slice(0, 3).map((item) => item.id)
      });
    }
  }

  function beginGuidedImageVideo(action: PendingAction) {
    const language = action.language || userLanguage(action.prompt);
    setGuidedVideoAction({
      ...action,
      id: makeId(),
      canRunInChat: true,
      aspectRatio: undefined,
      duration: undefined,
      quality: '720'
    });
    addAssistantMessage(
      localizedText(language, 'عکس آماده است. نسبت تصویر ویدئو را انتخاب کن.', 'Your image is ready. Choose the video shape.'),
      ['Vertical 9:16', 'Wide 16:9']
    );
  }

  function advanceGuidedImageVideo(choice: string) {
    if (!guidedVideoAction) return false;
    const language = guidedVideoAction.language || userLanguage(guidedVideoAction.prompt);
    const ratio = choice.includes('9:16') ? '9:16' : choice.includes('16:9') ? '16:9' : undefined;
    if (!guidedVideoAction.aspectRatio && ratio) {
      setGuidedVideoAction({ ...guidedVideoAction, aspectRatio: ratio as SaviImageVideoRatio });
      addAssistantMessage(localizedText(language, 'مدت ویدئو را انتخاب کن.', 'Choose the video length.'), SAVI_IMAGE_VIDEO_OPTIONS.durations.map((duration) => `${duration} seconds`));
      return true;
    }

    const duration = SAVI_IMAGE_VIDEO_OPTIONS.durations.find((item) => choice.includes(item));
    if (!guidedVideoAction.duration && duration) {
      setGuidedVideoAction({ ...guidedVideoAction, duration });
      addAssistantMessage(
        localizedText(language, 'حرکت را خودت بنویس یا یکی از پیشنهادها را انتخاب کن.', 'Describe the movement, or choose a suggestion.'),
        ['Slow camera push-in', 'Gentle orbit', 'Use the motion from my request']
      );
      return true;
    }

    const prompt = choice === 'Use the motion from my request' ? guidedVideoAction.prompt : choice;
    const readyAction: PendingAction = {
      ...guidedVideoAction,
      prompt,
      aspectRatio: guidedVideoAction.aspectRatio || '9:16',
      duration: guidedVideoAction.duration || '6',
      quality: '720',
      reason: localizedText(language, 'تنظیمات آماده است. بعد از بررسی هزینه، فقط با تایید تو ویدئو ساخته می‌شود.', 'Settings are ready. After the credit check, video generation starts only when you confirm.'),
      intro: localizedText(language, 'ویدئوی تصویری آماده بررسی است.', 'Your image-to-video request is ready for review.')
    };
    setGuidedVideoAction(null);
    void addPendingAction(readyAction);
    return true;
  }

  async function submit() {
    await submitText(input, attachments);
  }

  function conversationHistory() {
    return messages
      .filter((message) => message.status !== 'running')
      .slice(-14)
      .map((message) => ({ role: message.role, content: message.content }));
  }

  async function planWithSaviAgent(message: string, currentAttachments: ChatAttachment[]) {
    const knownAttachments = Object.values(recentAttachmentsRef.current).flat();
    const attachmentMap = new Map<string, ChatAttachment>();
    [...currentAttachments, ...knownAttachments].forEach((item) => attachmentMap.set(item.id, item));

    const response = await fetch('/api/ai/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        clientRequestId: createSaviClientRequestId(),
        history: conversationHistory(),
        attachments: Array.from(attachmentMap.values()).map((item) => ({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          size: item.size,
          kind: item.kind
        }))
      })
    });
    const data = (await response.json().catch(() => ({}))) as { plan?: AgentPlanResponse; error?: string };
    if (!response.ok || !data.plan) throw new Error(data.error || 'SAVI could not understand this request.');
    return { plan: data.plan, attachments: Array.from(attachmentMap.values()) };
  }

  async function submitText(rawMessage: string, submittedAttachments: ChatAttachment[] = []) {
    const clean = rawMessage.trim();
    if ((!clean && !submittedAttachments.length) || runningActionId || submitInFlightRef.current) return;
    submitInFlightRef.current = true;

    try {

    const userMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: clean || `Uploaded ${submittedAttachments.length} file${submittedAttachments.length === 1 ? '' : 's'}.`,
      attachments: submittedAttachments.map(attachmentPreview),
      createdAt: Date.now()
    };

    setInput('');
    setAttachments([]);
    setUploadError('');
    setMessages((current) => [...current, userMessage].slice(-MAX_MEMORY_MESSAGES));

    if (!clean && submittedAttachments.length) {
      const language = userLanguage(submittedAttachments.map((item) => item.name).join(' '));
      addAssistantMessage(
        localizedText(
          language,
          'فایل را گرفتم. می‌خواهی با آن چه کاری انجام بدهم؟',
          'I have the file. What would you like me to do with it?'
        )
      );
      rememberActionAttachments(submittedAttachments);
      return;
    }

    if (guidedVideoAction && advanceGuidedImageVideo(clean)) return;

    if (toolDraft) {
      handleDraftReply(clean);
      return;
    }

    rememberActionAttachments(submittedAttachments);

    const contextualAttachments = submittedAttachments.length
      ? submittedAttachments
      : inferContextualAttachments(clean);
    let action: PendingAction;

    if (draftTemplate) {
      action = actionFromTemplate(draftTemplate, clean || draftTemplate.prompt);
      setDraftTemplate(undefined);
    } else {
      setRunningActionId('savi-agent');
      try {
        const { plan, attachments: agentAttachments } = await planWithSaviAgent(clean, contextualAttachments);
        if (plan.intent === 'chat' || plan.toolId === 'chat') {
          await runFreeChat(clean, conversationHistory());
          return;
        }

        action = actionFromAgentPlan(plan, agentAttachments);
        if (plan.intent === 'question') {
          if (action.tool === 'voice_tts' || action.tool === 'radio_talk') {
            const language = action.language || userLanguage(clean);
            const expectedText = plan.missingInput === 'text';
            if (expectedText) {
              setToolDraft({
                tool: action.tool,
                stage: 'text',
                language,
                voice: plan.voice ? canonicalTtsVoice(plan.voice) : undefined,
                tone: plan.style ? canonicalTtsTone(plan.style) : undefined
              });
              addAssistantMessage(plan.reply, plan.quickReplies);
              return;
            }

            setToolDraft({
              tool: action.tool,
              stage: 'voice',
              text: action.prompt,
              language,
              voice: plan.voice ? canonicalTtsVoice(plan.voice) : undefined,
              tone: plan.style ? canonicalTtsTone(plan.style) : undefined
            });
            addAssistantMessage(
              localizedText(language, 'متن آماده است. صدای واقعی موردنظرت را انتخاب کن.', 'Your text is ready. Choose the exact voice you want.'),
              SAVI_TTS_VOICES.map((voice) => `${voice.name} — ${voice.feel}`)
            );
            return;
          }

          if (['image_studio', 'video_studio', 'file_studio'].includes(action.tool)) {
            pendingUploadActionRef.current = action;
          }
          addAssistantMessage(plan.reply, plan.quickReplies);
          return;
        }
      } catch {
        const attachmentAction = inferActionWithAttachments(clean, contextualAttachments);
        action = attachmentAction ?? detectAction(clean);
      } finally {
        setRunningActionId(null);
      }
    }

    if (action.agentToolId === 'image_video') {
      const references = action.attachments?.filter((item) => item.kind === 'image' || item.kind === 'video') ?? [];
      if (references.length) {
        beginGuidedImageVideo(action);
        return;
      }
    }

    if (action.tool === 'smart_chat') {
      await runFreeChat(clean, conversationHistory());
      return;
    }

    if (action.tool === 'voice_tts') {
      const text = extractQuotedOrLongText(action.prompt) || extractQuotedOrLongText(clean);
      if (!text) {
        const language = action.language || userLanguage(clean);
        setToolDraft({ tool: 'voice_tts', stage: 'text', language });
        addAssistantMessage(
          localizedText(
            language,
            'حتماً. متن دقیقی که می‌خواهی به صدا تبدیل شود را بفرست؛ بعد صدای گوینده، لحن و سرعت را می‌پرسم.',
            'Sure. Send me the exact text you want to turn into voice. After that I will ask for voice, tone, and speed.'
          )
        );
        return;
      }
      const language = action.language || userLanguage(clean);
      setToolDraft({ tool: 'voice_tts', stage: 'voice', text, language });
      addAssistantMessage(
        localizedText(language, 'متن را گرفتم. صدای واقعی موردنظرت را انتخاب کن.', 'Got the text. Choose the exact voice you want.'),
        SAVI_TTS_VOICES.map((voice) => `${voice.name} — ${voice.feel}`)
      );
      return;
    }

    if (action.tool === 'radio_talk') {
      const topic = action.prompt.length > 16 ? action.prompt : clean.length > 16 ? clean : '';
      if (!topic) {
        const language = action.language || userLanguage(clean);
        setToolDraft({ tool: 'radio_talk', stage: 'text', language });
        addAssistantMessage(
          localizedText(
            language,
            'موضوع یا متن کوتاه برنامه رادیویی را بفرست؛ بعد سبک مجری را انتخاب می‌کنیم.',
            'Give me the topic or notes for the radio segment. Then I will ask for the host style.'
          ),
          language === 'fa'
            ? ['سبک پادکست تکنولوژی', 'سبک خبر آرام', 'مجری رادیویی گرم']
            : ['Tech podcast style', 'Calm news style', 'Warm radio host']
        );
        return;
      }
      const language = action.language || userLanguage(clean);
      setToolDraft({ tool: 'radio_talk', stage: 'settings', text: topic, language });
      addAssistantMessage(
        localizedText(language, 'قبل از ساخت پادکست، سبک رادیو را انتخاب کن.', 'Choose the radio style before I generate the podcast audio.'),
        language === 'fa'
          ? ['مجری رادیویی گرم', 'گوینده خبر', 'پادکست تکنولوژی پرانرژی']
          : ['Warm radio host', 'News anchor', 'Energetic tech podcast']
      );
      return;
    }

    if (!action.canRunInChat) {
      if (action.tool === 'file_studio') {
        pendingUploadActionRef.current = action;
        if (action.toolId === 'organize_pdf') {
          const pdf = recentAttachmentsRef.current.pdf[0];
          if (pdf) {
            const swapPages = action.swapPages || parseSwapPages(clean);
            if (!swapPages) {
              addAssistantMessage(
                localizedText(
                  action.language || userLanguage(clean),
                  `فایل ${pdf.name} را دارم. برای مرتب‌سازی هیچ credit کم نمی‌کنم تا دقیق بگویی چه ترتیبی می‌خواهی؛ مثلا: «صفحه ۱ و ۲ را جابه‌جا کن».`,
                  `I still have ${pdf.name}. I will not use credits until you confirm the exact order. Tell me the page order, for example: "swap page 1 and page 2".`
                )
              );
              return;
            }

            addPendingAction({
              ...action,
              id: makeId(),
              canRunInChat: true,
              reason: localizedText(
                action.language || userLanguage(clean),
                `فایل ${pdf.name} آماده است. صفحه ${swapPages[0]} و ${swapPages[1]} را جابه‌جا می‌کنم و PDF جدید می‌دهم.`,
                `${pdf.name} is ready. I will swap page ${swapPages[0]} and ${swapPages[1]} and return a new PDF.`
              ),
              swapPages,
              followUpVoice: action.followUpVoice || wantsPdfVoice(clean),
              attachments: [pdf],
              attachmentIds: [pdf.id]
            });
            return;
          }
        }

        addAssistantMessage(
          localizedText(
            action.language || userLanguage(clean),
            action.toolId === 'translate_summary'
              ? 'PDF را با دکمه + بفرست. بعد از آپلود، همان فایل را به فارسی ترجمه می‌کنم و تا جای ممکن قالب و ترتیب متن را نگه می‌دارم.'
              : wantsPdfVoice(clean)
              ? 'PDF را با دکمه + بفرست. اول صفحه‌ها را مرتب می‌کنم؛ بعد می‌توانیم همان خروجی را به صدای رادیویی یا TTS تبدیل کنیم.'
              : 'PDF را با دکمه + بفرست و دقیق بگو چه کاری می‌خواهی انجام بدهم.',
            action.toolId === 'translate_summary'
              ? 'Upload the PDF with the + button. After upload, I will translate that file into Persian and preserve the structure as much as possible.'
              : wantsPdfVoice(clean)
              ? 'Upload the PDF with the + button. I will organize the pages first; then we can turn the result into radio audio or TTS.'
              : 'Upload the PDF with the + button, then tell me what you want done with it. I can return the result here in chat.'
          )
        );
        return;
      }

      if (action.tool === 'image_studio') {
        addAssistantMessage('Upload the image with the + button, then describe the change. I can edit it and return the output here in chat.');
        return;
      }

      if (action.tool === 'video_studio') {
        addAssistantMessage('Upload up to 3 image or video references with the + button, then describe the clip you want. I will show the credit cost before generation.');
        return;
      }

      addAssistantMessage(`${action.title} is opening now. Upload your file or image there, adjust the settings, and generate from the tool window.`);
      if (action.mode === 'Images') {
        onOpenTool('Images', {
          id: 'image-edit',
          title: 'Edit image',
          description: 'Upload an image and describe the change you want.',
          inputType: 'Image',
          category: 'Images',
          prompt: action.prompt
        });
      } else {
        onOpenTool(action.mode);
      }
      return;
    }

    addPendingAction(action);
    } finally {
      submitInFlightRef.current = false;
    }
  }

  function addAssistantMessage(content: string, quickReplies?: string[]) {
    setMessages((current) => [
      ...current,
      {
        id: makeId(),
        role: 'assistant' as const,
        content,
        quickReplies,
        createdAt: Date.now()
      }
    ].slice(-MAX_MEMORY_MESSAGES));
  }

  function serverToolForAction(action: PendingAction) {
    if (action.tool === 'voice_tts') return 'text_to_speech';
    if (action.tool === 'radio_talk') return 'radio_talk';
    if (action.tool === 'image_text') return action.agentToolId || 'text_to_image';
    if (action.tool === 'image_studio' || action.tool === 'video_studio' || action.tool === 'file_studio') return action.toolId;
    return undefined;
  }

  async function withAuthoritativeQuote(action: PendingAction) {
    const serverToolId = serverToolForAction(action);
    if (!serverToolId || !user) return { ...action, cost: undefined };

    const actionFiles = getActionAttachments(action);
    const referenceImageCount = actionFiles.filter((item) => item.kind === 'image' || item.kind === 'video').length;
    const params = new URLSearchParams({
      toolId: serverToolId,
      referenceImageCount: String(referenceImageCount),
      quality: action.quality || '1080',
      aspectRatio: action.aspectRatio || '1:1',
      duration: action.duration || '6',
    textCharacters: String(Math.max(1, (action.tool === 'voice_tts' || action.tool === 'radio_talk' ? voiceScriptForAction(action) : action.prompt).length)),
      pageCount: '1'
    });

    try {
      const aiPdfTool = action.tool === 'file_studio' && ['contract_summary', 'explain_document', 'translate_summary', 'pdf_podcast'].includes(serverToolId);
      const pdf = aiPdfTool ? actionFiles.find((item) => item.kind === 'pdf') : undefined;
      const response = pdf
        ? await (() => {
            const form = new FormData();
            form.append('toolId', serverToolId);
            form.append('file', pdf.file);
            return fetch('/api/pricing/quote', { method: 'POST', body: form, cache: 'no-store', credentials: 'same-origin' });
          })()
        : await fetch(`/api/pricing/quote?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
      const quote = (await response.json().catch(() => ({}))) as { credits?: unknown };
      if (!response.ok || typeof quote.credits !== 'number') throw new Error('quote unavailable');
      return { ...action, cost: quote.credits };
    } catch {
      // The protected server route will refuse an unpriced configuration before
      // it can reserve credits, so an unavailable quote never becomes a charge.
      return { ...action, cost: undefined };
    }
  }

  function pendingActionCopy(action: PendingAction) {
    const language = action.language || userLanguage(action.prompt);
    const quoteCopy = typeof action.cost === 'number'
      ? localizedText(language, `هزینه: ${action.cost} credits. تایید کن تا انجامش بدهم.`, `Cost: ${action.cost} credits. Confirm when you want me to generate it.`)
      : localizedText(language, 'قیمت فعلی هنوز آماده نیست؛ قبل از ساخت، quote امن را دوباره می‌گیرم.', 'The current quote is unavailable. I will refresh the secure quote before generating.');

    return action.canRunInChat
      ? `${action.intro || localizedText(language, `${action.title} آماده است.`, `${action.title} is ready.`)} ${quoteCopy}`
      : localizedText(
          language,
          `${action.title} ابزار درست این کار است. ${typeof action.cost === 'number' ? `هزینه: ${action.cost} credits.` : 'قیمت هنگام باز کردن ابزار به‌صورت امن نمایش داده می‌شود.'} ${action.reason}`,
          `${action.title} is the right tool. ${typeof action.cost === 'number' ? `Cost: ${action.cost} credits.` : 'The current price will be shown securely when the tool opens.'} ${action.reason}`
        );
  }

  async function refreshPendingActionQuote(messageId: string, action: PendingAction) {
    const pricedAction = await withAuthoritativeQuote(action);
    setMessages((current) => updateMessage(current, messageId, {
      content: pendingActionCopy(pricedAction),
      pendingAction: pricedAction
    }));
  }

  async function addPendingAction(action: PendingAction) {
    const pricedAction = await withAuthoritativeQuote(action);

    if (typeof pricedAction.cost === 'number' && credits !== null && credits < pricedAction.cost) {
      const shortfall = pricedAction.cost - credits;
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: 'assistant' as const,
          content: localizedText(
            pricedAction.language || userLanguage(pricedAction.prompt),
            `برای این کار ${pricedAction.cost} اعتبار لازم است. موجودی فعلی ${credits} اعتبار است و ${shortfall} اعتبار کم داری. برای ادامه به Credits برو.`,
            `This needs ${pricedAction.cost} credits. Your current balance is ${credits}, so you need ${shortfall} more. Open Credits to continue.`
          ),
          createdAt: Date.now()
        }
      ].slice(-MAX_MEMORY_MESSAGES));
      return;
    }

    const { attachments: actionFiles, ...safeAction } = pricedAction;
    if (actionFiles?.length) {
      actionAttachmentStoreRef.current[action.id] = actionFiles;
      rememberActionAttachments(actionFiles);
    }
    setMessages((current) => [
      ...current,
      {
        id: makeId(),
        role: 'assistant' as const,
        content: pendingActionCopy(pricedAction),
        createdAt: Date.now(),
        pendingAction: safeAction
      }
    ].slice(-MAX_MEMORY_MESSAGES));
  }

  function handleDraftReply(clean: string) {
    if (!toolDraft) return;

    if (toolDraft.stage === 'text') {
      const language = toolDraft.language || userLanguage(clean);
      setToolDraft({ ...toolDraft, stage: 'voice', text: clean });
      addAssistantMessage(
        localizedText(
          language,
          'عالی. حالا صدای واقعی موردنظرت را انتخاب کن.',
          'Great. Choose the exact voice you want.'
        ),
        SAVI_TTS_VOICES.map((voice) => `${voice.name} — ${voice.feel}`)
      );
      return;
    }

    if (toolDraft.stage === 'voice') {
      const language = toolDraft.language || userLanguage(clean);
      const voice = canonicalTtsVoice(clean);
      setToolDraft({ ...toolDraft, stage: 'settings', voice });
      addAssistantMessage(
        localizedText(language, 'حالا لحن را انتخاب کن.', 'Now choose the tone.'),
        SAVI_TTS_TONES.map((tone) => tone.label)
      );
      return;
    }

    const tone = canonicalTtsTone(clean);
    const title = toolDraft.tool === 'radio_talk' ? 'Radio Talk AI' : 'Text to Speech';
    const prompt = toolDraft.text || clean;
    const language = toolDraft.language || userLanguage(prompt);

    setToolDraft(undefined);
    addPendingAction({
      id: makeId(),
      tool: toolDraft.tool,
      title,
      mode: 'Voice',
      prompt,
      reason: `Voice: ${toolDraft.voice || canonicalTtsVoice(undefined)}. Style: ${ttsStyle(tone)}.`,
      canRunInChat: true,
      language,
      voice: toolDraft.voice || canonicalTtsVoice(undefined),
      style: ttsStyle(tone),
      radioSource: toolDraft.tool === 'radio_talk' ? 'topic' : undefined
    });
  }

  async function runFreeChat(message: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []) {
    const assistantId = makeId();
    setRunningActionId(assistantId);
    setMessages((current) => [
      ...current,
      {
        id: assistantId,
        role: 'assistant' as const,
        content: 'Thinking...',
        createdAt: Date.now(),
        status: 'running' as const
      }
    ].slice(-MAX_MEMORY_MESSAGES));

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, mode: 'Ask AI', history, clientRequestId: createSaviClientRequestId() })
      });
      const data = (await response.json().catch(() => ({}))) as { response?: string; error?: string };
      if (!response.ok || !data.response) throw new Error(data.error || 'SAVI could not answer.');

      setMessages((current) =>
        updateMessage(current, assistantId, {
          status: 'idle',
          content: data.response,
          result: undefined
        })
      );
    } catch (error) {
      setMessages((current) =>
        updateMessage(current, assistantId, {
          status: 'error',
          content: error instanceof Error ? error.message : 'SAVI could not answer.'
        })
      );
    } finally {
      setRunningActionId(null);
    }
  }

  function getActionAttachments(action: PendingAction) {
    const stored = actionAttachmentStoreRef.current[action.id];
    if (stored?.length) return stored;
    if (action.attachments?.length) return action.attachments;
    if (!action.attachmentIds?.length) return [];
    return action.attachmentIds
      .map((id) => attachments.find((item) => item.id === id))
      .filter((item): item is ChatAttachment => Boolean(item));
  }

  async function executeAction(messageId: string, action: PendingAction) {
    if (runningActionId) return;

    if (action.toolId === 'extract_images' && !SAVI_EXTRACT_IMAGES_AVAILABLE) {
      setMessages((current) => updateMessage(current, messageId, {
        pendingAction: undefined,
        content: extractImagesUnavailableMessage(action.language || 'en')
      }));
      return;
    }

    if (!action.canRunInChat) {
      onOpenTool(action.mode);
      setMessages((current) =>
        updateMessage(current, messageId, {
          pendingAction: undefined,
          content: `${action.title} is open in its own tab. Uploads, settings, preview, and outputs stay there.`
        })
      );
      return;
    }

    if (isAuthLoading) return;
    if (!user) {
      signIn();
      return;
    }

    if (serverToolForAction(action) && typeof action.cost !== 'number') {
      await refreshPendingActionQuote(messageId, action);
      return;
    }

    setRunningActionId(action.id);
    setMessages((current) =>
      updateMessage(current, messageId, {
        pendingAction: undefined,
        status: 'running',
        content: `Creating ${action.title}...`
      })
    );

    let awaitingExistingJob = false;
    try {
      let result: ChatResult;
      const actionAttachments = getActionAttachments(action);
      // Keep a retry tied to this exact confirmed action. The browser only stores
      // its opaque request id; the server remains the credit and job authority.
      const paidRequestScope = createSaviRequestScope('ask-action', [
        action.id,
        action.tool,
        action.toolId,
        action.agentToolId,
        action.prompt,
        action.aspectRatio,
        action.quality,
        action.duration,
        action.voice,
        action.style,
        actionAttachments.map((item) => `${item.id}:${item.name}:${item.mimeType}:${item.size}`).join('|')
      ]);
      const paidRequestId = () => createSaviClientRequestId(paidRequestScope);
      const inspectPaidResponse = (response: Response) => {
        if (response.status === 202) {
          awaitingExistingJob = true;
          return true;
        }
        clearSaviClientRequestId(paidRequestScope);
        return false;
      };
      const processingMessage = localizedText(
        action.language || userLanguage(action.prompt),
        'این درخواست هنوز در حال پردازش است. چند لحظه دیگر دوباره اجرا را بزن؛ همان درخواست امن دوباره استفاده می‌شود و دوباره شارژ نمی‌شوی.',
        'This request is still processing. Try it again in a moment; SAVI will safely reuse the same request without charging twice.'
      );
      let availableCredits: unknown;
      const captureBalance = (payload: { availableCredits?: unknown }) => {
        availableCredits = payload.availableCredits;
      };

      if (action.tool === 'file_studio' && action.toolId) {
        const pdfAttachments = actionAttachments.filter((item) => item.kind === 'pdf');
        const pdf = pdfAttachments[0];
        if (!pdf) throw new Error('Upload a PDF first.');

        if (['merge_pdf', 'pdf_to_jpg', 'extract_images'].includes(action.toolId)) {
          const formData = new FormData();
          formData.append('action', action.toolId);
          formData.append('clientRequestId', paidRequestId());
          pdfAttachments.forEach((item) => formData.append('files', item.file));
          if (action.toolId === 'pdf_to_jpg') formData.append('pages', 'all');
          const response = await fetch('/api/file-tools/process', { method: 'POST', body: formData });
          if (inspectPaidResponse(response)) throw new Error(processingMessage);
          const data = (await response.json().catch(() => ({}))) as { asset?: string; filename?: string; availableCredits?: number; error?: string };
          if (!response.ok || !data.asset) {
            throw new Error(data.error || 'PDF processing failed.');
          }
          const fileNames: Record<string, string> = {
            merge_pdf: 'merged.pdf',
            pdf_to_jpg: `${pdf.name.replace(/\.pdf$/i, '')}-jpg-pages.zip`,
            extract_images: `${pdf.name.replace(/\.pdf$/i, '')}-images.zip`
          };
          captureBalance(data);
          result = {
            type: 'file',
            url: data.asset,
            filename: data.filename || fileNames[action.toolId] || 'file-output.zip',
            helper: localizedText(action.language || userLanguage(action.prompt), 'فایل آماده دانلود است.', 'Your file is ready to download.')
          };
        } else if (action.toolId === 'organize_pdf') {
          const swapPages = action.swapPages || parseSwapPages(action.prompt);
          if (!swapPages) {
            throw new Error(localizedText(action.language || userLanguage(action.prompt), 'بگو دقیقاً کدام صفحه‌ها باید جابه‌جا شوند.', 'Tell me exactly which pages should be moved or swapped.'));
          }

          const formData = new FormData();
          formData.append('action', 'organize_pdf');
          formData.append('files', pdf.file);
          formData.append('swapPages', JSON.stringify(swapPages));
          formData.append('clientRequestId', paidRequestId());
          const response = await fetch('/api/file-tools/process', {
            method: 'POST',
            body: formData
          });
          if (inspectPaidResponse(response)) throw new Error(processingMessage);
          const data = (await response.json().catch(() => ({}))) as { asset?: string; filename?: string; availableCredits?: number; error?: string };
          if (!response.ok || !data.asset) {
            throw new Error(data.error || 'PDF organization failed.');
          }
          captureBalance(data);
          result = {
            type: 'file',
            url: data.asset,
            filename: data.filename || `${pdf.name.replace(/\.pdf$/i, '')}-organized.pdf`,
            helper: localizedText(
              action.language || userLanguage(action.prompt),
              action.followUpVoice ? 'PDF مرتب‌شده آماده است. حالا اگر تایید کنی، می‌توانم متن همین PDF را به پادکست رادیویی یا TTS تبدیل کنم.' : 'PDF مرتب‌شده آماده است.',
              action.followUpVoice ? 'Organized PDF ready. If you confirm next, I can turn this PDF into radio audio or TTS.' : 'Organized PDF ready.'
            )
          };
        } else {
          const formData = new FormData();
          formData.append('file', pdf.file);
          formData.append('toolId', action.toolId);
          formData.append('prompt', action.prompt);
          formData.append('clientRequestId', paidRequestId());
          const response = await fetch('/api/file-tools/ai', {
            method: 'POST',
            body: formData
          });
          if (inspectPaidResponse(response)) throw new Error(processingMessage);
          const data = (await response.json().catch(() => ({}))) as { result?: string; asset?: string; filename?: string; availableCredits?: number; error?: string };
          if (!response.ok || (!data.result && !data.asset)) throw new Error(data.error || 'PDF processing failed.');
          const documentText = data.result || await readPrivateTextAsset(data.asset);
          if (!documentText) throw new Error('SAVI could not load the document result.');
          captureBalance(data);
          result = {
            type: 'text',
            text: documentText,
            url: data.asset,
            filename: data.filename || `${action.toolId}-result.txt`,
            helper: localizedText(action.language || userLanguage(action.prompt), 'نتیجه سند آماده است.', 'Document result ready.')
          };
        }
      } else if (action.tool === 'image_studio' && action.toolId) {
        const imageAttachments = actionAttachments.filter((item) => item.kind === 'image').slice(0, action.toolId === 'mockup' ? 2 : 3);
        if (!imageAttachments.length) throw new Error('Upload an image first.');
        const response = await fetch('/api/image/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: action.prompt,
            toolId: action.toolId,
            aspectRatio: action.aspectRatio || '1:1',
            quality: action.quality || '1080',
            style: 'Premium realistic edit, preserve original image where requested',
            clientRequestId: paidRequestId(),
            referenceImages: imageAttachments.map((item) => ({
              data: item.base64,
              mimeType: item.mimeType,
              name: item.name
            }))
          })
        });
        if (inspectPaidResponse(response)) throw new Error(processingMessage);
        const data = (await response.json().catch(() => ({}))) as { image?: string; filename?: string; availableCredits?: number; error?: string };
        if (!response.ok || !data.image) throw new Error(data.error || 'Image editing failed.');
        captureBalance(data);
        result = {
          type: 'image',
          url: data.image,
          filename: data.filename || 'edited-image.png',
          helper: 'Image output ready.'
        };
      } else if (action.tool === 'video_studio' && action.toolId) {
        const references = actionAttachments.filter((item) => item.kind === 'image' || item.kind === 'video').slice(0, 3);
        const response = await fetch('/api/video/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: action.prompt,
            toolId: action.toolId,
            ratio: action.aspectRatio === '16:9' ? '16:9' : '9:16',
            duration: action.duration || '6',
            quality: '720',
            withAudio: true,
            clientRequestId: paidRequestId(),
            references: references.map((item) => ({
              data: item.base64,
              mimeType: item.mimeType,
              name: item.name
            }))
          })
        });
        if (inspectPaidResponse(response)) throw new Error(processingMessage);
        const data = (await response.json().catch(() => ({}))) as { video?: string; filename?: string; availableCredits?: number; error?: string };
        if (!response.ok || !data.video) throw new Error(data.error || 'Video generation failed.');
        captureBalance(data);
        result = {
          type: 'video',
          url: data.video,
          filename: data.filename || 'generated-video.mp4',
          helper: 'Video ready.'
        };
      } else if (action.tool === 'image_text') {
        const isTextOutput = action.agentToolId === 'instagram_post' || action.agentToolId === 'product_prompt';
        const imageAttachment = actionAttachments.find((item) => item.kind === 'image');
        const response = await fetch(isTextOutput ? '/api/text/generate' : '/api/image/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isTextOutput
              ? {
                  prompt: action.prompt,
                  toolId: action.agentToolId,
                  clientRequestId: paidRequestId(),
                  referenceImage: imageAttachment
                    ? { data: imageAttachment.base64, mimeType: imageAttachment.mimeType, name: imageAttachment.name }
                    : undefined
                }
              : {
                  prompt: action.prompt,
                  toolId: action.agentToolId || 'text_to_image',
                  aspectRatio: action.aspectRatio || '1:1',
                  quality: action.quality || '1080',
                  style: 'Realistic premium image',
                  clientRequestId: paidRequestId()
                }
          )
        });
        if (inspectPaidResponse(response)) throw new Error(processingMessage);
        const data = (await response.json().catch(() => ({}))) as { image?: string; result?: string; asset?: string; filename?: string; availableCredits?: number; error?: string };
        if (!response.ok || (isTextOutput ? (!data.result && !data.asset) : !data.image)) throw new Error(data.error || 'Image generation failed.');
        captureBalance(data);
        result = isTextOutput
          ? {
              type: 'text',
              text: data.result || await readPrivateTextAsset(data.asset),
              url: data.asset,
              filename: data.filename || `${action.agentToolId}-result.txt`,
              helper: 'Text output ready.'
            }
          : {
              type: 'image',
              url: data.image,
              filename: data.filename || 'generated-image.png',
              helper: 'Image ready.'
            };
      } else if (action.tool === 'voice_tts') {
        const response = await fetch('/api/voice/radio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolId: 'text_to_speech',
            clientRequestId: paidRequestId(),
            script: action.prompt,
            voice: action.voice || 'Kore',
            style: action.style || 'natural text to speech, exact wording, warm clear delivery'
          })
        });
        if (inspectPaidResponse(response)) throw new Error(processingMessage);
        const data = (await response.json().catch(() => ({}))) as { audio?: string; filename?: string; availableCredits?: number; error?: string };
        if (!response.ok || !data.audio) throw new Error(data.error || 'Voice generation failed.');
        captureBalance(data);
        result = {
          type: 'audio',
          text: action.prompt,
          url: data.audio,
          filename: data.filename || 'text-to-speech.wav',
          helper: 'Audio ready.'
        };
      } else if (action.tool === 'radio_talk') {
        const script = voiceScriptForAction(action);
        if (!script) throw new Error('Write a topic or script first.');

        const audioResponse = await fetch('/api/voice/radio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolId: 'radio_talk',
            clientRequestId: paidRequestId(),
            script,
            voice: action.voice || 'Puck',
            style: action.style || 'warm energetic radio host, natural delivery'
          })
        });
        if (inspectPaidResponse(audioResponse)) throw new Error(processingMessage);
        const audioData = (await audioResponse.json().catch(() => ({}))) as { audio?: string; filename?: string; availableCredits?: number; error?: string };
        if (!audioResponse.ok || !audioData.audio) throw new Error(audioData.error || 'Radio audio generation failed.');
        captureBalance(audioData);
        result = {
          type: 'audio',
          text: script,
          url: audioData.audio,
          filename: audioData.filename || 'radio-talk.wav',
          helper: 'Radio podcast ready.'
        };
      } else {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: action.prompt,
            mode: action.mode,
            templateId: action.tool,
            clientRequestId: createSaviClientRequestId()
          })
        });
        const data = (await response.json().catch(() => ({}))) as { response?: string; error?: string };
        if (!response.ok || !data.response) throw new Error(data.error || 'SAVI could not generate a response.');
        result = {
          type: 'text',
          text: data.response,
          filename: `${action.tool}-result.txt`,
          helper: 'Output ready.'
        };
      }

      const completed: Partial<ChatMessage> = {
        status: 'idle',
        content: localizedText(action.language || userLanguage(action.prompt), `${action.title} انجام شد. ${result.helper || ''}`, `${action.title} complete. ${result.helper || ''}`),
        result
      };
      recordMediaItem({
        type: result.type === 'audio' ? 'audio' : result.type === 'image' ? 'image' : result.type === 'video' ? 'video' : result.type === 'file' ? 'pdf' : 'text',
        title: action.title,
        source: 'Ask SAVI',
        url: result.url,
        filename: result.filename,
        text: result.text
      });
      setMessages((current) => updateMessage(current, messageId, completed));
      setSavedOutputs((current) => [
        { id: messageId, role: 'assistant', createdAt: Date.now(), content: completed.content || '', result } as ChatMessage,
        ...current
      ].slice(0, 10));
      applyAuthoritativeBalance(availableCredits, onCreditsChange);

      if (action.tool === 'file_studio' && action.toolId === 'pdf_podcast' && result.text) {
        const language = action.language || userLanguage(action.prompt);
        addPendingAction({
          id: makeId(),
          tool: 'radio_talk',
          title: 'Radio Talk AI',
          mode: 'Voice',
          prompt: result.text,
          reason: localizedText(language, 'اسکریپت پادکست آماده است. می‌توانم آن را با صدای رادیویی بسازم.', 'The podcast script is ready. I can turn it into radio audio.'),
          intro: localizedText(language, 'اگر صدا هم می‌خواهی، آماده‌ام نسخه‌ی رادیویی را بسازم.', 'If you want audio too, I can create the radio version next.'),
          canRunInChat: true,
          language,
          voice: 'Puck',
          style: 'warm professional radio host, natural delivery',
          radioSource: 'script'
        });
      }
    } catch (error) {
      setMessages((current) =>
        updateMessage(current, messageId, {
          status: 'error',
          content: error instanceof Error ? error.message : 'SAVI could not finish this action.',
          pendingAction: awaitingExistingJob ? action : undefined
        })
      );
    } finally {
      delete actionAttachmentStoreRef.current[action.id];
      setRunningActionId(null);
    }
  }

  function clearChat() {
    setMessages([]);
    setSavedOutputs([]);
    setToolDraft(undefined);
    setAttachments([]);
    setUploadError('');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
      window.localStorage.removeItem(OUTPUT_STORAGE_KEY);
    }
  }

  async function handleFiles(files: FileList | null) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setUploadError('');

    const availableSlots = Math.max(0, MAX_CHAT_ATTACHMENTS - attachments.length);
    if (!availableSlots) {
      setUploadError(`You can attach up to ${MAX_CHAT_ATTACHMENTS} files at once.`);
      return;
    }

    const validFiles = selected.slice(0, availableSlots).filter((file) => {
      const kind = getAttachmentKind(file);
      return kind !== 'file' && file.size <= MAX_CHAT_ATTACHMENT_SIZE;
    });

    if (!validFiles.length) {
      setUploadError('Upload images, PDFs, audio, or video files under 25MB.');
      return;
    }

    try {
      const nextAttachments = await Promise.all(
        validFiles.map(async (file) => {
          const kind = getAttachmentKind(file);
          const base64 = await readFileAsBase64(file);
          return {
            id: makeId(),
            name: file.name,
            mimeType: file.type || (kind === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
            size: file.size,
            kind,
            file,
            base64,
            previewUrl: kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : undefined
          };
        })
      );
      setAttachments((current) => [...current, ...nextAttachments]);
      rememberActionAttachments(nextAttachments);
      continuePendingUploadAction(nextAttachments);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'File upload failed.');
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const item = current.find((attachment) => attachment.id === id);
      revokeOwnedObjectUrl(item?.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  function handleQuickReply(reply: string, pendingAction?: PendingAction) {
    const uploadAction = pendingAction ?? pendingUploadActionRef.current;
    if (uploadAction?.requiredInput && uploadAction.requiredInput !== 'none' && isUploadQuickReply(reply)) {
      pendingUploadActionRef.current = uploadAction;
      fileInputRef.current?.click();
      return;
    }
    void submitText(reply);
  }

  function changePendingAction(messageId: string, action: PendingAction) {
    if (action.agentToolId === 'image_video') {
      setMessages((current) => updateMessage(current, messageId, { pendingAction: undefined }));
      beginGuidedImageVideo(action);
      return;
    }
    if (action.tool === 'voice_tts') {
      setMessages((current) => updateMessage(current, messageId, { pendingAction: undefined }));
      setToolDraft({
        tool: 'voice_tts',
        stage: 'voice',
        text: action.prompt,
        language: action.language,
        voice: canonicalTtsVoice(action.voice),
        tone: canonicalTtsTone(action.style)
      });
      addAssistantMessage(
        localizedText(action.language || 'en', 'صدای واقعی موردنظرت را انتخاب کن.', 'Choose the exact voice you want.'),
        SAVI_TTS_VOICES.map((voice) => `${voice.name} — ${voice.feel}`)
      );
    }
  }

  return (
    <section className="relative min-h-[calc(100vh-64px)] overflow-hidden bg-transparent lg:min-h-screen">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-violet-500/[0.055] to-transparent" />

      <div ref={scrollerRef} className="h-[calc(100vh-64px)] overflow-y-auto px-3 pb-40 pt-14 md:px-8 lg:h-screen lg:pb-44 lg:pt-16">
        <div className={`mx-auto flex min-h-full max-w-6xl flex-col gap-8 ${isFreshWorkspace ? 'justify-center' : 'justify-end py-8'}`}>
          {visibleMessages.map((message) => {
            const isWelcome = message.id === 'welcome';
            const isUser = message.role === 'user';
            const isError = message.status === 'error';
            const direction = getTextDirection(message.content);
            const assistantAlign = isWelcome ? 'text-center' : direction === 'rtl' ? 'text-right' : 'text-left';
            const assistantJustify = isWelcome ? 'justify-center' : direction === 'rtl' ? 'justify-end' : 'justify-start';

            return (
              <article key={message.id} className={`flex ${isUser ? 'justify-end' : assistantJustify}`}>
                <div
                  className={
                    isUser
                      ? `max-w-[min(76%,560px)] rounded-[28px] bg-[#1f1f1f] px-5 py-3 text-[15px] leading-7 text-white shadow-[0_16px_45px_rgba(0,0,0,0.18)] ${direction === 'rtl' ? 'text-right' : 'text-left'}`
                      : isError
                        ? `w-full max-w-3xl rounded-[24px] border border-red-300/20 bg-red-500/10 px-5 py-4 ${direction === 'rtl' ? 'text-right' : 'text-left'} text-[15px] leading-7 text-red-100`
                        : `w-full max-w-5xl ${assistantAlign} text-white/82`
                  }
                >
                  {isWelcome ? (
                    <div className="mx-auto max-w-3xl">
                      <p className="savi-eyebrow">SAVI workspace</p>
                      <h1 dir={direction} className="mt-3 text-4xl font-semibold leading-[1.08] text-white md:text-6xl">Ask. Create. Organise.</h1>
                      <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/58">Bring an idea, a question, or a file. SAVI helps shape the next useful output.</p>
                    </div>
                  ) : message.status === 'running' ? null : (
                    <div dir={direction} className="whitespace-pre-wrap text-[15px] leading-8 md:text-[16px]">{message.content}</div>
                  )}

                  {message.attachments?.length ? (
                    <div className={`mt-3 flex flex-wrap gap-2 ${isUser ? 'justify-end' : direction === 'rtl' ? 'justify-end' : 'justify-start'}`}>
                      {message.attachments.map((attachment) => (
                        <AttachmentPill key={attachment.id} attachment={attachment} />
                      ))}
                    </div>
                  ) : null}

                  {isWelcome && (
                    <>
                      <div className="mx-auto mt-7 flex max-w-2xl flex-wrap justify-center gap-2">
                        {([
                          { label: 'Create an image', mode: 'Images' },
                          { label: 'Make a video', mode: 'Video' },
                          { label: 'Work with a PDF', mode: 'Files' },
                          { label: 'Generate voice', mode: 'Voice' }
                        ] as Array<{ label: string; mode: SidebarMode }>).map((item) => (
                          <button
                            key={item.mode}
                            type="button"
                            onClick={() => onOpenTool(item.mode)}
                            className="savi-chip min-h-[40px] px-3 text-sm transition hover:border-violet-300/35 hover:bg-violet-500/[0.1] hover:text-violet-100"
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {message.status === 'running' && (
                    <div className="savi-tool-status savi-tool-status-loading mt-4 inline-flex" role="status" aria-live="polite">
                      SAVI is thinking...
                    </div>
                  )}

                  {message.quickReplies && (
                    <div dir={direction} className={`mt-5 flex flex-wrap gap-2 ${direction === 'rtl' ? 'justify-end' : 'justify-start'}`}>
                      {message.quickReplies.map((reply) => (
                        <button
                          key={reply}
                          type="button"
                          onClick={() => handleQuickReply(reply, message.pendingAction)}
                          className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-semibold text-white/66 hover:bg-white/14 hover:text-white"
                        >
                          {reply}
                        </button>
                      ))}
                    </div>
                  )}

                  {!isUser && !isWelcome && !isError && (
                    <div dir={direction} className={`mt-4 flex items-center gap-1 text-white/42 ${direction === 'rtl' ? 'justify-end' : 'justify-start'}`}>
                      <button type="button" onClick={() => navigator.clipboard?.writeText(message.content)} className="min-h-[44px] rounded-lg px-3 py-1 text-xs hover:bg-white/8 hover:text-white">Copy</button>
                    </div>
                  )}

                  {message.pendingAction && (
                    <div className="mx-auto mt-5 max-w-xl rounded-[22px] border border-white/10 bg-white/[0.055] p-4 text-left">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{message.pendingAction.title}</p>
                          <p className="mt-1 text-xs leading-5 text-white/48">{message.pendingAction.reason}</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black">
                          {typeof message.pendingAction.cost === 'number' ? `${message.pendingAction.cost} credits` : 'Quote required'}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={Boolean(runningActionId)}
                          onClick={() => executeAction(message.id, message.pendingAction as PendingAction)}
                          className="min-h-[44px] rounded-lg bg-white px-4 py-2 text-xs font-bold text-black hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {message.pendingAction.canRunInChat ? 'Confirm' : 'Open tool'}
                        </button>
                        {(message.pendingAction.tool === 'voice_tts' || message.pendingAction.agentToolId === 'image_video') && (
                          <button
                            type="button"
                            disabled={Boolean(runningActionId)}
                            onClick={() => changePendingAction(message.id, message.pendingAction as PendingAction)}
                            className="min-h-[44px] rounded-lg border border-white/10 bg-white/8 px-4 py-2 text-xs font-semibold text-white/62 hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Change settings
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setMessages((current) => updateMessage(current, message.id, { pendingAction: undefined, content: 'Cancelled. Tell me the next thing you want to do.' }))}
                          className="min-h-[44px] rounded-lg border border-white/10 bg-white/8 px-4 py-2 text-xs font-semibold text-white/62 hover:bg-white/14"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {message.result && <ChatResultView result={message.result} />}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-4 md:px-6 md:pb-6">
        <div className={`mx-auto ${isFreshWorkspace ? 'max-w-3xl' : 'max-w-4xl'}`}>
          {draftTemplate && (
            <div className="mb-2 inline-flex rounded-full border border-violet-300/20 bg-violet-500/16 px-3 py-1.5 text-[11px] font-semibold text-violet-100">
              Template ready: {draftTemplate.title}
            </div>
          )}
          {showQuickMenu && (
            <div className="mb-3 grid gap-2 rounded-[24px] border border-white/10 bg-[#1b1b1b]/90 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:grid-cols-4">
              {[
                { label: 'Gallery', action: 'media', hint: 'Open library' },
                { label: 'Image', action: 'image', hint: 'Upload photo' },
                { label: 'PDF', action: 'pdf', hint: 'Upload document' },
                { label: 'Video', action: 'video', hint: 'Upload reference' }
              ].map((item) => (
                <button
                  key={item.action}
                  type="button"
                  onClick={() => {
                    setShowQuickMenu(false);
                    if (item.action === 'media') onOpenTool('All Media');
                    else fileInputRef.current?.click();
                  }}
                  className="min-h-[44px] rounded-lg border border-white/10 bg-white/[0.07] px-3 py-3 text-left hover:bg-white/[0.12]"
                >
                  <span className="block text-sm font-semibold text-white">{item.label}</span>
                  <span className="mt-1 block text-xs text-white/42">{item.hint}</span>
                </button>
              ))}
            </div>
          )}
          {attachments.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <AttachmentPill key={attachment.id} attachment={attachment} onRemove={() => removeAttachment(attachment.id)} />
              ))}
            </div>
          ) : null}
          {uploadError && <div className="mb-2"><ToolStatus kind="error">{uploadError}</ToolStatus></div>}
          <div className="savi-elevated border-white/12 bg-[rgba(16,18,24,0.97)] px-4 py-3 shadow-[0_18px_52px_rgba(0,0,0,0.34)] transition focus-within:border-violet-300/40 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,0.13),0_18px_52px_rgba(0,0,0,0.34)]">
            <div className="flex items-end gap-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,video/*,audio/*"
                className="hidden"
                aria-hidden="true"
                onChange={(event) => {
                  void handleFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <button type="button" onClick={() => fileInputRef.current?.click()} onContextMenu={(event) => {
                event.preventDefault();
                setShowQuickMenu((current) => !current);
              }} className="savi-icon-button border border-white/10 bg-white/[0.045] text-3xl font-light text-white/72" aria-label="Upload files">
                <span aria-hidden="true" className="relative block h-4 w-4 before:absolute before:left-1/2 before:top-0 before:h-4 before:w-px before:-translate-x-1/2 before:bg-current after:absolute after:left-0 after:top-1/2 after:h-px after:w-4 after:-translate-y-1/2 after:bg-current" />
              </button>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                placeholder="Ask SAVI"
                aria-label="Ask SAVI"
                className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2 text-[16px] leading-6 text-white outline-none placeholder:text-white/42"
              />
              <button type="button" onClick={submit} className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-lg border border-violet-300/25 bg-violet-600 text-lg font-black text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50" disabled={Boolean(runningActionId)} aria-label="Send">
                <span aria-hidden="true" className="block h-3 w-3 rotate-45 border-r-2 border-t-2 border-current" />
              </button>
            </div>
            <div className="mt-1 flex justify-end">
              <span className="text-[10px] font-medium text-white/28">{input.length}/4000</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChatResultView({ result }: { result: ChatResult }) {
  if (result.type === 'text') {
    return (
      <div className="mt-3 rounded-[16px] border border-white/10 bg-black/24 p-3">
        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap text-[13px] leading-6 text-white/72">{result.text}</pre>
      </div>
    );
  }

  if (result.type === 'image') {
    return (
      <div className="mt-3 overflow-hidden rounded-[16px] border border-white/10 bg-black/24 p-2">
        {result.url && <img src={result.url} alt="Generated image" className="savi-output-media rounded-[14px]" />}
        {result.url && (
            <a href={result.url} download={result.filename || 'generated-image.png'} className="mt-2 inline-flex min-h-[44px] items-center rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-black">
            Download image
          </a>
        )}
      </div>
    );
  }

  if (result.type === 'audio') {
    return (
      <div className="mt-3 rounded-[16px] border border-white/10 bg-black/24 p-3">
        {result.url && <audio controls src={result.url} className="w-full" />}
        {result.text && <pre className="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-white/56">{result.text}</pre>}
        <div className="mt-2 flex flex-wrap gap-2">
          {result.url && (
            <a href={result.url} download={result.filename || 'generated-audio.wav'} className="inline-flex min-h-[44px] items-center rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-black">
              Download audio
            </a>
          )}
          {result.text && (
            <button type="button" onClick={() => downloadText('audio-script.txt', result.text || '')} className="min-h-[44px] rounded-lg border border-white/10 bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-white/62">
              Download script
            </button>
          )}
        </div>
      </div>
    );
  }

  if (result.type === 'file') {
    return (
      <div className="mt-3 rounded-[16px] border border-white/10 bg-black/24 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white/82">{result.filename || 'processed-file.pdf'}</p>
            <p className="mt-1 text-xs text-white/42">{result.helper || 'File ready.'}</p>
          </div>
          {result.url && (
            <a href={result.url} download={result.filename || 'processed-file.pdf'} className="inline-flex min-h-[44px] items-center rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-black">
              Download PDF
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-[16px] border border-white/10 bg-black/24 p-3">
      {result.url && <video controls src={result.url} className="savi-output-media rounded-[14px]" />}
      {result.url && (
        <a href={result.url} download={result.filename || 'generated-video.mp4'} className="mt-2 inline-flex min-h-[44px] items-center rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-black">
          Download video
        </a>
      )}
    </div>
  );
}

function AttachmentPill({
  attachment,
  onRemove
}: {
  attachment: ChatAttachmentPreview;
  onRemove?: () => void;
}) {
  const label = attachment.kind === 'pdf' ? 'PDF' : attachment.kind === 'image' ? 'Image' : attachment.kind === 'video' ? 'Video' : attachment.kind === 'audio' ? 'Audio' : 'File';

  return (
    <div className="group flex max-w-[220px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.07] p-1.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.16)]">
      {attachment.kind === 'image' && attachment.previewUrl ? (
        <img src={attachment.previewUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/28 text-[10px] font-black uppercase tracking-[0.12em] text-violet-100">
          {label}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-white/82">{attachment.name}</span>
        <span className="block text-[10px] text-white/38">{formatFileSize(attachment.size)}</span>
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-lg text-xs text-white/40 transition hover:bg-white/10 hover:text-white"
          aria-label={`Remove ${attachment.name}`}
        >
          <span aria-hidden="true" className="relative block h-3.5 w-3.5 before:absolute before:left-1/2 before:top-0 before:h-3.5 before:w-px before:-translate-x-1/2 before:rotate-45 before:bg-current after:absolute after:left-1/2 after:top-0 after:h-3.5 after:w-px after:-translate-x-1/2 after:-rotate-45 after:bg-current" />
        </button>
      )}
    </div>
  );
}

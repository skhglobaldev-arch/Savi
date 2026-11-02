import { imageTools, saviTools, videoTools, type SaviToolDescriptor } from './catalog.ts';
import { createSaviRadioScript, type SaviRadioFormat, type SaviRadioLength } from '../voice/radioScript.ts';
import { SAVI_TTS_TONES } from '../ai/toolAssistant.ts';

export type ToolResultKind = 'image' | 'video' | 'audio' | 'text' | 'document' | 'archive';
export type ToolInput = {
  prompt: string; quality: string; aspectRatio: string; style: string; duration: string;
  withAudio: boolean; voice: string; tone: string; radioFormat: SaviRadioFormat; radioLength: SaviRadioLength; pages: string;
  subject?: string; scene?: string; mixerStyle?: string; preparedScript?: boolean;
};
export type SessionFile = { uri: string; name: string; mimeType: string; size: number; pageCount?: number; role?: string };
export type PagePlan = { pageNumber: number; rotation: number; selected: boolean }[];
export type ToolContract = {
  tool: SaviToolDescriptor; executionId: string; endpoint: string; kind: ToolResultKind;
  minFiles: number; maxFiles: number; mimeTypes: string[]; maxFileBytes: number;
  promptRequired: boolean; maxPromptLength: number; pdf: boolean;
};

export function toolContract(id: string): ToolContract | null {
  const tool = saviTools.find(item => item.id === id);
  if (!tool) return null;
  const base = { tool, executionId: id, endpoint: '/api/image/generate', kind: 'image' as ToolResultKind, minFiles: 0, maxFiles: 1, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'], maxFileBytes: 12 * 1024 * 1024, promptRequired: true, maxPromptLength: 4000, pdf: false };
  if (tool.category === 'Images') {
    const definition = imageTools.find(item => item.id === id)!;
    const text = id === 'instagram_post' || id === 'product_prompt';
    return { ...base, endpoint: text ? '/api/text/generate' : base.endpoint, kind: text ? 'text' : 'image', minFiles: definition.needsImage || id === 'sketch_to_image' || id === 'variations' ? 1 : 0, maxFiles: id === 'mockup' ? 2 : id === 'visual_mixer' ? 6 : 1, promptRequired: id !== 'remove_background' };
  }
  if (tool.category === 'Video') {
    const definition = videoTools.find(item => item.id === id)!;
    return { ...base, endpoint: '/api/video/generate', kind: 'video', minFiles: id === 'first_last' ? 2 : ['image_video', 'extend', 'product_ad', 'social_reel'].includes(id) ? 1 : 0, maxFiles: id === 'story_video' ? 1 : definition.imageSlots, mimeTypes: id === 'extend' || id === 'story_video' ? ['video/mp4', 'video/webm', ...base.mimeTypes] : base.mimeTypes, maxFileBytes: 8 * 1024 * 1024, maxPromptLength: 2400 };
  }
  if (tool.category === 'Voice') return { ...base, endpoint: '/api/voice/radio', executionId: id === 'radio' ? 'radio_talk' : 'text_to_speech', kind: 'audio', maxFiles: 0, maxPromptLength: 12000 };
  const executionId = id === 'merge' ? 'merge_pdf' : id === 'organize' ? 'organize_pdf' : id === 'split' ? 'split_pdf' : id === 'jpg' ? 'pdf_to_jpg' : id;
  const local = ['merge', 'organize', 'split', 'jpg'].includes(id);
  return { ...base, endpoint: local ? '/api/file-tools/process' : '/api/file-tools/ai', executionId, kind: id === 'jpg' ? 'archive' : local ? 'document' : 'text', minFiles: id === 'merge' ? 2 : 1, maxFiles: id === 'merge' ? 12 : 1, mimeTypes: ['application/pdf'], maxFileBytes: 25 * 1024 * 1024, promptRequired: false, maxPromptLength: 4000, pdf: true };
}

export function voiceScript(contract: ToolContract, input: ToolInput) {
  return contract.tool.id === 'radio' && !input.preparedScript ? createSaviRadioScript(input.prompt, input.radioFormat, input.radioLength) : input.prompt.trim();
}

function imagePrompt(contract: ToolContract, input: ToolInput) {
  return contract.tool.id === 'visual_mixer' ? [input.subject && `Subject: ${input.subject}`, input.scene && `Scene: ${input.scene}`, input.mixerStyle && `Style: ${input.mixerStyle}`, input.prompt.trim()].filter(Boolean).join('\n') : input.prompt.trim();
}

export function quoteParameters(contract: ToolContract, input: ToolInput, files: SessionFile[]) {
  return {
    toolId: contract.executionId, quality: input.quality, aspectRatio: input.aspectRatio, duration: input.duration,
    referenceImageCount: String(contract.pdf ? 0 : files.length),
    textCharacters: String(Math.max(1, contract.kind === 'audio' ? voiceScript(contract, input).length : input.prompt.length)),
    pageCount: String(Math.max(1, files.reduce((sum, file) => sum + (file.pageCount || 0), 0))),
  };
}

export function inputIssue(contract: ToolContract, input: ToolInput, files: SessionFile[], pagePlan: PagePlan) {
  if (contract.promptRequired && !imagePrompt(contract, input)) return 'Add your text or prompt first.';
  if (imagePrompt(contract, input).length > contract.maxPromptLength) return `Use up to ${contract.maxPromptLength.toLocaleString()} characters.`;
  if (files.length < contract.minFiles) return `Choose ${contract.minFiles === 1 ? 'a file' : `at least ${contract.minFiles} files`} first.`;
  if (files.length > contract.maxFiles) return `Choose up to ${contract.maxFiles} files.`;
  if (files.some(file => !contract.mimeTypes.includes(file.mimeType) || file.size <= 0 || file.size > contract.maxFileBytes)) return 'One file has an unsupported format or size.';
  if (contract.pdf && files.some(file => !file.pageCount)) return 'Wait for PDF validation to finish.';
  if (contract.pdf && files.reduce((sum, file) => sum + file.size, 0) > 80 * 1024 * 1024) return 'Keep PDF uploads under 80 MB total.';
  if ((contract.tool.id === 'organize' || contract.tool.id === 'split') && !pagePlan.some(page => page.selected)) return 'Choose at least one PDF page.';
  if (contract.kind === 'audio' && voiceScript(contract, input).length > 12000) return 'Shorten the script to 12,000 characters.';
  return null;
}

export function jsonExecutionInput(contract: ToolContract, input: ToolInput, references: { data: string; mimeType: string; name: string }[], clientRequestId: string) {
  const base = { toolId: contract.executionId, clientRequestId };
  if (contract.kind === 'audio') {
    const tone = SAVI_TTS_TONES.find(item => item.id === input.tone)?.label || SAVI_TTS_TONES[0].label;
    return { ...base, script: voiceScript(contract, input), voice: input.voice, style: input.preparedScript ? 'energetic, warm, radio podcast host' : contract.tool.id === 'radio' ? `${tone} ${input.radioFormat} radio show, ${input.radioLength}, polished host delivery` : `${tone} text to speech, exact wording, clear natural delivery` };
  }
  if (contract.kind === 'video') return { ...base, prompt: input.prompt.trim(), ratio: input.aspectRatio, duration: input.duration, quality: '720', withAudio: input.withAudio, references };
  if (contract.kind === 'text') return { ...base, prompt: input.prompt.trim(), referenceImage: references[0] };
  return { ...base, prompt: imagePrompt(contract, input), quality: input.quality, aspectRatio: input.aspectRatio, style: input.style, referenceImages: references };
}

export function quoteCanExecute(quote: number | null, balance: number | null) {
  return quote !== null && Number.isFinite(quote) && quote > 0 && balance !== null && balance >= quote;
}

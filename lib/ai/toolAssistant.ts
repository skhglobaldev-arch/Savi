export const SAVI_TTS_VOICES = [
  { id: 'kore', name: 'Kore', feel: 'Warm female narrator', gender: 'female' },
  { id: 'aoede', name: 'Aoede', feel: 'Smooth storyteller', gender: 'female' },
  { id: 'callirrhoe', name: 'Callirrhoe', feel: 'Clear and elegant', gender: 'female' },
  { id: 'despina', name: 'Despina', feel: 'Precise presenter', gender: 'female' },
  { id: 'puck', name: 'Puck', feel: 'Bright radio host', gender: 'male' },
  { id: 'charon', name: 'Charon', feel: 'Deep news voice', gender: 'male' },
  { id: 'zephyr', name: 'Zephyr', feel: 'Friendly guide', gender: 'male' },
  { id: 'fenrir', name: 'Fenrir', feel: 'Dramatic trailer voice', gender: 'male' }
] as const;

export const SAVI_TTS_TONES = [
  { id: 'natural', label: 'Natural', note: 'Balanced and clean', rate: 1, pitch: 1 },
  { id: 'warm', label: 'Warm', note: 'Soft and friendly', rate: 0.94, pitch: 1.02 },
  { id: 'excited', label: 'Excited', note: 'Upbeat and energetic', rate: 1.08, pitch: 1.08 },
  { id: 'formal', label: 'Formal', note: 'Calm business delivery', rate: 0.92, pitch: 0.96 },
  { id: 'whisper', label: 'Whisper', note: 'Quiet intimate read', rate: 0.82, pitch: 0.9 },
  { id: 'cinematic', label: 'Cinematic', note: 'Trailer style pacing', rate: 0.86, pitch: 0.86 }
] as const;

export const SAVI_IMAGE_VIDEO_OPTIONS = {
  ratios: ['16:9', '9:16'],
  durations: ['4', '6', '8'],
  qualities: ['720']
} as const;

export type SaviTtsVoice = (typeof SAVI_TTS_VOICES)[number]['name'];
export type SaviTtsTone = (typeof SAVI_TTS_TONES)[number]['id'];
export type SaviImageVideoRatio = (typeof SAVI_IMAGE_VIDEO_OPTIONS.ratios)[number];
export type SaviImageVideoDuration = (typeof SAVI_IMAGE_VIDEO_OPTIONS.durations)[number];

export const SAVI_GUIDED_TOOL_CONTRACTS = {
  text_to_speech: {
    requiredInput: 'text',
    defaults: { voice: 'Kore' as SaviTtsVoice, tone: 'natural' as SaviTtsTone },
    confirmationRequired: true,
    pricingToolId: 'text_to_speech'
  },
  image_video: {
    requiredInput: 'image',
    defaults: { ratio: '9:16' as SaviImageVideoRatio, duration: '6' as SaviImageVideoDuration, quality: '720' as const },
    confirmationRequired: true,
    pricingToolId: 'image_video'
  }
} as const;

export function canonicalTtsVoice(value: string | undefined): SaviTtsVoice {
  const normalized = value?.trim().toLowerCase() || '';
  const exact = SAVI_TTS_VOICES.find((voice) => voice.name.toLowerCase() === normalized || voice.id === normalized || normalized.includes(voice.name.toLowerCase()));
  if (exact) return exact.name;
  if (/female|woman|zan|زن|دختر/.test(normalized)) return 'Kore';
  if (/male|man|mard|مرد|پسر/.test(normalized)) return 'Puck';
  return SAVI_GUIDED_TOOL_CONTRACTS.text_to_speech.defaults.voice;
}

export function canonicalTtsTone(value: string | undefined): SaviTtsTone {
  const normalized = value?.toLowerCase() || '';
  if (/formal|رسمی|جدی/.test(normalized)) return 'formal';
  if (/excited|fast|سریع|هیجانی|انرژ/.test(normalized)) return 'excited';
  if (/whisper|نجوا/.test(normalized)) return 'whisper';
  if (/cinematic|سینمایی/.test(normalized)) return 'cinematic';
  if (/warm|calm|slow|آرام|ملایم|گرم/.test(normalized)) return 'warm';
  return 'natural';
}

export function ttsStyle(tone: SaviTtsTone) {
  const selected = SAVI_TTS_TONES.find((item) => item.id === tone) ?? SAVI_TTS_TONES[0];
  return `${selected.label} text to speech, exact wording, clear natural delivery`;
}

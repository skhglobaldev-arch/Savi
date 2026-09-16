import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import {
  estimateSaviVoiceReservationSeconds,
  getConfiguredTtsModel,
  SAVI_TEXT_TO_IMAGE_PROVIDER,
  SAVI_VOICE_TOOL_IDS
} from '@/lib/pricing/saviPricing';
import { runProtectedOperation } from '@/lib/savi/protectedOperations';
import { SaviInfrastructureError } from '@/lib/savi/textToImageInfrastructure';
import { createSaviRateLimitResponse, checkSaviRateLimit } from '@/lib/savi/rateLimit';
import { getSaviRequestIdentity } from '@/lib/savi/requestIdentity';

export const runtime = 'nodejs';

const MAX_SCRIPT_LENGTH = 12_000;
const MAX_STYLE_LENGTH = 800;
const DEFAULT_VOICE = 'Puck';
const ALLOWED_VOICES = new Set(['Kore', 'Aoede', 'Callirrhoe', 'Despina', 'Puck', 'Charon', 'Zephyr', 'Fenrir']);

type VoiceRequest = {
  script?: string;
  voice?: string;
  style?: string;
  toolId?: 'text_to_speech' | 'radio_talk';
  clientRequestId?: string;
};

class VoiceInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'VoiceInputError';
  }
}

function isVoiceTool(toolId: string | undefined) {
  return Boolean(toolId && SAVI_VOICE_TOOL_IDS.includes(toolId as (typeof SAVI_VOICE_TOOL_IDS)[number]));
}

function createWavBuffer(pcm: Buffer, sampleRate = 24_000, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function extractAudioBase64(value: unknown): { data: string; mimeType: string; sampleRate?: number } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.type === 'audio' && typeof record.data === 'string') {
    return {
      data: record.data,
      mimeType: typeof record.mime_type === 'string' ? record.mime_type : 'audio/l16',
      sampleRate: typeof record.sample_rate === 'number' ? record.sample_rate : undefined
    };
  }
  const direct =
    (record.output_audio as { data?: unknown } | undefined)?.data ??
    (record.outputAudio as { data?: unknown } | undefined)?.data;
  if (typeof direct === 'string') return { data: direct, mimeType: 'audio/l16' };
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const result = extractAudioBase64(item);
        if (result) return result;
      }
    } else if (child && typeof child === 'object') {
      const result = extractAudioBase64(child);
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

function wavDurationSeconds(wav: Buffer) {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') return null;
  const sampleRate = wav.readUInt32LE(24);
  const blockAlign = wav.readUInt16LE(32);
  if (!sampleRate || !blockAlign) return null;
  return Math.max(1, Math.round((wav.length - 44) / (sampleRate * blockAlign)));
}

function createAudioPrompt(script: string, style: string, toolId: string) {
  const toolDirection = toolId === 'radio_talk'
    ? 'Deliver this as a warm, polished radio or podcast host. Keep the supplied script intact.'
    : 'Read the supplied text exactly, clearly, and naturally.';
  return [
    '# SAVI AUDIO PROFILE',
    toolDirection,
    `Style: ${style}`,
    'Use natural pacing and short pauses where the script calls for them.',
    'Do not add an introduction, headings, comments, or extra words.',
    '',
    '# TRANSCRIPT',
    script
  ].join('\n');
}

function normalizedVoice(value: string | undefined) {
  const match = Array.from(ALLOWED_VOICES).find((voice) => voice.toLowerCase() === value?.trim().toLowerCase());
  return match || DEFAULT_VOICE;
}

async function generateAudio(input: { script: string; voice: string; style: string; toolId: string; model: string }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new SaviInfrastructureError('PROVIDER_SERVER_ERROR', 503, 'Voice generation is not connected. Your credits were not used.');
  }
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model: input.model,
      input: createAudioPrompt(input.script, input.style, input.toolId),
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: input.voice }] }
    })
  });
  const providerRequestId =
    response.headers.get('x-goog-request-id') ||
    response.headers.get('x-request-id') ||
    response.headers.get('x-guploader-uploadid') ||
    undefined;
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = (data.error as { message?: string } | undefined)?.message || 'Gemini TTS could not generate audio.';
    const error = new Error(message) as Error & { status?: number; providerRequestId?: string };
    error.status = response.status;
    error.providerRequestId = providerRequestId;
    throw error;
  }
  const audioData = extractAudioBase64(data);
  if (!audioData) {
    const error = new Error('Gemini returned no audio.') as Error & { status?: number; providerRequestId?: string };
    error.status = 502;
    error.providerRequestId = providerRequestId;
    throw error;
  }
  const wav = audioData.mimeType.toLowerCase().includes('wav')
    ? Buffer.from(audioData.data, 'base64')
    : createWavBuffer(Buffer.from(audioData.data, 'base64'), audioData.sampleRate || 24_000);
  const actualSeconds = wavDurationSeconds(wav);
  return {
    bytes: wav,
    filename: input.toolId === 'radio_talk' ? 'radio-talk.wav' : 'text-to-speech.wav',
    mimeType: 'audio/wav',
    mediaType: 'audio' as const,
    providerRequestId,
    usage: {
      ...usageFromProvider(data),
      audioTokens: actualSeconds ? actualSeconds * 25 : undefined
    },
    metadata: {
      actualAudioSeconds: actualSeconds ?? null,
      audioDurationStatus: actualSeconds ? 'measured_wav' : 'unavailable'
    }
  };
}

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Please sign in before using this tool.', category: 'AUTH_REQUIRED' }, { status: 401 });
  }

  const rateLimit = await checkSaviRateLimit({ rateLimitClass: 'PAID_GENERATION', identity: getSaviRequestIdentity(request, session.id) });
  if (!rateLimit.allowed) return createSaviRateLimitResponse(rateLimit);

  try {
    const body = (await request.json().catch(() => ({}))) as VoiceRequest;
    const script = body.script?.trim() || '';
    const toolId = body.toolId || 'radio_talk';
    if (!isVoiceTool(toolId)) throw new VoiceInputError('This voice tool is not available.');
    if (!script || script.length > MAX_SCRIPT_LENGTH) {
      throw new VoiceInputError(`Write a script under ${MAX_SCRIPT_LENGTH.toLocaleString()} characters.`);
    }
    const style = body.style?.trim() || 'warm, clear, professional';
    if (style.length > MAX_STYLE_LENGTH) throw new VoiceInputError('Voice direction is too long.');
    const estimatedSeconds = estimateSaviVoiceReservationSeconds(script.length);
    const model = getConfiguredTtsModel();
    const result = await runProtectedOperation({
      user: session,
      clientRequestId: body.clientRequestId || '',
      toolId,
      provider: SAVI_TEXT_TO_IMAGE_PROVIDER,
      model,
      operation: 'speech_generation',
      pricingInput: { textCharacters: script.length },
      pricingOutput: { audioSeconds: estimatedSeconds },
      mediaType: 'audio',
      generate: () => generateAudio({ script, voice: normalizedVoice(body.voice), style, toolId, model })
    });
    if (result.state === 'processing') {
      return NextResponse.json({ status: 'processing', jobId: result.jobId, availableCredits: result.availableCredits }, { status: 202 });
    }
    return NextResponse.json({
      audio: `/api/assets/${result.assetId}`,
      assetId: result.assetId,
      jobId: result.jobId,
      filename: result.filename,
      mode: 'gemini',
      availableCredits: result.availableCredits
    });
  } catch (error) {
    if (error instanceof SaviInfrastructureError) {
      return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    }
    if (error instanceof VoiceInputError) {
      return NextResponse.json({ error: error.message, category: 'INVALID_INPUT' }, { status: error.status });
    }
    return NextResponse.json({ error: 'SAVI could not complete this voice request. Please try again.', category: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

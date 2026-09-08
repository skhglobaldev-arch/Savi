import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import {
  getConfiguredVideoModel,
  SAVI_TEXT_TO_IMAGE_PROVIDER,
  SAVI_VIDEO_TOOL_IDS
} from '@/lib/pricing/saviPricing';
import { runProtectedOperation } from '@/lib/savi/protectedOperations';
import { SaviInfrastructureError } from '@/lib/savi/textToImageInfrastructure';

export const runtime = 'nodejs';

const MAX_PROMPT_LENGTH = 2400;
const MAX_REFERENCE_COUNT = 3;
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type VideoReference = {
  data?: string;
  mimeType?: string;
  name?: string;
};

type VideoRequest = {
  prompt?: string;
  toolId?: string;
  ratio?: '16:9' | '9:16';
  duration?: '4' | '6' | '8' | number;
  quality?: '720' | '1080' | '4K';
  withAudio?: boolean;
  references?: VideoReference[];
  clientRequestId?: string;
};

class VideoInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'VideoInputError';
  }
}

class VideoProviderError extends Error {
  constructor(message: string, readonly status: number, readonly providerRequestId?: string) {
    super(message);
    this.name = 'VideoProviderError';
  }
}

function isVideoTool(toolId: string | undefined) {
  return Boolean(toolId && SAVI_VIDEO_TOOL_IDS.includes(toolId as (typeof SAVI_VIDEO_TOOL_IDS)[number]));
}

function extractVideoData(value: unknown): { data?: string; uri?: string; mimeType: string } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.type === 'video' && (typeof record.data === 'string' || typeof record.uri === 'string')) {
    return {
      data: typeof record.data === 'string' ? record.data : undefined,
      uri: typeof record.uri === 'string' ? record.uri : undefined,
      mimeType: typeof record.mime_type === 'string' ? record.mime_type : 'video/mp4'
    };
  }

  const direct = record.output_video ?? record.outputVideo;
  if (direct && typeof direct === 'object') {
    const directRecord = direct as Record<string, unknown>;
    if (typeof directRecord.data === 'string' || typeof directRecord.uri === 'string') {
      return {
        data: typeof directRecord.data === 'string' ? directRecord.data : undefined,
        uri: typeof directRecord.uri === 'string' ? directRecord.uri : undefined,
        mimeType: typeof directRecord.mime_type === 'string' ? directRecord.mime_type : 'video/mp4'
      };
    }
  }

  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = extractVideoData(item);
        if (found) return found;
      }
    } else if (child && typeof child === 'object') {
      const found = extractVideoData(child);
      if (found) return found;
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

function buildVideoPrompt(body: Required<Pick<VideoRequest, 'prompt' | 'toolId' | 'ratio' | 'duration'>> & VideoRequest) {
  const audioNote = body.withAudio === false ? 'No dialogue. Keep audio minimal or absent.' : 'Use suitable native audio or ambience when it strengthens the idea.';
  const toolInstruction =
    body.toolId === 'story_video'
      ? 'This is a shot in a continuing story. Preserve subject identity, camera language, lighting, and motion from any supplied reference.'
      : body.toolId === 'first_last'
        ? 'Move naturally from the supplied opening frame to the supplied closing frame, without a jump cut or morphing artifacts.'
        : body.toolId === 'extend'
          ? 'Continue the supplied clip naturally with matching motion, light, and camera direction.'
          : body.toolId === 'product_ad'
            ? 'Create a polished product advertisement with one clear product story and clean readable composition.'
            : body.toolId === 'social_reel'
              ? 'Create a concise, high-energy social reel with clear visual beats and no unreadable on-screen text.'
              : 'Create one polished, premium SAVI video with a clear visual idea.';

  return [
    `Create a ${body.duration}-second video in ${body.ratio}.`,
    'Use the current SAVI Omni 720p output path.',
    toolInstruction,
    audioNote,
    '',
    'User request:',
    body.prompt
  ].join('\n');
}

function taskForTool(toolId: string, hasReferences: boolean) {
  if (toolId === 'story_video') return hasReferences ? 'edit' : 'text_to_video';
  if (['image_video', 'first_last', 'product_ad', 'social_reel'].includes(toolId)) return 'image_to_video';
  if (toolId === 'extend') return 'edit';
  return 'text_to_video';
}

function validateRequest(body: VideoRequest) {
  const prompt = body.prompt?.trim() || '';
  if (!isVideoTool(body.toolId)) throw new VideoInputError('This video tool is not available.');
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
    throw new VideoInputError(`Write a video prompt under ${MAX_PROMPT_LENGTH} characters.`);
  }
  const duration = Number(body.duration || 6);
  if (![4, 6, 8].includes(duration)) {
    throw new VideoInputError('Current SAVI video generation supports 4, 6, or 8 seconds.');
  }
  if (body.quality && body.quality !== '720') {
    throw new VideoInputError('Current SAVI video generation is available in 720p only.');
  }
  const ratio = body.ratio || '9:16';
  if (ratio !== '16:9' && ratio !== '9:16') throw new VideoInputError('Choose 16:9 or 9:16.');

  const suppliedReferences = Array.isArray(body.references) ? body.references : [];
  if (suppliedReferences.some((reference) => !reference || typeof reference.data !== 'string' || !reference.data || typeof reference.mimeType !== 'string' || !reference.mimeType)) {
    throw new VideoInputError('Each reference file needs valid data and a MIME type.');
  }
  const references = suppliedReferences.map((reference) => ({ ...reference, data: reference.data!, mimeType: reference.mimeType!.toLowerCase() }));
  if (references.length > MAX_REFERENCE_COUNT) {
    throw new VideoInputError(`This tool supports up to ${MAX_REFERENCE_COUNT} reference files.`);
  }
  for (const reference of references) {
    const mimeType = reference.mimeType.toLowerCase();
    if (!VIDEO_MIME_TYPES.has(mimeType) && !IMAGE_MIME_TYPES.has(mimeType)) {
      throw new VideoInputError('Use MP4, WebM, PNG, JPEG, or WebP reference files.');
    }
    if (Math.ceil(reference.data.length * 0.75) > MAX_REFERENCE_BYTES) {
      throw new VideoInputError('One reference file is too large. Use files under 8MB.');
    }
  }

  if (body.toolId === 'first_last' && (references.length < 2 || references.length > 3)) {
    throw new VideoInputError('Start / End Frame needs a start frame, an end frame, and one optional extra reference.');
  }
  if (['image_video', 'product_ad', 'social_reel', 'extend'].includes(body.toolId || '') && references.length < 1) {
    throw new VideoInputError('This video tool needs at least one reference image or clip.');
  }
  if (body.toolId === 'text_video' && references.length) {
    throw new VideoInputError('Text to Video does not use reference files. Choose Image to Video for that workflow.');
  }

  return { prompt, duration, ratio, references };
}

async function downloadProviderVideo(uri: string, apiKey: string) {
  const url = new URL(uri);
  if (url.protocol !== 'https:' || (!url.hostname.endsWith('.googleapis.com') && !url.hostname.endsWith('.googleusercontent.com'))) {
    throw new VideoProviderError('Gemini returned an unsupported video location.', 502);
  }
  url.searchParams.set('key', apiKey);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new VideoProviderError('SAVI could not retrieve the generated video.', response.status);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { bytes: buffer, mimeType: response.headers.get('content-type') || 'video/mp4' };
}

async function generateVideo(body: VideoRequest, validated: ReturnType<typeof validateRequest>, model: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new SaviInfrastructureError('PROVIDER_SERVER_ERROR', 503, 'Video generation is not connected. Your credits were not used.');
  }
  const normalized = { ...body, ...validated, toolId: body.toolId || '' };
  const input: Array<Record<string, string>> = validated.references.map((reference) => ({
    type: reference.mimeType.startsWith('video/') ? 'video' : 'image',
    data: reference.data,
    mime_type: reference.mimeType
  }));
  input.push({ type: 'text', text: buildVideoPrompt(normalized) });
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model,
      input: validated.references.length ? input : buildVideoPrompt(normalized),
      response_format: { type: 'video', aspect_ratio: validated.ratio },
      generation_config: { video_config: { task: taskForTool(body.toolId || '', validated.references.length > 0) } }
    })
  });
  const providerRequestId =
    response.headers.get('x-goog-request-id') ||
    response.headers.get('x-request-id') ||
    response.headers.get('x-guploader-uploadid') ||
    undefined;
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = (data.error as { message?: string } | undefined)?.message || 'Gemini video generation failed.';
    throw new VideoProviderError(message, response.status, providerRequestId);
  }
  const video = extractVideoData(data);
  if (!video) throw new VideoProviderError('Gemini returned no video. Try a shorter, clearer prompt.', 502, providerRequestId);
  let bytes: Buffer;
  let mimeType = video.mimeType.toLowerCase();
  if (video.data) {
    bytes = Buffer.from(video.data, 'base64');
  } else if (video.uri) {
    const downloaded = await downloadProviderVideo(video.uri, apiKey);
    bytes = downloaded.bytes;
    mimeType = downloaded.mimeType.toLowerCase();
  } else {
    throw new VideoProviderError('Gemini returned no downloadable video.', 502, providerRequestId);
  }
  if (!VIDEO_MIME_TYPES.has(mimeType)) mimeType = 'video/mp4';
  return {
    bytes,
    filename: `savi-generated-video.${mimeType === 'video/webm' ? 'webm' : 'mp4'}`,
    mimeType,
    mediaType: 'video' as const,
    providerRequestId,
    usage: { ...usageFromProvider(data), videoSeconds: validated.duration },
    metadata: { outputDurationStatus: 'validated_requested_duration', outputResolution: '720' }
  };
}

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Please sign in before using this tool.', category: 'AUTH_REQUIRED' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as VideoRequest;
    const validated = validateRequest(body);
    const model = getConfiguredVideoModel();
    const result = await runProtectedOperation({
      user: session,
      clientRequestId: body.clientRequestId || '',
      toolId: body.toolId || '',
      provider: SAVI_TEXT_TO_IMAGE_PROVIDER,
      model,
      operation: 'video_generation',
      pricingInput: { referenceImageCount: validated.references.length },
      pricingOutput: { resolution: '720', videoSeconds: validated.duration },
      mediaType: 'video',
      generate: () => generateVideo(body, validated, model)
    });
    if (result.state === 'processing') {
      return NextResponse.json({ status: 'processing', jobId: result.jobId, availableCredits: result.availableCredits }, { status: 202 });
    }
    return NextResponse.json({
      video: `/api/assets/${result.assetId}`,
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
    if (error instanceof VideoInputError) {
      return NextResponse.json({ error: error.message, category: 'INVALID_INPUT' }, { status: error.status });
    }
    if (error instanceof VideoProviderError) {
      return NextResponse.json({ error: 'Video generation is temporarily unavailable. Please try again.', category: 'PROVIDER_ERROR' }, { status: error.status });
    }
    return NextResponse.json({ error: 'SAVI could not complete this video request. Please try again.', category: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

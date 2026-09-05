import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_PROMPT_LENGTH = 2400;
const MAX_REFERENCE_COUNT = 3;
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const DEFAULT_VIDEO_MODEL = 'gemini-omni-flash-preview';

type VideoReference = {
  data?: string;
  mimeType?: string;
  name?: string;
};

type VideoRequest = {
  prompt?: string;
  toolId?: string;
  ratio?: '16:9' | '9:16';
  duration?: '4' | '6' | '8';
  quality?: '720' | '1080' | '4K';
  withAudio?: boolean;
  references?: VideoReference[];
};

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

function buildVideoPrompt(body: VideoRequest) {
  const duration = body.duration || '6';
  const qualityNote = body.quality && body.quality !== '720' ? `Requested quality: ${body.quality}. Use the highest available quality for this model.` : 'Use clean 720p generation.';
  const audioNote = body.withAudio === false ? 'No dialogue. Minimal or no audio.' : 'Include suitable native audio, ambience, music, or voice direction if useful.';
  const storyNote =
    body.toolId === 'story_video'
      ? [
          'This is one shot in a multi-shot SAVI story video.',
          'Preserve visual continuity, subject identity, camera language, lighting, and motion logic between shots.',
          'If a reference clip is provided, continue from that clip naturally instead of restarting the scene.'
        ].join('\n')
      : '';

  return [
    `Create a ${duration}-second SAVI video.`,
    `Aspect ratio: ${body.ratio || '9:16'}.`,
    qualityNote,
    audioNote,
    storyNote,
    'Make it polished, premium, useful, and production-ready.',
    'Use a single clear visual idea. Avoid messy unreadable text.',
    '',
    'User request:',
    body.prompt?.trim()
  ]
    .filter(Boolean)
    .join('\n');
}

function taskForTool(toolId?: string, hasReferences = false) {
  if (toolId === 'story_video') return hasReferences ? 'edit' : 'text_to_video';
  if (['image_video', 'first_last', 'product_ad', 'social_reel'].includes(toolId || '')) return 'image_to_video';
  if (toolId === 'extend') return 'edit';
  return 'text_to_video';
}

async function downloadVideo(uri: string, apiKey: string) {
  const separator = uri.includes('?') ? '&' : '?';
  const response = await fetch(`${uri}${separator}key=${apiKey}`);
  if (!response.ok) return null;
  const contentType = response.headers.get('content-type') || 'video/mp4';
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    data: buffer.toString('base64'),
    mimeType: contentType
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as VideoRequest;
    const prompt = body.prompt?.trim() ?? '';

    if (!prompt) {
      return NextResponse.json({ error: 'Video prompt is required.' }, { status: 400 });
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ error: `Video prompt is too long. Limit it to ${MAX_PROMPT_LENGTH} characters for now.` }, { status: 400 });
    }

    const references = (body.references || []).slice(0, MAX_REFERENCE_COUNT).filter((item) => item.data && item.mimeType);
    for (const reference of references) {
      const estimatedBytes = Math.ceil((reference.data?.length || 0) * 0.75);
      if (estimatedBytes > MAX_REFERENCE_BYTES) {
        return NextResponse.json({ error: 'One reference file is too large for this video request. Use files under 8MB.' }, { status: 413 });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Video generation is not connected on this device.' }, { status: 500 });
    }

    const input: Array<Record<string, string>> = references.map((reference) => ({
      type: reference.mimeType?.startsWith('video/') ? 'video' : 'image',
      data: reference.data || '',
      mime_type: reference.mimeType || 'image/png'
    }));
    input.push({ type: 'text', text: buildVideoPrompt(body) });

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        model: process.env.GEMINI_VIDEO_MODEL || DEFAULT_VIDEO_MODEL,
        input: references.length ? input : buildVideoPrompt(body),
        response_format: {
          type: 'video',
          aspect_ratio: body.ratio || '9:16'
        },
        generation_config: {
          video_config: {
            task: taskForTool(body.toolId, references.length > 0)
          }
        }
      })
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const message =
        (data.error as { message?: string } | undefined)?.message ||
        'Gemini video generation failed.';
      return NextResponse.json({ error: message }, { status: response.status });
    }

    let video = extractVideoData(data);
    if (video?.uri && !video.data) {
      const downloaded = await downloadVideo(video.uri, apiKey);
      if (downloaded) video = { ...video, ...downloaded };
    }

    if (!video?.data) {
      return NextResponse.json({ error: 'Gemini returned no video. Try a shorter, clearer prompt.' }, { status: 502 });
    }

    const extension = video.mimeType.includes('webm') ? 'webm' : 'mp4';
    return NextResponse.json({
      video: `data:${video.mimeType};base64,${video.data}`,
      filename: `savi-generated-video.${extension}`,
      mode: 'gemini'
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Video generation failed.' },
      { status: 500 }
    );
  }
}

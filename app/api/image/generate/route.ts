import { NextRequest, NextResponse } from 'next/server';
import { type SaviTextToImageQuality } from '@/lib/ai/saviAgent';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import {
  runProtectedTextToImage,
  SaviInfrastructureError,
  type GeneratedImageOutput
} from '@/lib/savi/textToImageInfrastructure';

export const runtime = 'nodejs';

const MAX_PROMPT_LENGTH = 4000;
const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';

type ImageReference = {
  data?: string;
  mimeType?: string;
  name?: string;
};

type ImageRequest = {
  prompt?: string;
  toolId?: string;
  aspectRatio?: string;
  quality?: '720' | '1080' | '4K';
  style?: string;
  clientRequestId?: string;
  referenceImage?: ImageReference;
  referenceImages?: ImageReference[];
};

class ImageInputError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = 'ImageInputError';
  }
}

class ImageGenerationProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly providerRequestId?: string
  ) {
    super(message);
    this.name = 'ImageGenerationProviderError';
  }
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sizeForRatio(aspectRatio: string) {
  if (aspectRatio === '16:9') return { width: 1344, height: 768 };
  if (aspectRatio === '9:16') return { width: 768, height: 1344 };
  if (aspectRatio === '4:5') return { width: 896, height: 1152 };
  return { width: 1024, height: 1024 };
}

function imageSizeForQuality(quality?: string) {
  if (quality === '4K') return '4K';
  if (quality === '1080') return '2K';
  return '1K';
}

function extractImageData(value: unknown): { data: string; mimeType: string } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  if (record.type === 'image' && typeof record.data === 'string') {
    return {
      data: record.data,
      mimeType: typeof record.mime_type === 'string' ? record.mime_type : 'image/png'
    };
  }

  const direct =
    (record.output_image as { data?: unknown } | undefined)?.data ??
    (record.outputImage as { data?: unknown } | undefined)?.data;

  if (typeof direct === 'string') return { data: direct, mimeType: 'image/png' };

  for (const [key, child] of Object.entries(record)) {
    if (key.toLowerCase().includes('image') && child && typeof child === 'object') {
      const data = (child as { data?: unknown }).data;
      const mimeType = (child as { mime_type?: unknown; mimeType?: unknown }).mime_type ?? (child as { mimeType?: unknown }).mimeType;
      if (typeof data === 'string') {
        return {
          data,
          mimeType: typeof mimeType === 'string' ? mimeType : 'image/png'
        };
      }
    }
  }

  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = extractImageData(item);
        if (found) return found;
      }
    } else if (child && typeof child === 'object') {
      const found = extractImageData(child);
      if (found) return found;
    }
  }

  return null;
}

function buildPrompt({ prompt, toolId, style, referenceImage, referenceImages }: Required<Pick<ImageRequest, 'prompt'>> & ImageRequest) {
  const references = referenceImages?.length ? referenceImages : referenceImage ? [referenceImage] : [];
  const toolInstruction =
    toolId === 'remove_background'
      ? 'Remove or replace only the background. Preserve the main subject exactly.'
      : toolId === 'remove_object'
        ? 'Remove only the requested object and rebuild the area naturally.'
        : toolId === 'change_style'
          ? 'Change only the requested outfit, color, material, or visual style while preserving identity and composition.'
          : toolId === 'story_sketch'
            ? 'Create a realistic storyboard frame. If a reference image is provided, continue from it while preserving visual continuity, lighting, subject identity, and cinematic sequence logic.'
            : toolId === 'sketch_to_image'
              ? 'Transform the provided sketch or canvas drawing into a polished generated image. Preserve the rough composition, main shapes, labels, and user intent while improving realism, lighting, materials, and finish.'
              : toolId === 'mockup'
                ? 'Create a photorealistic mockup. Use the first reference image as the logo, artwork, or design. If a second reference image is provided, use it as the target surface or environment. Place the design naturally with realistic perspective, lighting, shadows, reflections, and material texture. Do not add unrelated logos, random text, watermark labels, or extra brand names.'
                : toolId === 'visual_mixer'
                  ? 'Blend the provided subject, scene, and style references into one cohesive generated image. Preserve key cues from each selected reference while making a single natural composition, not a collage, grid, or moodboard.'
                  : toolId === 'product_photo'
                    ? 'Create a polished product photography image suitable for ads.'
                    : toolId === 'edit_image'
                      ? 'Edit the provided image while preserving the main subject and original structure.'
                      : 'Generate a clean, premium, launch-ready image.';

  const referenceSummary = references.length
    ? `Reference images (${references.length}): ${references.map((item, index) => `${index + 1}. ${item.name || 'unnamed reference'}`).join('; ')}.`
    : 'No reference image name.';

  return [
    'You are SAVI image studio.',
    toolInstruction,
    `Style direction: ${style || 'Premium, clean, useful'}.`,
    referenceSummary,
    '',
    'User request:',
    prompt
  ].join('\n');
}

function createLocalPreviewImage(prompt: string, aspectRatio: string, quality?: string, style?: string) {
  const { width, height } = sizeForRatio(aspectRatio);
  const safePrompt = escapeXml(prompt.slice(0, 190));
  const safeStyle = escapeXml(style || 'Premium');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.45" stop-color="#ede9fe"/>
      <stop offset="1" stop-color="#dbeafe"/>
    </linearGradient>
    <radialGradient id="glow" cx="30%" cy="24%" r="60%">
      <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="28" stdDeviation="28" flood-color="#7c3aed" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <g filter="url(#shadow)">
    <rect x="${width * 0.1}" y="${height * 0.16}" width="${width * 0.8}" height="${height * 0.68}" rx="42" fill="#ffffff" fill-opacity="0.74" stroke="#a78bfa" stroke-opacity="0.55"/>
    <circle cx="${width * 0.28}" cy="${height * 0.34}" r="${Math.min(width, height) * 0.1}" fill="#7c3aed" fill-opacity="0.9"/>
    <rect x="${width * 0.43}" y="${height * 0.29}" width="${width * 0.32}" height="${height * 0.055}" rx="16" fill="#2563eb" fill-opacity="0.82"/>
    <rect x="${width * 0.25}" y="${height * 0.5}" width="${width * 0.5}" height="${height * 0.045}" rx="14" fill="#0f172a" fill-opacity="0.78"/>
    <rect x="${width * 0.31}" y="${height * 0.58}" width="${width * 0.38}" height="${height * 0.035}" rx="11" fill="#7c3aed" fill-opacity="0.54"/>
  </g>
  <text x="50%" y="${height * 0.11}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${Math.max(28, width * 0.035)}" font-weight="800" fill="#170b36">SAVI Image Preview</text>
  <text x="50%" y="${height * 0.89}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${Math.max(18, width * 0.022)}" font-weight="700" fill="#475569">${escapeXml(`${safeStyle} · ${quality || '1080'} · ${aspectRatio}`)}</text>
  <foreignObject x="${width * 0.18}" y="${height * 0.67}" width="${width * 0.64}" height="${height * 0.12}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter,Arial,sans-serif;font-size:${Math.max(18, width * 0.019)}px;line-height:1.35;text-align:center;color:#334155;font-weight:700">${safePrompt}</div>
  </foreignObject>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function referenceImagesFor(body: ImageRequest) {
  return (Array.isArray(body.referenceImages) && body.referenceImages.length ? body.referenceImages : body.referenceImage ? [body.referenceImage] : [])
    .filter((item): item is Required<Pick<ImageReference, 'data' | 'mimeType'>> & ImageReference => Boolean(item?.data && item?.mimeType))
    .slice(0, body.toolId === 'mockup' ? 2 : body.toolId === 'visual_mixer' ? 6 : 3);
}

function validateImageRequest(body: ImageRequest) {
  const prompt = body.prompt?.trim() ?? '';
  if (!prompt && !['remove_background', 'variations'].includes(body.toolId || '')) {
    throw new ImageInputError('Prompt is required.');
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new ImageInputError(`Prompt is too long. Limit it to ${MAX_PROMPT_LENGTH} characters for now.`);
  }

  const referenceImages = referenceImagesFor(body);
  if (body.toolId === 'mockup' && referenceImages.length < 1) {
    throw new ImageInputError('Mockup needs a logo or design image.');
  }
  return { prompt, referenceImages };
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

async function generateImageOutput(body: ImageRequest): Promise<GeneratedImageOutput> {
  const { prompt, referenceImages } = validateImageRequest(body);
  const apiKey = process.env.GEMINI_API_KEY;
  const aspectRatio = body.aspectRatio || '1:1';
  const fallbackImage = createLocalPreviewImage(prompt || body.toolId || 'SAVI image', aspectRatio, body.quality, body.style);

  if (!apiKey) {
    return {
      image: fallbackImage,
      filename: 'savi-image-local-preview.svg',
      mimeType: 'image/svg+xml',
      mode: 'local-preview'
    };
  }

  const input: Array<Record<string, string>> = [
    {
      type: 'text',
      text: buildPrompt({
        prompt: prompt || body.toolId || 'Create an image.',
        toolId: body.toolId,
        style: body.style,
        referenceImages
      })
    }
  ];

  for (const reference of referenceImages) {
    input.push({
      type: 'image',
      mime_type: reference.mimeType,
      data: reference.data
    });
  }

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      model: process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
      input,
      response_format: {
        type: 'image',
        aspect_ratio: aspectRatio,
        image_size: imageSizeForQuality(body.quality)
      }
    })
  });

  const providerRequestId =
    response.headers.get('x-goog-request-id') ||
    response.headers.get('x-request-id') ||
    response.headers.get('x-guploader-uploadid') ||
    undefined;
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      (data.error as { message?: string } | undefined)?.message ||
      'Image generation failed.';
    throw new ImageGenerationProviderError(message, response.status, providerRequestId);
  }

  const imageData = extractImageData(data);
  if (!imageData) {
    throw new ImageGenerationProviderError('Gemini returned no image. Try a clearer prompt.', 502, providerRequestId);
  }

  const extension = imageData.mimeType.includes('jpeg') || imageData.mimeType.includes('jpg') ? 'jpg' : 'png';
  return {
    image: `data:${imageData.mimeType};base64,${imageData.data}`,
    filename: `savi-generated-image.${extension}`,
    mimeType: imageData.mimeType,
    mode: 'gemini',
    providerRequestId,
    usage: usageFromProvider(data)
  };
}

function protectedQuality(value: ImageRequest['quality']): SaviTextToImageQuality {
  if (!value) return '1080';
  if (value === '720' || value === '1080' || value === '4K') return value;
  throw new ImageInputError('Unsupported image quality.');
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as ImageRequest;
  const isProtectedTextToImage = body.toolId === 'text_to_image';

  if (isProtectedTextToImage) {
    const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ error: 'Please sign in before generating an image.', category: 'AUTH_REQUIRED' }, { status: 401 });
    }

    try {
      const { referenceImages } = validateImageRequest(body);
      const quality = protectedQuality(body.quality);
      const result = await runProtectedTextToImage({
        user: session,
        clientRequestId: body.clientRequestId || '',
        quality,
        aspectRatio: body.aspectRatio || '1:1',
        referenceImageCount: referenceImages.length,
        provider: 'gemini',
        model: process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
        generate: async () => {
          const output = await generateImageOutput({ ...body, quality });
          if (output.mode === 'local-preview') {
            throw new SaviInfrastructureError(
              'PROVIDER_SERVER_ERROR',
              503,
              'The image service is temporarily unavailable. Your credits were not used.'
            );
          }
          return output;
        }
      });

      if (result.state === 'processing') {
        return NextResponse.json(
          { status: 'processing', jobId: result.jobId, availableCredits: result.availableCredits },
          { status: 202 }
        );
      }

      return NextResponse.json({
        image: `/api/assets/${result.assetId}`,
        filename: result.filename,
        mode: result.mode,
        jobId: result.jobId,
        assetId: result.assetId,
        availableCredits: result.availableCredits
      });
    } catch (error) {
      if (error instanceof SaviInfrastructureError) {
        return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
      }
      if (error instanceof ImageInputError) {
        return NextResponse.json({ error: 'Please check the image request and try again.', category: 'INVALID_INPUT' }, { status: error.status });
      }
      return NextResponse.json({ error: 'SAVI could not complete that image request. Please try again.', category: 'INTERNAL_ERROR' }, { status: 500 });
    }
  }

  try {
    const output = await generateImageOutput(body);
    return NextResponse.json({
      image: output.image,
      filename: output.filename,
      mode: output.mode
    });
  } catch (error) {
    if (error instanceof ImageInputError || error instanceof ImageGenerationProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Image generation failed.' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SAVI_SESSION_COOKIE } from '@/lib/auth/session';
import {
  isTextToImageAspectRatio,
  isTextToImageQuality,
  type TextToImageAspectRatio,
  type TextToImageQuality
} from '@/lib/pricing/textToImageCatalog';
import {
  getConfiguredTextToImageModel,
  SAVI_IMAGE_GENERATION_TOOL_IDS,
  SAVI_TEXT_TO_IMAGE_PROVIDER
} from '@/lib/pricing/saviPricing';
import {
  runProtectedTextToImage,
  SaviInfrastructureError,
  type GeneratedImageOutput
} from '@/lib/savi/textToImageInfrastructure';
import { runProtectedOperation, type SaviProtectedOutput } from '@/lib/savi/protectedOperations';

export const runtime = 'nodejs';

const MAX_PROMPT_LENGTH = 4000;
const MAX_REFERENCE_BYTES = 12 * 1024 * 1024;

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
                  : toolId === 'variations'
                    ? 'Create one polished visual variation from the supplied reference. Preserve the core subject, product, and brand direction while applying only the requested creative change.'
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

function referenceImagesFor(body: ImageRequest) {
  return Array.isArray(body.referenceImages) && body.referenceImages.length
    ? body.referenceImages
    : body.referenceImage
      ? [body.referenceImage]
      : [];
}

function validateImageRequest(body: ImageRequest) {
  const prompt = body.prompt?.trim() ?? '';
  if (!prompt && body.toolId !== 'remove_background') {
    throw new ImageInputError('Prompt is required.');
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new ImageInputError(`Prompt is too long. Limit it to ${MAX_PROMPT_LENGTH} characters for now.`);
  }

  const suppliedReferences = referenceImagesFor(body);
  const maximumReferences = body.toolId === 'mockup' ? 2 : body.toolId === 'visual_mixer' ? 6 : 3;
  if (suppliedReferences.length > maximumReferences) {
    throw new ImageInputError(`This tool supports up to ${maximumReferences} reference images.`);
  }

  const referenceImages = suppliedReferences.map((reference) => {
    if (!reference || typeof reference.data !== 'string' || !reference.data || typeof reference.mimeType !== 'string' || !reference.mimeType) {
      throw new ImageInputError('Each reference image needs valid image data and a MIME type.');
    }
    const mimeType = reference.mimeType.toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      throw new ImageInputError('Use PNG, JPEG, or WebP reference images.');
    }
    if (Math.ceil(reference.data.length * 0.75) > MAX_REFERENCE_BYTES) {
      throw new ImageInputError('One reference image is too large. Use images under 12MB.');
    }
    return { ...reference, data: reference.data, mimeType };
  });

  const toolsThatRequireReference = new Set([
    'sketch_to_image',
    'edit_image',
    'remove_background',
    'remove_object',
    'change_style',
    'product_photo',
    'mockup',
    'variations'
  ]);
  if (toolsThatRequireReference.has(body.toolId || '') && referenceImages.length < 1) {
    throw new ImageInputError('Add a reference image for this tool.');
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

  if (!apiKey) {
    throw new ImageGenerationProviderError('Image generation is not connected. Your credits were not used.', 503);
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
      model: getConfiguredTextToImageModel(),
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

function protectedQuality(value: ImageRequest['quality']): TextToImageQuality {
  if (!value) return '1080';
  if (isTextToImageQuality(value)) return value;
  throw new ImageInputError('Unsupported image quality.');
}

function protectedAspectRatio(value: ImageRequest['aspectRatio']): TextToImageAspectRatio {
  const aspectRatio = value || '1:1';
  if (isTextToImageAspectRatio(aspectRatio)) return aspectRatio;
  throw new ImageInputError('Unsupported image aspect ratio.');
}

function protectedImageOutput(output: GeneratedImageOutput): SaviProtectedOutput {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(output.image);
  if (!match) {
    throw new SaviInfrastructureError('UNSUPPORTED_INPUT', 422, 'SAVI could not save the generated image. Your credits were not used.');
  }
  return {
    bytes: Buffer.from(match[2].replace(/\s/g, ''), 'base64'),
    filename: output.filename,
    mimeType: match[1].toLowerCase(),
    mediaType: 'image',
    providerRequestId: output.providerRequestId,
    usage: {
      inputTokens: output.usage?.inputTokens,
      outputTokens: output.usage?.outputTokens,
      imageCount: 1
    }
  };
}

function isActiveImageGenerationTool(toolId: string | undefined) {
  return Boolean(toolId && SAVI_IMAGE_GENERATION_TOOL_IDS.includes(toolId as (typeof SAVI_IMAGE_GENERATION_TOOL_IDS)[number]));
}

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SAVI_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Please sign in before using this tool.', category: 'AUTH_REQUIRED' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ImageRequest;
  const isProtectedTextToImage = body.toolId === 'text_to_image';

  if (isProtectedTextToImage) {
    try {
      const { referenceImages } = validateImageRequest(body);
      const quality = protectedQuality(body.quality);
      const aspectRatio = protectedAspectRatio(body.aspectRatio);
      const model = getConfiguredTextToImageModel();
      const result = await runProtectedTextToImage({
        user: session,
        clientRequestId: body.clientRequestId || '',
        quality,
        aspectRatio,
        referenceImageCount: referenceImages.length,
        provider: SAVI_TEXT_TO_IMAGE_PROVIDER,
        model,
        generate: async () => {
          return generateImageOutput({ ...body, quality, aspectRatio });
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
    if (!isActiveImageGenerationTool(body.toolId)) {
      return NextResponse.json({ error: 'This image tool is not available through the image generation route.' }, { status: 400 });
    }

    const { referenceImages } = validateImageRequest(body);
    const quality = protectedQuality(body.quality);
    const aspectRatio = protectedAspectRatio(body.aspectRatio);
    const model = getConfiguredTextToImageModel();
    const result = await runProtectedOperation({
      user: session,
      clientRequestId: body.clientRequestId || '',
      toolId: body.toolId || '',
      provider: SAVI_TEXT_TO_IMAGE_PROVIDER,
      model,
      operation: 'image_generation',
      pricingInput: { referenceImageCount: referenceImages.length },
      pricingOutput: { imageCount: 1, resolution: quality, aspectRatio },
      mediaType: 'image',
      generate: async () => {
        const output = await generateImageOutput({ ...body, quality, aspectRatio });
        return protectedImageOutput(output);
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
      mode: 'gemini',
      jobId: result.jobId,
      assetId: result.assetId,
      availableCredits: result.availableCredits
    });
  } catch (error) {
    if (error instanceof SaviInfrastructureError) {
      return NextResponse.json({ error: error.message, category: error.category }, { status: error.status });
    }
    if (error instanceof ImageInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ImageGenerationProviderError) {
      return NextResponse.json({ error: 'Image generation is temporarily unavailable. Please try again.', category: 'PROVIDER_ERROR' }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Image generation failed.' },
      { status: 500 }
    );
  }
}

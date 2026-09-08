/**
 * Safe, public Text-to-Image estimates. These values are intentionally limited
 * to SAVI credits and can be shared with the client; provider economics remain
 * server-only in saviPricing.ts.
 */
export const TEXT_TO_IMAGE_PRICING_VERSION = '2026-09-savi-v1';

export const TEXT_TO_IMAGE_QUALITIES = ['720', '1080', '4K'] as const;
export type TextToImageQuality = (typeof TEXT_TO_IMAGE_QUALITIES)[number];

export const TEXT_TO_IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:5'] as const;
export type TextToImageAspectRatio = (typeof TEXT_TO_IMAGE_ASPECT_RATIOS)[number];

const TEXT_TO_IMAGE_CREDIT_ESTIMATES: Record<TextToImageQuality, number> = {
  '720': 75,
  '1080': 125,
  '4K': 200
};

export function isTextToImageQuality(value: unknown): value is TextToImageQuality {
  return typeof value === 'string' && TEXT_TO_IMAGE_QUALITIES.includes(value as TextToImageQuality);
}

export function isTextToImageAspectRatio(value: unknown): value is TextToImageAspectRatio {
  return typeof value === 'string' && TEXT_TO_IMAGE_ASPECT_RATIOS.includes(value as TextToImageAspectRatio);
}

export function getTextToImageCreditEstimate(quality: TextToImageQuality = '1080') {
  return TEXT_TO_IMAGE_CREDIT_ESTIMATES[quality];
}

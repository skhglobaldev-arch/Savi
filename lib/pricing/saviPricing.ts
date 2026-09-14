import {
  getTextToImageCreditEstimate,
  isTextToImageAspectRatio,
  isTextToImageQuality,
  TEXT_TO_IMAGE_PRICING_VERSION,
  type TextToImageAspectRatio,
  type TextToImageQuality
} from './textToImageCatalog';

/** Provider amounts are exact integer micro-USD values: 1 USD = 1,000,000 micro-USD. */
export const SAVI_PROVIDER_COST_UNIT = 'micro_usd' as const;
export const SAVI_PROVIDER_COST_CURRENCY = 'USD' as const;

/** Internal accounting reference only. This value is never returned to customer UI. */
export const SAVI_NOMINAL_RETAIL_MICROS_PER_CREDIT = BigInt(2500);
export const SAVI_RETAIL_PRICING_VERSION = TEXT_TO_IMAGE_PRICING_VERSION;
export const SAVI_PROVIDER_RATE_CARD_VERSION = 'google-gemini-2026-09-06-v1';

export const SAVI_TEXT_TO_IMAGE_PROVIDER = 'gemini' as const;
export const SAVI_TEXT_TO_IMAGE_DEFAULT_MODEL = 'gemini-3.1-flash-image' as const;
export const SAVI_TEXT_DEFAULT_MODEL = 'gemini-3.6-flash' as const;
export const SAVI_TTS_DEFAULT_MODEL = 'gemini-3.1-flash-tts-preview' as const;
export const SAVI_VIDEO_DEFAULT_MODEL = 'gemini-omni-flash-preview' as const;
export const SAVI_LOCAL_PDF_PROVIDER = 'savi_local' as const;
export const SAVI_LOCAL_PDF_MODEL = 'pdf-lib-poppler-v1' as const;
export const SAVI_ILOVEPDF_PROVIDER = 'ilovepdf' as const;
export const SAVI_ILOVEPDF_PDF_TO_JPG_MODEL = 'pdfjpg-eu-v1' as const;
const SAVI_VOICE_RESERVATION_CHARACTERS_PER_SECOND = 10;
const SAVI_VOICE_MAX_RESERVATION_SECONDS = 1_200;

const GOOGLE_GEMINI_PRICING_URL = 'https://ai.google.dev/gemini-api/docs/pricing';
const GOOGLE_GEMINI_PRICING_SOURCE = {
  reference: 'Google Gemini Developer API pricing, standard paid tier.',
  url: GOOGLE_GEMINI_PRICING_URL,
  verifiedAt: '2026-09-06'
} as const;

/**
 * Keeps provider model selection in the server pricing domain. A configured
 * model without a pricing rule is rejected before reservation or generation.
 */
export function getConfiguredTextToImageModel() {
  return process.env.GEMINI_IMAGE_MODEL?.trim() || SAVI_TEXT_TO_IMAGE_DEFAULT_MODEL;
}

export function getConfiguredTextModel() {
  return process.env.GEMINI_TEXT_MODEL?.trim() || SAVI_TEXT_DEFAULT_MODEL;
}

export function getConfiguredTextModels(primary = getConfiguredTextModel()) {
  return [primary, 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
    .map((model) => model.trim())
    .filter(Boolean)
    .filter((model, index, all) => all.indexOf(model) === index);
}

export function getConfiguredTtsModel() {
  return process.env.GEMINI_TTS_MODEL?.trim() || SAVI_TTS_DEFAULT_MODEL;
}

export function getConfiguredVideoModel() {
  return process.env.GEMINI_VIDEO_MODEL?.trim() || SAVI_VIDEO_DEFAULT_MODEL;
}

/**
 * The quote and the protected TTS route must reserve against the same bounded
 * duration estimate. Actual WAV duration is retained as usage telemetry after
 * generation, but never increases a customer's charge beyond this reservation.
 */
export function estimateSaviVoiceReservationSeconds(textCharacters: number) {
  if (!Number.isSafeInteger(textCharacters) || textCharacters < 1) return 1;
  return Math.min(
    SAVI_VOICE_MAX_RESERVATION_SECONDS,
    Math.max(1, Math.ceil(textCharacters / SAVI_VOICE_RESERVATION_CHARACTERS_PER_SECOND))
  );
}

export const SAVI_IMAGE_GENERATION_TOOL_IDS = [
  'text_to_image',
  'story_sketch',
  'sketch_to_image',
  'edit_image',
  'remove_background',
  'remove_object',
  'change_style',
  'product_photo',
  'mockup',
  'visual_mixer',
  'text_design',
  'variations'
] as const;

export const SAVI_IMAGE_TEXT_TOOL_IDS = ['instagram_post', 'product_prompt'] as const;
export const SAVI_VIDEO_TOOL_IDS = ['text_video', 'story_video', 'image_video', 'first_last', 'product_ad', 'social_reel', 'extend'] as const;
export const SAVI_VOICE_TOOL_IDS = ['text_to_speech', 'radio_talk'] as const;
export const SAVI_LOCAL_PDF_TOOL_IDS = ['merge_pdf', 'organize_pdf', 'split_pdf', 'extract_images', 'pdf_to_jpg'] as const;
export const SAVI_AI_PDF_TOOL_IDS = ['contract_summary', 'explain_document', 'translate_summary', 'pdf_podcast'] as const;

export type SaviPricingOperation =
  | 'text_generation'
  | 'image_generation'
  | 'video_generation'
  | 'speech_generation'
  | 'document_local'
  | 'document_ai'
  | 'search_grounding';

export type SaviProviderBillingUnit =
  | 'per_operation'
  | 'per_generated_image'
  | 'per_input_token'
  | 'per_output_token'
  | 'per_generated_second'
  | 'per_audio_second'
  | 'per_input_character'
  | 'per_document_page'
  | 'per_grounding_request';

export type SaviProviderOutputModality = 'text' | 'image' | 'video' | 'audio';
export type SaviProviderRateComponent = 'input' | 'output' | 'grounding' | 'fixed';

export type SaviProviderRateSource = {
  reference: string;
  url?: string;
  verifiedAt?: string;
};

/**
 * Each rate is expressed as integer micro-USD for an integer number of
 * billable units. unitsPerRate preserves exact token-block rates without
 * storing fractional micro-USD amounts.
 */
export type SaviProviderRate = {
  id: string;
  provider: string;
  model: string;
  operation: SaviPricingOperation;
  component: SaviProviderRateComponent;
  billingUnit: SaviProviderBillingUnit;
  rateMicros: bigint;
  unitsPerRate: bigint;
  outputModality?: SaviProviderOutputModality;
  resolution?: string;
  requiresUsageForCompleteCost?: boolean;
  effectiveFrom: string;
  effectiveUntil?: string;
  reviewAfter?: string;
  source: SaviProviderRateSource;
  notes?: string;
  metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type SaviProviderAllowance = {
  id: string;
  provider: string;
  modelFamily: string;
  operation: SaviPricingOperation;
  amount: number;
  unit: string;
  scope: 'provider_shared';
  isCustomerEntitlement: false;
  effectiveFrom: string;
  reviewAfter?: string;
  source: SaviProviderRateSource;
  notes: string;
};

export type SaviUnsupportedProviderConfiguration = {
  id: string;
  provider: string;
  model: string;
  operation: SaviPricingOperation;
  resolution?: string;
  effectiveFrom: string;
  source: SaviProviderRateSource;
  reason: string;
};

export type SaviProviderRateCard = {
  version: string;
  status: 'approved' | 'unconfigured';
  effectiveFrom: string;
  reviewAfter?: string;
  source: SaviProviderRateSource;
  rates: readonly SaviProviderRate[];
  allowances: readonly SaviProviderAllowance[];
  unsupportedConfigurations: readonly SaviUnsupportedProviderConfiguration[];
};

const GOOGLE_GEMINI_STANDARD_RATES: readonly SaviProviderRate[] = [
  {
    id: 'gemini-3.1-flash-image-input-standard',
    provider: 'gemini',
    model: 'gemini-3.1-flash-image',
    operation: 'image_generation',
    component: 'input',
    billingUnit: 'per_input_token',
    rateMicros: BigInt(500000),
    unitsPerRate: BigInt(1000000),
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Text and image input is priced at USD 0.50 per one million tokens.'
  },
  {
    id: 'gemini-3.1-flash-image-output-1k-standard',
    provider: 'gemini',
    model: 'gemini-3.1-flash-image',
    operation: 'image_generation',
    component: 'output',
    billingUnit: 'per_generated_image',
    rateMicros: BigInt(67000),
    unitsPerRate: BigInt(1),
    outputModality: 'image',
    resolution: '720',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Documented standard paid equivalent for one 1K image output.',
    metadata: { providerResolution: '1K', outputImageTokens: 1120 }
  },
  {
    id: 'gemini-3.1-flash-image-output-2k-standard',
    provider: 'gemini',
    model: 'gemini-3.1-flash-image',
    operation: 'image_generation',
    component: 'output',
    billingUnit: 'per_generated_image',
    rateMicros: BigInt(101000),
    unitsPerRate: BigInt(1),
    outputModality: 'image',
    resolution: '1080',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Documented standard paid equivalent for one 2K image output.',
    metadata: { providerResolution: '2K', outputImageTokens: 1680 }
  },
  {
    id: 'gemini-3.1-flash-image-output-4k-standard',
    provider: 'gemini',
    model: 'gemini-3.1-flash-image',
    operation: 'image_generation',
    component: 'output',
    billingUnit: 'per_generated_image',
    rateMicros: BigInt(151000),
    unitsPerRate: BigInt(1),
    outputModality: 'image',
    resolution: '4K',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Documented standard paid equivalent for one 4K image output.',
    metadata: { providerResolution: '4K', outputImageTokens: 2520 }
  },
  {
    id: 'gemini-3.1-flash-tts-preview-input-standard',
    provider: 'gemini',
    model: 'gemini-3.1-flash-tts-preview',
    operation: 'speech_generation',
    component: 'input',
    billingUnit: 'per_input_token',
    rateMicros: BigInt(1000000),
    unitsPerRate: BigInt(1000000),
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Text input is priced at USD 1.00 per one million tokens.'
  },
  {
    id: 'gemini-3.1-flash-tts-preview-audio-output-standard',
    provider: 'gemini',
    model: 'gemini-3.1-flash-tts-preview',
    operation: 'speech_generation',
    component: 'output',
    billingUnit: 'per_output_token',
    rateMicros: BigInt(20000000),
    unitsPerRate: BigInt(1000000),
    outputModality: 'audio',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Audio output is priced at USD 20.00 per one million audio tokens.',
    metadata: { audioTokensPerSecond: 25, approximateMicrosPerSecond: 500 }
  },
  {
    id: 'gemini-omni-flash-preview-input-standard',
    provider: 'gemini',
    model: 'gemini-omni-flash-preview',
    operation: 'video_generation',
    component: 'input',
    billingUnit: 'per_input_token',
    rateMicros: BigInt(1500000),
    unitsPerRate: BigInt(1000000),
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Input is priced at USD 1.50 per one million text, image, video, or audio tokens.'
  },
  {
    id: 'gemini-omni-flash-preview-text-output-standard',
    provider: 'gemini',
    model: 'gemini-omni-flash-preview',
    operation: 'video_generation',
    component: 'output',
    billingUnit: 'per_output_token',
    rateMicros: BigInt(9000000),
    unitsPerRate: BigInt(1000000),
    outputModality: 'text',
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Text output is priced at USD 9.00 per one million tokens.'
  },
  {
    id: 'gemini-omni-flash-preview-video-output-standard',
    provider: 'gemini',
    model: 'gemini-omni-flash-preview',
    operation: 'video_generation',
    component: 'output',
    billingUnit: 'per_output_token',
    rateMicros: BigInt(17500000),
    unitsPerRate: BigInt(1000000),
    outputModality: 'video',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Video output is priced at USD 17.50 per one million video tokens.',
    metadata: { videoTokensPerSecondAt720p: 5792, documentedApproximateMicrosPerSecondAt720p: 100000 }
  },
  {
    id: 'veo-3.1-standard-720p-video-output',
    provider: 'gemini',
    model: 'veo-3.1-generate-preview',
    operation: 'video_generation',
    component: 'output',
    billingUnit: 'per_generated_second',
    rateMicros: BigInt(400000),
    unitsPerRate: BigInt(1),
    outputModality: 'video',
    resolution: '720',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Veo 3.1 Standard video with audio.'
  },
  {
    id: 'veo-3.1-standard-1080p-video-output',
    provider: 'gemini',
    model: 'veo-3.1-generate-preview',
    operation: 'video_generation',
    component: 'output',
    billingUnit: 'per_generated_second',
    rateMicros: BigInt(400000),
    unitsPerRate: BigInt(1),
    outputModality: 'video',
    resolution: '1080',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Veo 3.1 Standard video with audio.'
  },
  {
    id: 'veo-3.1-standard-4k-video-output',
    provider: 'gemini',
    model: 'veo-3.1-generate-preview',
    operation: 'video_generation',
    component: 'output',
    billingUnit: 'per_generated_second',
    rateMicros: BigInt(600000),
    unitsPerRate: BigInt(1),
    outputModality: 'video',
    resolution: '4K',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Veo 3.1 Standard video with audio.'
  },
  {
    id: 'veo-3.1-fast-720p-video-output',
    provider: 'gemini',
    model: 'veo-3.1-fast-generate-preview',
    operation: 'video_generation',
    component: 'output',
    billingUnit: 'per_generated_second',
    rateMicros: BigInt(100000),
    unitsPerRate: BigInt(1),
    outputModality: 'video',
    resolution: '720',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Veo 3.1 Fast video with audio.'
  },
  {
    id: 'veo-3.1-fast-1080p-video-output',
    provider: 'gemini',
    model: 'veo-3.1-fast-generate-preview',
    operation: 'video_generation',
    component: 'output',
    billingUnit: 'per_generated_second',
    rateMicros: BigInt(120000),
    unitsPerRate: BigInt(1),
    outputModality: 'video',
    resolution: '1080',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Veo 3.1 Fast video with audio.'
  },
  {
    id: 'veo-3.1-fast-4k-video-output',
    provider: 'gemini',
    model: 'veo-3.1-fast-generate-preview',
    operation: 'video_generation',
    component: 'output',
    billingUnit: 'per_generated_second',
    rateMicros: BigInt(300000),
    unitsPerRate: BigInt(1),
    outputModality: 'video',
    resolution: '4K',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Veo 3.1 Fast video with audio.'
  },
  {
    id: 'veo-3.1-lite-720p-video-output',
    provider: 'gemini',
    model: 'veo-3.1-lite-generate-preview',
    operation: 'video_generation',
    component: 'output',
    billingUnit: 'per_generated_second',
    rateMicros: BigInt(50000),
    unitsPerRate: BigInt(1),
    outputModality: 'video',
    resolution: '720',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Veo 3.1 Lite video with audio.'
  },
  {
    id: 'veo-3.1-lite-1080p-video-output',
    provider: 'gemini',
    model: 'veo-3.1-lite-generate-preview',
    operation: 'video_generation',
    component: 'output',
    billingUnit: 'per_generated_second',
    rateMicros: BigInt(80000),
    unitsPerRate: BigInt(1),
    outputModality: 'video',
    resolution: '1080',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Veo 3.1 Lite video with audio.'
  },
  {
    id: 'gemini-3.x-google-search-grounding-paid',
    provider: 'gemini',
    model: 'gemini-3.x',
    operation: 'search_grounding',
    component: 'grounding',
    billingUnit: 'per_grounding_request',
    rateMicros: BigInt(14000),
    unitsPerRate: BigInt(1),
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Paid marginal rate after the shared Gemini 3.x provider allowance.'
  },
  {
    id: 'gemini-3.6-flash-input-standard-2026',
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    operation: 'text_generation',
    component: 'input',
    billingUnit: 'per_input_token',
    rateMicros: BigInt(750000),
    unitsPerRate: BigInt(1000000),
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    effectiveUntil: '2027-01-01',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Standard paid input price through December 31, 2026.'
  },
  {
    id: 'gemini-3.6-flash-output-standard-2026',
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    operation: 'text_generation',
    component: 'output',
    billingUnit: 'per_output_token',
    rateMicros: BigInt(3750000),
    unitsPerRate: BigInt(1000000),
    outputModality: 'text',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    effectiveUntil: '2027-01-01',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Standard paid output and thinking price through December 31, 2026.'
  },
  {
    id: 'gemini-3.6-flash-input-standard-2027',
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    operation: 'text_generation',
    component: 'input',
    billingUnit: 'per_input_token',
    rateMicros: BigInt(1500000),
    unitsPerRate: BigInt(1000000),
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2027-01-01',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Standard paid input price beginning January 1, 2027.'
  },
  {
    id: 'gemini-3.6-flash-output-standard-2027',
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    operation: 'text_generation',
    component: 'output',
    billingUnit: 'per_output_token',
    rateMicros: BigInt(7500000),
    unitsPerRate: BigInt(1000000),
    outputModality: 'text',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2027-01-01',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Standard paid output and thinking price beginning January 1, 2027.'
  },
  {
    id: 'gemini-2.5-flash-input-standard',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    operation: 'text_generation',
    component: 'input',
    billingUnit: 'per_input_token',
    rateMicros: BigInt(300000),
    unitsPerRate: BigInt(1000000),
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Standard paid text, image, and video input price.'
  },
  {
    id: 'gemini-2.5-flash-output-standard',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    operation: 'text_generation',
    component: 'output',
    billingUnit: 'per_output_token',
    rateMicros: BigInt(2500000),
    unitsPerRate: BigInt(1000000),
    outputModality: 'text',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Standard paid output and thinking price.'
  },
  {
    id: 'gemini-2.5-flash-lite-input-standard',
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    operation: 'text_generation',
    component: 'input',
    billingUnit: 'per_input_token',
    rateMicros: BigInt(100000),
    unitsPerRate: BigInt(1000000),
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Standard paid text, image, and video input price.'
  },
  {
    id: 'gemini-2.5-flash-lite-output-standard',
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    operation: 'text_generation',
    component: 'output',
    billingUnit: 'per_output_token',
    rateMicros: BigInt(400000),
    unitsPerRate: BigInt(1000000),
    outputModality: 'text',
    requiresUsageForCompleteCost: true,
    effectiveFrom: '2026-09-06',
    reviewAfter: '2026-12-31',
    source: GOOGLE_GEMINI_PRICING_SOURCE,
    notes: 'Standard paid output and thinking price.'
  }
];

/**
 * Approved Google Gemini rate card. Adding an entry here does not migrate a
 * tool into SAVI's authoritative credit lifecycle; quoteSaviPrice remains the
 * sole gate for live billing.
 */
export const SAVI_PROVIDER_RATE_CARD: SaviProviderRateCard = {
  version: SAVI_PROVIDER_RATE_CARD_VERSION,
  status: 'approved',
  effectiveFrom: '2026-09-06',
  reviewAfter: '2026-12-31',
  source: GOOGLE_GEMINI_PRICING_SOURCE,
  rates: GOOGLE_GEMINI_STANDARD_RATES,
  allowances: [
    {
      id: 'gemini-3.x-google-search-shared-monthly-allowance',
      provider: 'gemini',
      modelFamily: 'gemini-3.x',
      operation: 'search_grounding',
      amount: 5000,
      unit: 'search_requests_per_month',
      scope: 'provider_shared',
      isCustomerEntitlement: false,
      effectiveFrom: '2026-09-06',
      reviewAfter: '2026-12-31',
      source: GOOGLE_GEMINI_PRICING_SOURCE,
      notes: 'Shared provider allowance only; it is never a guaranteed SAVI customer entitlement.'
    }
  ],
  unsupportedConfigurations: [
    {
      id: 'veo-3.1-lite-4k-unsupported',
      provider: 'gemini',
      model: 'veo-3.1-lite-generate-preview',
      operation: 'video_generation',
      resolution: '4K',
      effectiveFrom: '2026-09-06',
      source: GOOGLE_GEMINI_PRICING_SOURCE,
      reason: 'Google documents that 4K output is not supported for Veo 3.1 Lite.'
    }
  ]
};

/**
 * Non-live Phase 4 policy references. These are not quote rules and do not
 * migrate any legacy tool into the production credit lifecycle.
 */
export const SAVI_V1_FUTURE_ECONOMICS_POLICY = {
  targetApiLevelGrossMarginBasisPoints: {
    image: { minimum: 6000, maximum: 7000 },
    video: { minimum: 6500, maximum: 7500 },
    voice: { minimum: 6000, maximum: 7000 }
  },
  text: { approach: 'server_fair_use_or_minimum_charge' },
  video: {
    currentOmniFlashCreditsPerGeneratedSecond: 250,
    requiresRealModelTierMapping: true
  },
  voice: {
    minimumCredits: 25,
    referenceCreditsByApproximateMinutes: { 1: 35, 5: 175, 10: 350 },
    requiresProviderBillableMetric: true
  },
  localPdf: {
    merge: 25,
    organize: 35,
    split: 25,
    extract: 30,
    pdfToJpg: 45,
    providerCostCanBeZero: true
  },
  aiPdf: {
    summarizeMinimum: 25,
    explainMinimum: 25,
    translateAndSummarizeMinimum: 35,
    requiresBoundedUsageEstimate: true
  },
  askSavi: { approach: 'free_with_server_side_fair_use' },
  searchGrounding: { approach: 'provider_cost_aware_usage_based_policy' }
} as const;

export type SaviPricingRequest = {
  provider: string;
  model: string;
  toolId: string;
  operation: SaviPricingOperation;
  input?: {
    textCharacters?: number;
    inputTokens?: number;
    referenceImageCount?: number;
    pageCount?: number;
    groundingRequestCount?: number;
  };
  output?: {
    outputTokens?: number;
    imageCount?: number;
    resolution?: string;
    aspectRatio?: string;
    outputModality?: SaviProviderOutputModality;
    videoSeconds?: number;
    audioSeconds?: number;
  };
};

export type SaviProviderCostComponent = {
  rateId: string;
  component: SaviProviderRateComponent;
  billingUnit: SaviProviderBillingUnit;
  amountMicros: bigint | null;
  status: 'estimated' | 'unknown_usage';
};

export type SaviProviderCost = {
  currency: typeof SAVI_PROVIDER_COST_CURRENCY;
  unit: typeof SAVI_PROVIDER_COST_UNIT;
  fixedMicros: bigint | null;
  variableMicros: bigint | null;
  /**
   * Known subtotal. When costCompleteness is partial this excludes explicitly
   * unknown components, rather than pretending to be an exact provider invoice.
   */
  estimatedTotalMicros: bigint | null;
  status: 'estimated' | 'partial_estimate' | 'unconfigured';
  costCompleteness: 'complete' | 'partial' | 'unconfigured';
  unknownCostComponents: readonly string[];
  components: readonly SaviProviderCostComponent[];
  rateCardVersion: string;
  rateBillingUnit: SaviProviderBillingUnit | null;
  rateEffectiveFrom: string | null;
  rateEffectiveUntil: string | null;
  rateReviewAfter: string | null;
  rateSourceReference: string | null;
  rateSourceReferences: readonly string[];
  unconfiguredReason: string | null;
};

export type SaviPricingQuote = {
  pricingVersion: string;
  provisional: boolean;
  provider: string;
  model: string;
  toolId: string;
  operation: SaviPricingOperation;
  saviCredits: number;
  minimumSaviCredits?: number;
  saviCreditComponents: {
    fixedCredits?: number;
    variableCredits?: number;
  };
  providerCost: SaviProviderCost;
  pricingInput: {
    referenceImageCount: number;
    imageCount: number;
    resolution: string | null;
    aspectRatio: string | null;
    videoSeconds: number;
    audioSeconds: number;
    textCharacters: number;
    pageCount: number;
  };
};

export type SaviMarginAnalysis = {
  nominalRetailValueMicros: bigint;
  estimatedProviderCostMicros: bigint | null;
  estimatedApiLevelGrossRemainderMicros: bigint | null;
  estimatedApiLevelGrossMarginBasisPoints: bigint | null;
  providerCostCompleteness: SaviProviderCost['costCompleteness'];
};

export class SaviPricingError extends Error {
  constructor(
    readonly category: 'INVALID_PRICING_INPUT' | 'PRICING_NOT_CONFIGURED',
    readonly status: 400 | 503,
    message: string
  ) {
    super(message);
    this.name = 'SaviPricingError';
  }
}

function assertWholeNumber(value: unknown, fallback: number, label: string) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, `Invalid ${label} for pricing.`);
  }
  return value;
}

function integerUnits(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
  return BigInt(value);
}

function isRateActive(rate: SaviProviderRate, asOf: string) {
  return rate.effectiveFrom <= asOf && (!rate.effectiveUntil || asOf < rate.effectiveUntil);
}

function estimatedVideoOutputTokenUnits(request: SaviPricingRequest, rate: SaviProviderRate) {
  if (
    request.operation !== 'video_generation' ||
    rate.outputModality !== 'video' ||
    request.output?.resolution !== '720' ||
    rate.metadata?.videoTokensPerSecondAt720p === undefined ||
    typeof rate.metadata.videoTokensPerSecondAt720p !== 'number' ||
    !Number.isSafeInteger(rate.metadata.videoTokensPerSecondAt720p) ||
    rate.metadata.videoTokensPerSecondAt720p <= 0
  ) {
    return null;
  }

  const videoSeconds = integerUnits(request.output?.videoSeconds);
  return videoSeconds === null ? null : videoSeconds * BigInt(rate.metadata.videoTokensPerSecondAt720p);
}

function providerUnitsFor(request: SaviPricingRequest, rate: SaviProviderRate) {
  switch (rate.billingUnit) {
    case 'per_operation':
      return BigInt(1);
    case 'per_generated_image':
      return integerUnits(request.output?.imageCount);
    case 'per_input_token':
      return integerUnits(request.input?.inputTokens);
    case 'per_output_token':
      return integerUnits(request.output?.outputTokens) ?? estimatedVideoOutputTokenUnits(request, rate);
    case 'per_generated_second':
      return integerUnits(request.output?.videoSeconds);
    case 'per_audio_second':
      return integerUnits(request.output?.audioSeconds);
    case 'per_input_character':
      return integerUnits(request.input?.textCharacters);
    case 'per_document_page':
      return integerUnits(request.input?.pageCount);
    case 'per_grounding_request':
      return integerUnits(request.input?.groundingRequestCount);
  }
}

function usesEstimatedVideoOutputTokens(request: SaviPricingRequest, rate: SaviProviderRate) {
  return (
    rate.billingUnit === 'per_output_token' &&
    rate.outputModality === 'video' &&
    integerUnits(request.output?.outputTokens) === null &&
    estimatedVideoOutputTokenUnits(request, rate) !== null
  );
}

function ceilDivide(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - BigInt(1)) / denominator;
}

function rateApplies(rate: SaviProviderRate, request: SaviPricingRequest, asOf: string) {
  if (
    rate.provider !== request.provider ||
    rate.model !== request.model ||
    rate.operation !== request.operation ||
    !isRateActive(rate, asOf)
  ) {
    return false;
  }

  if (rate.resolution && rate.resolution !== request.output?.resolution) return false;
  if (rate.outputModality && rate.outputModality !== request.output?.outputModality) return false;
  return true;
}

function unsupportedConfigurationFor(request: SaviPricingRequest) {
  return SAVI_PROVIDER_RATE_CARD.unsupportedConfigurations.find(
    (configuration) =>
      configuration.provider === request.provider &&
      configuration.model === request.model &&
      configuration.operation === request.operation &&
      (!configuration.resolution || configuration.resolution === request.output?.resolution)
  );
}

function unconfiguredProviderCost(reason: string): SaviProviderCost {
  return {
    currency: SAVI_PROVIDER_COST_CURRENCY,
    unit: SAVI_PROVIDER_COST_UNIT,
    fixedMicros: null,
    variableMicros: null,
    estimatedTotalMicros: null,
    status: 'unconfigured',
    costCompleteness: 'unconfigured',
    unknownCostComponents: [],
    components: [],
    rateCardVersion: SAVI_PROVIDER_RATE_CARD.version,
    rateBillingUnit: null,
    rateEffectiveFrom: null,
    rateEffectiveUntil: null,
    rateReviewAfter: null,
    rateSourceReference: SAVI_PROVIDER_RATE_CARD.source.reference,
    rateSourceReferences: [SAVI_PROVIDER_RATE_CARD.source.reference],
    unconfiguredReason: reason
  };
}

/**
 * Computes internal provider-cost information only. It never reserves SAVI
 * credits, invokes a provider, or confers a customer-facing price.
 */
export function estimateSaviProviderCost(request: SaviPricingRequest): SaviProviderCost {
  const unsupported = unsupportedConfigurationFor(request);
  if (unsupported) {
    return unconfiguredProviderCost(unsupported.reason);
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const matchingRates = SAVI_PROVIDER_RATE_CARD.rates.filter((rate) => rateApplies(rate, request, asOf));
  if (!matchingRates.length) {
    return unconfiguredProviderCost('No active provider rate matches this provider, model, operation, and configuration.');
  }

  let fixedMicros = BigInt(0);
  let variableMicros = BigInt(0);
  let knownSubtotalMicros = BigInt(0);
  let hasKnownCost = false;
  const unknownCostComponents: string[] = [];
  const components: SaviProviderCostComponent[] = [];

  for (const rate of matchingRates) {
    const units = providerUnitsFor(request, rate);
    if (units === null) {
      if (rate.requiresUsageForCompleteCost) unknownCostComponents.push(rate.id);
      components.push({
        rateId: rate.id,
        component: rate.component,
        billingUnit: rate.billingUnit,
        amountMicros: null,
        status: 'unknown_usage'
      });
      continue;
    }

    const amountMicros = ceilDivide(rate.rateMicros * units, rate.unitsPerRate);
    if (rate.requiresUsageForCompleteCost && usesEstimatedVideoOutputTokens(request, rate)) {
      // The current Omni quote is based on its documented 720p token-per-second
      // baseline until provider usage arrives. Keep this explicitly partial.
      unknownCostComponents.push(`${rate.id}:estimated_from_video_seconds`);
    }
    knownSubtotalMicros += amountMicros;
    hasKnownCost = true;
    if (rate.billingUnit === 'per_operation') {
      fixedMicros += amountMicros;
    } else {
      variableMicros += amountMicros;
    }
    components.push({
      rateId: rate.id,
      component: rate.component,
      billingUnit: rate.billingUnit,
      amountMicros,
      status: 'estimated'
    });
  }

  if (!hasKnownCost) {
    return unconfiguredProviderCost('Provider rates exist, but required billable usage is not available for an estimate.');
  }

  const rateSourceReferences = matchingRates
    .map((rate) => rate.source.reference)
    .filter((reference, index, references) => references.indexOf(reference) === index);
  const primaryRate = matchingRates[0];
  const hasUnknownCost = unknownCostComponents.length > 0;
  return {
    currency: SAVI_PROVIDER_COST_CURRENCY,
    unit: SAVI_PROVIDER_COST_UNIT,
    fixedMicros,
    variableMicros,
    estimatedTotalMicros: knownSubtotalMicros,
    status: hasUnknownCost ? 'partial_estimate' : 'estimated',
    costCompleteness: hasUnknownCost ? 'partial' : 'complete',
    unknownCostComponents,
    components,
    rateCardVersion: SAVI_PROVIDER_RATE_CARD.version,
    rateBillingUnit: primaryRate.billingUnit,
    rateEffectiveFrom: primaryRate.effectiveFrom,
    rateEffectiveUntil: primaryRate.effectiveUntil ?? null,
    rateReviewAfter: primaryRate.reviewAfter ?? null,
    rateSourceReference: primaryRate.source.reference,
    rateSourceReferences,
    unconfiguredReason: null
  };
}

function quoteTextToImage(request: SaviPricingRequest): SaviPricingQuote {
  if (request.provider !== SAVI_TEXT_TO_IMAGE_PROVIDER || request.model !== SAVI_TEXT_TO_IMAGE_DEFAULT_MODEL) {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This image model is not priced yet. No credits were used.');
  }

  if (request.operation !== 'image_generation' || request.toolId !== 'text_to_image') {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This SAVI operation does not have a valid pricing rule.');
  }

  const resolution = request.output?.resolution;
  const aspectRatio = request.output?.aspectRatio;
  const imageCount = assertWholeNumber(request.output?.imageCount, 1, 'image count');
  const referenceImageCount = assertWholeNumber(request.input?.referenceImageCount, 0, 'reference image count');

  if (!isTextToImageQuality(resolution)) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Unsupported image quality for pricing.');
  }
  if (!isTextToImageAspectRatio(aspectRatio)) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Unsupported image aspect ratio for pricing.');
  }
  if (imageCount !== 1 || referenceImageCount > 3) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Unsupported image configuration for pricing.');
  }

  const saviCredits = getTextToImageCreditEstimate(resolution);
  const providerCost = estimateSaviProviderCost({
    ...request,
    output: {
      ...request.output,
      imageCount,
      outputModality: 'image'
    }
  });

  if (providerCost.status === 'unconfigured') {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This image configuration does not have an approved provider rate.');
  }

  return {
    pricingVersion: TEXT_TO_IMAGE_PRICING_VERSION,
    provisional: false,
    provider: request.provider,
    model: request.model,
    toolId: request.toolId,
    operation: request.operation,
    saviCredits,
    minimumSaviCredits: getTextToImageCreditEstimate('720'),
    saviCreditComponents: {
      fixedCredits: getTextToImageCreditEstimate('720'),
      variableCredits: saviCredits - getTextToImageCreditEstimate('720')
    },
    providerCost,
    pricingInput: {
      referenceImageCount,
      imageCount,
      resolution,
      aspectRatio,
      videoSeconds: 0,
      audioSeconds: 0,
      textCharacters: 0,
      pageCount: 0
    }
  };
}

function hasId(values: readonly string[], value: string) {
  return values.includes(value);
}

function zeroExternalProviderCost(): SaviProviderCost {
  return {
    currency: SAVI_PROVIDER_COST_CURRENCY,
    unit: SAVI_PROVIDER_COST_UNIT,
    fixedMicros: BigInt(0),
    variableMicros: BigInt(0),
    estimatedTotalMicros: BigInt(0),
    status: 'estimated',
    costCompleteness: 'complete',
    unknownCostComponents: [],
    components: [],
    rateCardVersion: SAVI_PROVIDER_RATE_CARD.version,
    rateBillingUnit: 'per_operation',
    rateEffectiveFrom: SAVI_PROVIDER_RATE_CARD.effectiveFrom,
    rateEffectiveUntil: null,
    rateReviewAfter: SAVI_PROVIDER_RATE_CARD.reviewAfter ?? null,
    rateSourceReference: 'No external model provider is used for this local SAVI operation.',
    rateSourceReferences: ['No external model provider is used for this local SAVI operation.'],
    unconfiguredReason: null
  };
}

function estimatedTextTokens(characters: number) {
  return Math.max(1, Math.ceil(characters / 4));
}

function basePricingInput(input: {
  referenceImageCount?: number;
  imageCount?: number;
  resolution?: string | null;
  aspectRatio?: string | null;
  videoSeconds?: number;
  audioSeconds?: number;
  textCharacters?: number;
  pageCount?: number;
}) {
  return {
    referenceImageCount: input.referenceImageCount ?? 0,
    imageCount: input.imageCount ?? 0,
    resolution: input.resolution ?? null,
    aspectRatio: input.aspectRatio ?? null,
    videoSeconds: input.videoSeconds ?? 0,
    audioSeconds: input.audioSeconds ?? 0,
    textCharacters: input.textCharacters ?? 0,
    pageCount: input.pageCount ?? 0
  };
}

function protectedQuote(input: {
  request: SaviPricingRequest;
  credits: number;
  minimumCredits?: number;
  components?: SaviPricingQuote['saviCreditComponents'];
  providerCost: SaviProviderCost;
  pricingInput: SaviPricingQuote['pricingInput'];
}) {
  return {
    pricingVersion: SAVI_RETAIL_PRICING_VERSION,
    provisional: false,
    provider: input.request.provider,
    model: input.request.model,
    toolId: input.request.toolId,
    operation: input.request.operation,
    saviCredits: input.credits,
    minimumSaviCredits: input.minimumCredits,
    saviCreditComponents: input.components ?? { fixedCredits: input.credits },
    providerCost: input.providerCost,
    pricingInput: input.pricingInput
  } satisfies SaviPricingQuote;
}

function quoteConfiguredImageTool(request: SaviPricingRequest): SaviPricingQuote {
  if (request.provider !== SAVI_TEXT_TO_IMAGE_PROVIDER || request.model !== SAVI_TEXT_TO_IMAGE_DEFAULT_MODEL) {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This image model is not priced yet. No credits were used.');
  }
  if (request.operation !== 'image_generation' || !hasId(SAVI_IMAGE_GENERATION_TOOL_IDS, request.toolId) || request.toolId === 'text_to_image') {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This SAVI image operation does not have a valid pricing rule.');
  }

  const resolution = request.output?.resolution;
  const aspectRatio = request.output?.aspectRatio;
  const imageCount = assertWholeNumber(request.output?.imageCount, 1, 'image count');
  const referenceImageCount = assertWholeNumber(request.input?.referenceImageCount, 0, 'reference image count');
  const maxReferences = request.toolId === 'visual_mixer' ? 6 : request.toolId === 'mockup' ? 2 : 3;

  if (!isTextToImageQuality(resolution) || !isTextToImageAspectRatio(aspectRatio)) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Unsupported image configuration for pricing.');
  }
  if (imageCount !== 1 || referenceImageCount > maxReferences) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Unsupported output or reference image count for pricing.');
  }

  const providerCost = estimateSaviProviderCost({
    ...request,
    output: { ...request.output, imageCount, resolution, aspectRatio, outputModality: 'image' }
  });
  if (providerCost.status === 'unconfigured') {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This image configuration does not have an approved provider rate.');
  }

  const credits = getTextToImageCreditEstimate(resolution);
  return protectedQuote({
    request,
    credits,
    minimumCredits: getTextToImageCreditEstimate('720'),
    components: { fixedCredits: getTextToImageCreditEstimate('720'), variableCredits: credits - getTextToImageCreditEstimate('720') },
    providerCost,
    pricingInput: basePricingInput({ referenceImageCount, imageCount, resolution, aspectRatio })
  });
}

function quoteImageTextTool(request: SaviPricingRequest): SaviPricingQuote {
  if (request.provider !== SAVI_TEXT_TO_IMAGE_PROVIDER || request.model !== SAVI_TEXT_DEFAULT_MODEL || request.operation !== 'text_generation' || !hasId(SAVI_IMAGE_TEXT_TOOL_IDS, request.toolId)) {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This SAVI text operation does not have a valid pricing rule.');
  }

  const textCharacters = assertWholeNumber(request.input?.textCharacters, 0, 'text length');
  const referenceImageCount = assertWholeNumber(request.input?.referenceImageCount, 0, 'reference image count');
  if (!textCharacters || textCharacters > 4000 || referenceImageCount > 1) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Unsupported text generation input.');
  }

  const providerCost = estimateSaviProviderCost({
    ...request,
    input: { ...request.input, inputTokens: estimatedTextTokens(textCharacters), referenceImageCount },
    output: { ...request.output, outputTokens: 900, outputModality: 'text' }
  });
  if (providerCost.status === 'unconfigured') {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This text model does not have an approved provider rate.');
  }

  return protectedQuote({
    request,
    credits: 3,
    minimumCredits: 3,
    providerCost,
    pricingInput: basePricingInput({ referenceImageCount, textCharacters })
  });
}

function quoteVideoTool(request: SaviPricingRequest): SaviPricingQuote {
  if (request.provider !== SAVI_TEXT_TO_IMAGE_PROVIDER || request.model !== SAVI_VIDEO_DEFAULT_MODEL || request.operation !== 'video_generation' || !hasId(SAVI_VIDEO_TOOL_IDS, request.toolId)) {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This video model is not priced yet. No credits were used.');
  }

  const duration = assertWholeNumber(request.output?.videoSeconds, 0, 'video duration');
  const referenceImageCount = assertWholeNumber(request.input?.referenceImageCount, 0, 'reference count');
  const resolution = request.output?.resolution;
  if (![4, 6, 8].includes(duration) || resolution !== '720' || referenceImageCount > 3) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Unsupported current Omni video configuration.');
  }

  const providerCost = estimateSaviProviderCost({
    ...request,
    output: { ...request.output, videoSeconds: duration, resolution, outputModality: 'video' }
  });
  if (providerCost.status === 'unconfigured') {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This video configuration does not have an approved provider rate.');
  }

  const credits = duration * SAVI_V1_FUTURE_ECONOMICS_POLICY.video.currentOmniFlashCreditsPerGeneratedSecond;
  return protectedQuote({
    request,
    credits,
    minimumCredits: SAVI_V1_FUTURE_ECONOMICS_POLICY.video.currentOmniFlashCreditsPerGeneratedSecond * 4,
    components: { variableCredits: credits },
    providerCost,
    pricingInput: basePricingInput({ referenceImageCount, resolution, videoSeconds: duration })
  });
}

function quoteVoiceTool(request: SaviPricingRequest): SaviPricingQuote {
  if (request.provider !== SAVI_TEXT_TO_IMAGE_PROVIDER || request.model !== SAVI_TTS_DEFAULT_MODEL || request.operation !== 'speech_generation' || !hasId(SAVI_VOICE_TOOL_IDS, request.toolId)) {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This voice model is not priced yet. No credits were used.');
  }

  const textCharacters = assertWholeNumber(request.input?.textCharacters, 0, 'script length');
  const audioSeconds = assertWholeNumber(request.output?.audioSeconds, 0, 'audio duration');
  if (!textCharacters || textCharacters > 12000 || !audioSeconds || audioSeconds > 1200) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Unsupported voice generation input.');
  }

  const providerCost = estimateSaviProviderCost({
    ...request,
    input: { ...request.input, inputTokens: estimatedTextTokens(textCharacters) },
    output: { ...request.output, audioSeconds, outputTokens: audioSeconds * 25, outputModality: 'audio' }
  });
  if (providerCost.status === 'unconfigured') {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This voice configuration does not have an approved provider rate.');
  }

  const credits = Math.max(
    SAVI_V1_FUTURE_ECONOMICS_POLICY.voice.minimumCredits,
    Math.ceil((audioSeconds * SAVI_V1_FUTURE_ECONOMICS_POLICY.voice.referenceCreditsByApproximateMinutes[1]) / 60)
  );
  return protectedQuote({
    request,
    credits,
    minimumCredits: SAVI_V1_FUTURE_ECONOMICS_POLICY.voice.minimumCredits,
    components: { fixedCredits: SAVI_V1_FUTURE_ECONOMICS_POLICY.voice.minimumCredits, variableCredits: credits - SAVI_V1_FUTURE_ECONOMICS_POLICY.voice.minimumCredits },
    providerCost,
    pricingInput: basePricingInput({ textCharacters, audioSeconds })
  });
}

const LOCAL_PDF_CREDITS: Record<string, number> = {
  merge_pdf: 25,
  organize_pdf: 35,
  split_pdf: 25,
  extract_images: 30,
  pdf_to_jpg: 45
};

function quoteLocalPdfTool(request: SaviPricingRequest): SaviPricingQuote {
  const localOperation = request.provider === SAVI_LOCAL_PDF_PROVIDER && request.model === SAVI_LOCAL_PDF_MODEL;
  const ilovePdfOperation = request.toolId === 'pdf_to_jpg' && request.provider === SAVI_ILOVEPDF_PROVIDER && request.model === SAVI_ILOVEPDF_PDF_TO_JPG_MODEL;
  if ((!localOperation && !ilovePdfOperation) || request.operation !== 'document_local' || !hasId(SAVI_LOCAL_PDF_TOOL_IDS, request.toolId)) {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This local PDF operation does not have a valid pricing rule.');
  }
  const pageCount = assertWholeNumber(request.input?.pageCount, 0, 'PDF page count');
  if (!pageCount || pageCount > 500) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Unsupported PDF page count.');
  }
  const credits = LOCAL_PDF_CREDITS[request.toolId];
  if (!credits) throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This local PDF operation does not have a valid pricing rule.');
  return protectedQuote({
    request,
    credits,
    minimumCredits: credits,
    providerCost: zeroExternalProviderCost(),
    pricingInput: basePricingInput({ pageCount })
  });
}

const AI_PDF_PRICING: Record<string, { minimum: number; includedPages: number; additionalCreditsPerPage: number; outputTokensPerPage: number }> = {
  contract_summary: { minimum: 25, includedPages: 10, additionalCreditsPerPage: 2, outputTokensPerPage: 140 },
  explain_document: { minimum: 25, includedPages: 10, additionalCreditsPerPage: 2, outputTokensPerPage: 140 },
  translate_summary: { minimum: 35, includedPages: 10, additionalCreditsPerPage: 3, outputTokensPerPage: 1200 },
  pdf_podcast: { minimum: 25, includedPages: 10, additionalCreditsPerPage: 2, outputTokensPerPage: 180 }
};

function quoteAiPdfTool(request: SaviPricingRequest): SaviPricingQuote {
  if (request.provider !== SAVI_TEXT_TO_IMAGE_PROVIDER || request.model !== SAVI_TEXT_DEFAULT_MODEL || request.operation !== 'document_ai' || !hasId(SAVI_AI_PDF_TOOL_IDS, request.toolId)) {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This AI document model is not priced yet. No credits were used.');
  }
  const pageCount = assertWholeNumber(request.input?.pageCount, 0, 'PDF page count');
  const textCharacters = assertWholeNumber(request.input?.textCharacters, 0, 'PDF input size');
  if (!pageCount || pageCount > 80 || !textCharacters || textCharacters > 25 * 1024 * 1024) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Unsupported AI PDF input.');
  }

  const policy = AI_PDF_PRICING[request.toolId];
  if (!policy) throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This AI document operation does not have a valid pricing rule.');
  const additionalPages = Math.max(0, pageCount - policy.includedPages);
  const credits = policy.minimum + additionalPages * policy.additionalCreditsPerPage;
  const estimatedInputTokens = Math.max(estimatedTextTokens(textCharacters), pageCount * 2000);
  const estimatedOutputTokens = Math.max(800, pageCount * policy.outputTokensPerPage);
  const providerCost = estimateSaviProviderCost({
    ...request,
    operation: 'text_generation',
    input: { ...request.input, inputTokens: estimatedInputTokens },
    output: { ...request.output, outputTokens: estimatedOutputTokens, outputModality: 'text' }
  });
  if (providerCost.status === 'unconfigured') {
    throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This AI document model does not have an approved provider rate.');
  }

  return protectedQuote({
    request,
    credits,
    minimumCredits: policy.minimum,
    components: { fixedCredits: policy.minimum, variableCredits: credits - policy.minimum },
    providerCost,
    pricingInput: basePricingInput({ pageCount, textCharacters })
  });
}

/**
 * Server pricing entry point. Unknown providers, models, tools, or settings
 * always fail before a reservation or provider request can occur.
 */
export function quoteSaviPrice(request: SaviPricingRequest): SaviPricingQuote {
  if (request.toolId === 'text_to_image') return quoteTextToImage(request);
  if (hasId(SAVI_IMAGE_GENERATION_TOOL_IDS, request.toolId)) return quoteConfiguredImageTool(request);
  if (hasId(SAVI_IMAGE_TEXT_TOOL_IDS, request.toolId)) return quoteImageTextTool(request);
  if (hasId(SAVI_VIDEO_TOOL_IDS, request.toolId)) return quoteVideoTool(request);
  if (hasId(SAVI_VOICE_TOOL_IDS, request.toolId)) return quoteVoiceTool(request);
  if (hasId(SAVI_LOCAL_PDF_TOOL_IDS, request.toolId)) return quoteLocalPdfTool(request);
  if (hasId(SAVI_AI_PDF_TOOL_IDS, request.toolId)) return quoteAiPdfTool(request);
  throw new SaviPricingError('PRICING_NOT_CONFIGURED', 503, 'This SAVI operation does not have a valid pricing rule.');
}

/** Internal-only API-level gross analysis. It intentionally excludes operating costs and profit claims. */
export function calculateSaviMarginAnalysis(quote: Pick<SaviPricingQuote, 'saviCredits' | 'providerCost'>): SaviMarginAnalysis {
  if (!Number.isSafeInteger(quote.saviCredits) || quote.saviCredits < 0) {
    throw new SaviPricingError('INVALID_PRICING_INPUT', 400, 'Invalid SAVI credit value for margin analysis.');
  }

  const nominalRetailValueMicros = BigInt(quote.saviCredits) * SAVI_NOMINAL_RETAIL_MICROS_PER_CREDIT;
  const estimatedProviderCostMicros = quote.providerCost.estimatedTotalMicros;
  if (estimatedProviderCostMicros === null) {
    return {
      nominalRetailValueMicros,
      estimatedProviderCostMicros: null,
      estimatedApiLevelGrossRemainderMicros: null,
      estimatedApiLevelGrossMarginBasisPoints: null,
      providerCostCompleteness: quote.providerCost.costCompleteness
    };
  }

  const estimatedApiLevelGrossRemainderMicros = nominalRetailValueMicros - estimatedProviderCostMicros;
  const estimatedApiLevelGrossMarginBasisPoints =
    nominalRetailValueMicros === BigInt(0)
      ? null
      : (estimatedApiLevelGrossRemainderMicros * BigInt(10000)) / nominalRetailValueMicros;

  return {
    nominalRetailValueMicros,
    estimatedProviderCostMicros,
    estimatedApiLevelGrossRemainderMicros,
    estimatedApiLevelGrossMarginBasisPoints,
    providerCostCompleteness: quote.providerCost.costCompleteness
  };
}

/** Converts bigint monetary fields into safe strings for JSON ledger metadata. */
export function serializeSaviPricingMetadata(quote: SaviPricingQuote) {
  return {
    pricingVersion: quote.pricingVersion,
    provisional: quote.provisional,
    saviCredits: quote.saviCredits,
    minimumSaviCredits: quote.minimumSaviCredits ?? null,
    saviCreditComponents: quote.saviCreditComponents,
    providerCost: {
      currency: quote.providerCost.currency,
      unit: quote.providerCost.unit,
      fixedMicros: quote.providerCost.fixedMicros?.toString() ?? null,
      variableMicros: quote.providerCost.variableMicros?.toString() ?? null,
      estimatedTotalMicros: quote.providerCost.estimatedTotalMicros?.toString() ?? null,
      status: quote.providerCost.status,
      costCompleteness: quote.providerCost.costCompleteness,
      unknownCostComponents: quote.providerCost.unknownCostComponents,
      components: quote.providerCost.components.map((component) => ({
        ...component,
        amountMicros: component.amountMicros?.toString() ?? null
      })),
      rateCardVersion: quote.providerCost.rateCardVersion,
      rateBillingUnit: quote.providerCost.rateBillingUnit,
      rateEffectiveFrom: quote.providerCost.rateEffectiveFrom,
      rateEffectiveUntil: quote.providerCost.rateEffectiveUntil,
      rateReviewAfter: quote.providerCost.rateReviewAfter,
      rateSourceReference: quote.providerCost.rateSourceReference,
      rateSourceReferences: quote.providerCost.rateSourceReferences,
      unconfiguredReason: quote.providerCost.unconfiguredReason
    },
    pricingInput: quote.pricingInput
  };
}

/** Converts internal margin analysis to JSON-safe strings without exposing it to customer UI. */
export function serializeSaviMarginAnalysis(analysis: SaviMarginAnalysis) {
  return {
    nominalRetailValueMicros: analysis.nominalRetailValueMicros.toString(),
    estimatedProviderCostMicros: analysis.estimatedProviderCostMicros?.toString() ?? null,
    estimatedApiLevelGrossRemainderMicros: analysis.estimatedApiLevelGrossRemainderMicros?.toString() ?? null,
    estimatedApiLevelGrossMarginBasisPoints: analysis.estimatedApiLevelGrossMarginBasisPoints?.toString() ?? null,
    providerCostCompleteness: analysis.providerCostCompleteness
  };
}

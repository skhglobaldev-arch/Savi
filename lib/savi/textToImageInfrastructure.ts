import { randomUUID } from 'node:crypto';
import { type SaviUser } from '@/lib/auth/session';
import { getSaviDataConnect, getSaviPrivateBucket } from '@/lib/firebase/admin';
import {
  quoteSaviPrice,
  SaviPricingError,
  serializeSaviPricingMetadata,
  type SaviPricingQuote
} from '@/lib/pricing/saviPricing';
import type { TextToImageAspectRatio, TextToImageQuality } from '@/lib/pricing/textToImageCatalog';

const DEVELOPMENT_INITIAL_CREDITS = 20_000;
const CLIENT_REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;
const UUID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export type SaviFailureCategory =
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_SERVER_ERROR'
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_INPUT'
  | 'POLICY_REJECTION'
  | 'INSUFFICIENT_CREDITS'
  | 'STORAGE_FAILURE'
  | 'AUTH_REQUIRED'
  | 'PRICING_NOT_CONFIGURED'
  | 'INTERNAL_ERROR';

export class SaviInfrastructureError extends Error {
  constructor(
    readonly category: SaviFailureCategory,
    readonly status: number,
    message: string,
    readonly providerRequestId?: string
  ) {
    super(message);
    this.name = 'SaviInfrastructureError';
  }
}

type DatabaseUser = {
  id: string;
  provider: string;
  providerSubject: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  status: string;
};

type CreditAccount = {
  id: string;
  userId: string;
  availableCredits: number;
  reservedCredits: number;
};

export type AuthoritativeCreditBalance = {
  availableCredits: number;
};

type GenerationJob = {
  id: string;
  userId: string;
  toolId: string;
  provider: string;
  model: string;
  status: string;
  reservedCredits: number;
  finalCredits: number;
  clientRequestId: string;
  providerRequestId?: string | null;
  retryCount: number;
  failureCategory?: string | null;
  failureMessage?: string | null;
  usageMetadata?: string | null;
};

export type PrivateAsset = {
  id: string;
  userId: string;
  jobId: string;
  toolId: string;
  mediaType: string;
  mimeType: string;
  storagePath: string;
  filename: string;
  sizeBytes?: number | null;
  status: string;
  creditCost: number;
};

export type GeneratedImageOutput = {
  image: string;
  filename: string;
  mimeType: string;
  mode: 'gemini';
  providerRequestId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

type StoredAsset = {
  assetId: string;
  storagePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

type Reservation = {
  jobId: string;
  reservationId: string;
  credits: number;
  pricing: SaviPricingQuote;
};

type ExistingJobResult =
  | {
      state: 'completed';
      asset: PrivateAsset;
      mode: GeneratedImageOutput['mode'];
    }
  | {
      state: 'processing';
      jobId: string;
    }
  | null;

type ReusableJobResult = Exclude<ExistingJobResult, null>;

export type ProtectedTextToImageResult =
  | {
      state: 'completed';
      jobId: string;
      assetId: string;
      filename: string;
      mode: GeneratedImageOutput['mode'];
      availableCredits?: number;
    }
  | {
      state: 'processing';
      jobId: string;
      availableCredits?: number;
    };

export type ProtectedTextToImageRequest = {
  user: SaviUser;
  clientRequestId: string;
  quality: TextToImageQuality;
  aspectRatio: TextToImageAspectRatio;
  referenceImageCount: number;
  provider: string;
  model: string;
  generate: () => Promise<GeneratedImageOutput>;
};

function isDevelopmentGrantEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.SAVI_DEV_CREDIT_GRANT_ENABLED === 'true';
}

function isTextToImageEnabled() {
  return process.env.SAVI_TEXT_TO_IMAGE_ENABLED !== 'false';
}

function errorMessage(category: SaviFailureCategory) {
  switch (category) {
    case 'AUTH_REQUIRED':
      return 'Please sign in before generating an image.';
    case 'INSUFFICIENT_CREDITS':
      return 'You do not have enough credits for this image.';
    case 'PROVIDER_TIMEOUT':
      return 'Image generation took too long. Your credits were not used.';
    case 'PROVIDER_RATE_LIMIT':
      return 'Image generation is busy right now. Please try again shortly.';
    case 'PROVIDER_SERVER_ERROR':
      return 'The image service is temporarily unavailable. Your credits were not used.';
    case 'INVALID_INPUT':
      return 'Please check the image request and try again.';
    case 'UNSUPPORTED_INPUT':
      return 'That image format is not supported for this request.';
    case 'POLICY_REJECTION':
      return 'This request cannot be generated. Try a different image idea.';
    case 'STORAGE_FAILURE':
      return 'SAVI could not save the generated image. Your credits were not used.';
    case 'PRICING_NOT_CONFIGURED':
      return 'This image configuration is not available right now. No credits were used.';
    default:
      return 'SAVI could not complete that image request. Please try again.';
  }
}

function asSaviError(error: unknown) {
  return error instanceof SaviInfrastructureError ? error : null;
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  if (typeof record.status === 'number') return record.status;
  if (typeof record.statusCode === 'number') return record.statusCode;
  if (typeof record.code === 'number') return record.code;
  return undefined;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message.toLowerCase() : '';
}

function metadata(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

async function dataConnectQuery<T, Variables extends object>(operation: string, variables: Variables) {
  const response = await getSaviDataConnect().executeQuery<T, Variables>(operation, variables);
  return response.data;
}

async function dataConnectMutation<T, Variables extends object>(operation: string, variables: Variables) {
  const response = await getSaviDataConnect().executeMutation<T, Variables>(operation, variables);
  return response.data;
}

async function findUserByIdentity(user: SaviUser) {
  const data = await dataConnectQuery<{ saviUsers?: DatabaseUser[] }, { provider: string; providerSubject: string }>('FindSaviUserByProvider', {
    provider: 'google',
    providerSubject: user.id
  });
  return data.saviUsers?.[0] ?? null;
}

async function touchUser(user: SaviUser, databaseUser: DatabaseUser) {
  try {
    await dataConnectMutation('TouchSaviUser', {
      userId: databaseUser.id,
      email: user.email,
      displayName: user.name,
      avatarUrl: user.picture || null
    });
  } catch {
    // A stale profile must not prevent an already authenticated user from using SAVI.
  }
}

export async function resolveSaviDatabaseUser(user: SaviUser): Promise<DatabaseUser> {
  const existing = await findUserByIdentity(user);
  if (existing) {
    await touchUser(user, existing);
    return existing;
  }

  const databaseUser: DatabaseUser = {
    id: randomUUID(),
    provider: 'google',
    providerSubject: user.id,
    email: user.email,
    displayName: user.name,
    avatarUrl: user.picture || null,
    status: 'active'
  };

  try {
    if (isDevelopmentGrantEnabled()) {
      await dataConnectMutation('CreateSaviUserAndAccountWithDevelopmentGrant', {
        userId: databaseUser.id,
        accountId: randomUUID(),
        transactionId: randomUUID(),
        eventKey: `development-grant:${databaseUser.id}`,
        provider: databaseUser.provider,
        providerSubject: databaseUser.providerSubject,
        email: databaseUser.email,
        displayName: databaseUser.displayName,
        avatarUrl: databaseUser.avatarUrl,
        developmentCredits: DEVELOPMENT_INITIAL_CREDITS,
        metadata: metadata({ source: 'development_initial_grant', credits: DEVELOPMENT_INITIAL_CREDITS })
      });
    } else {
      await dataConnectMutation('CreateSaviUserAndAccount', {
        userId: databaseUser.id,
        accountId: randomUUID(),
        provider: databaseUser.provider,
        providerSubject: databaseUser.providerSubject,
        email: databaseUser.email,
        displayName: databaseUser.displayName,
        avatarUrl: databaseUser.avatarUrl
      });
    }
    return databaseUser;
  } catch (error) {
    const racedUser = await findUserByIdentity(user).catch(() => null);
    if (racedUser) return racedUser;
    throw new SaviInfrastructureError('INTERNAL_ERROR', 500, errorMessage('INTERNAL_ERROR'));
  }
}

async function findCreditAccount(userId: string) {
  const data = await dataConnectQuery<{ creditAccounts?: CreditAccount[] }, { userId: string }>('GetCreditAccount', { userId });
  return data.creditAccounts?.[0] ?? null;
}

async function getCreditAccount(userId: string) {
  const account = await findCreditAccount(userId);
  if (!account) throw new SaviInfrastructureError('INTERNAL_ERROR', 500, errorMessage('INTERNAL_ERROR'));
  return account;
}

export async function getAuthoritativeCreditBalance(user: SaviUser): Promise<AuthoritativeCreditBalance | null> {
  const databaseUser = await findUserByIdentity(user);
  if (!databaseUser) return null;

  const account = await findCreditAccount(databaseUser.id);
  if (!account) return null;

  return { availableCredits: account.availableCredits };
}

async function findGenerationJob(userId: string, clientRequestId: string) {
  const data = await dataConnectQuery<{ generationJobs?: GenerationJob[] }, { userId: string; clientRequestId: string }>('FindGenerationJob', {
    userId,
    clientRequestId
  });
  return data.generationJobs?.[0] ?? null;
}

async function getGenerationJob(userId: string, jobId: string) {
  const data = await dataConnectQuery<{ generationJobs?: GenerationJob[] }, { userId: string; jobId: string }>('GetGenerationJobForUser', {
    userId,
    jobId
  });
  return data.generationJobs?.[0] ?? null;
}

async function getAssetForJob(userId: string, jobId: string) {
  const data = await dataConnectQuery<{ assets?: PrivateAsset[] }, { userId: string; jobId: string }>('GetAssetForJobForUser', {
    userId,
    jobId
  });
  return data.assets?.[0] ?? null;
}

export async function getOwnedPrivateAsset(user: SaviUser, assetId: string) {
  if (!UUID.test(assetId)) return null;
  const databaseUser = await resolveSaviDatabaseUser(user);
  const data = await dataConnectQuery<{ assets?: PrivateAsset[] }, { userId: string; assetId: string }>('GetAssetForUser', {
    userId: databaseUser.id,
    assetId
  });
  return data.assets?.[0] ?? null;
}

async function existingJobResult(userId: string, job: GenerationJob): Promise<ExistingJobResult> {
  if (job.status === 'processing') return { state: 'processing', jobId: job.id };
  if (job.status === 'completed') {
    const asset = await getAssetForJob(userId, job.id);
    if (!asset) throw new SaviInfrastructureError('INTERNAL_ERROR', 500, errorMessage('INTERNAL_ERROR'));
    return { state: 'completed', asset, mode: 'gemini' };
  }
  if (job.status === 'failed') {
    throw new SaviInfrastructureError('INTERNAL_ERROR', 409, 'That image request already ended. Please generate it again.');
  }
  return null;
}

async function existingTextToImageJobResult(userId: string, clientRequestId: string) {
  const existing = await findGenerationJob(userId, clientRequestId);
  if (!existing) return null;
  if (existing.toolId !== 'text_to_image') {
    throw new SaviInfrastructureError('INVALID_INPUT', 409, 'This retry identifier belongs to a different SAVI request. Start a new generation.');
  }
  return existingJobResult(userId, existing);
}

async function reserveTextToImageCredits(input: {
  userId: string;
  clientRequestId: string;
  pricing: SaviPricingQuote;
  provider: string;
  model: string;
  quality: TextToImageQuality;
  aspectRatio: TextToImageAspectRatio;
  referenceImageCount: number;
}): Promise<Reservation | ReusableJobResult> {
  const reusable = await existingTextToImageJobResult(input.userId, input.clientRequestId);
  if (reusable) return reusable;

  const reservation: Reservation = {
    jobId: randomUUID(),
    reservationId: randomUUID(),
    credits: input.pricing.saviCredits,
    pricing: input.pricing
  };

  try {
    await dataConnectMutation('ReserveTextToImageJob', {
      jobId: reservation.jobId,
      reservationId: reservation.reservationId,
      reservationTransactionId: randomUUID(),
      reservationEventKey: `reservation:${reservation.reservationId}`,
      userId: input.userId,
      toolId: 'text_to_image',
      provider: input.provider,
      model: input.model,
      clientRequestId: input.clientRequestId,
      credits: reservation.credits,
      reservationLedgerAmount: -reservation.credits,
      metadata: metadata({
        toolId: 'text_to_image',
        provider: input.provider,
        model: input.model,
        resolution: input.quality,
        aspectRatio: input.aspectRatio,
        referenceImageCount: input.referenceImageCount,
        pricing: serializeSaviPricingMetadata(input.pricing)
      })
    });
    return reservation;
  } catch (error) {
    const text = errorText(error);
    if (text.includes('insufficient_credits')) {
      throw new SaviInfrastructureError('INSUFFICIENT_CREDITS', 402, errorMessage('INSUFFICIENT_CREDITS'));
    }

    try {
      const racedResult = await existingTextToImageJobResult(input.userId, input.clientRequestId);
      if (racedResult) return racedResult;
    } catch (raceError) {
      if (raceError instanceof SaviInfrastructureError) throw raceError;
    }
    throw new SaviInfrastructureError('INTERNAL_ERROR', 500, errorMessage('INTERNAL_ERROR'));
  }
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) throw new SaviInfrastructureError('UNSUPPORTED_INPUT', 422, errorMessage('UNSUPPORTED_INPUT'));
  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new SaviInfrastructureError('UNSUPPORTED_INPUT', 422, errorMessage('UNSUPPORTED_INPUT'));
  }
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!bytes.length || bytes.length > 50 * 1024 * 1024) {
    throw new SaviInfrastructureError('UNSUPPORTED_INPUT', 422, errorMessage('UNSUPPORTED_INPUT'));
  }
  return { bytes, mimeType };
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function safeFilename(filename: string, mimeType: string) {
  const extension = extensionForMimeType(mimeType);
  const base = filename.replace(/[^A-Za-z0-9._-]/g, '-').replace(/\.+/g, '.').slice(0, 120) || 'savi-generated-image';
  return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base.replace(/\.[^.]+$/, '')}.${extension}`;
}

async function storePrivateAsset(userId: string, output: GeneratedImageOutput): Promise<StoredAsset> {
  const { bytes, mimeType } = parseDataUrl(output.image);
  const assetId = randomUUID();
  const filename = safeFilename(output.filename, mimeType);
  const storagePath = `users/${userId}/assets/${assetId}/generated.${extensionForMimeType(mimeType)}`;

  try {
    await getSaviPrivateBucket().file(storagePath).save(bytes, {
      resumable: false,
      contentType: mimeType,
      metadata: {
        cacheControl: 'private, no-store, max-age=0',
        contentDisposition: `inline; filename="${filename}"`
      }
    });
  } catch {
    throw new SaviInfrastructureError('STORAGE_FAILURE', 502, errorMessage('STORAGE_FAILURE'));
  }

  return { assetId, storagePath, filename, mimeType, sizeBytes: bytes.length };
}

async function deletePrivateAsset(storagePath: string) {
  await getSaviPrivateBucket().file(storagePath).delete({ ignoreNotFound: true }).catch(() => undefined);
}

async function finalizeTextToImage(input: {
  userId: string;
  reservation: Reservation;
  storedAsset: StoredAsset;
  output: GeneratedImageOutput;
  model: string;
  quality: TextToImageQuality;
  aspectRatio: TextToImageAspectRatio;
  referenceImageCount: number;
  durationMs: number;
}) {
  await dataConnectMutation('FinalizeTextToImageJob', {
    jobId: input.reservation.jobId,
    reservationId: input.reservation.reservationId,
    chargeTransactionId: randomUUID(),
    chargeEventKey: `charge:${input.reservation.jobId}`,
    assetId: input.storedAsset.assetId,
    usageId: randomUUID(),
    userId: input.userId,
    credits: input.reservation.credits,
    model: input.model,
    chargeLedgerAmount: 0,
    providerRequestId: input.output.providerRequestId || null,
    usageMetadata: metadata({
      mode: input.output.mode,
      aspectRatio: input.aspectRatio,
      resolution: input.quality,
      pricing: serializeSaviPricingMetadata(input.reservation.pricing)
    }),
    assetStoragePath: input.storedAsset.storagePath,
    assetFilename: input.storedAsset.filename,
    assetMimeType: input.storedAsset.mimeType,
    assetSizeBytes: input.storedAsset.sizeBytes,
    resolution: input.quality,
    durationMs: input.durationMs,
    inputReferenceCount: input.referenceImageCount,
    imageCount: 1,
    inputTokens: input.output.usage?.inputTokens ?? null,
    outputTokens: input.output.usage?.outputTokens ?? null,
    metadata: metadata({
      toolId: 'text_to_image',
      provider: 'gemini',
      model: input.model,
      resolution: input.quality,
      aspectRatio: input.aspectRatio,
      durationMs: input.durationMs,
      retryCount: 0,
      success: true,
      providerRequestId: input.output.providerRequestId || null,
      inputReferenceCount: input.referenceImageCount,
      imageCount: 1,
      creditsReserved: input.reservation.credits,
      creditsCharged: input.reservation.credits,
      creditsReleased: 0,
      pricing: serializeSaviPricingMetadata(input.reservation.pricing)
    })
  });
}

async function releaseTextToImageReservation(input: {
  userId: string;
  reservation: Reservation;
  model: string;
  quality: TextToImageQuality;
  aspectRatio: TextToImageAspectRatio;
  referenceImageCount: number;
  durationMs: number;
  failure: SaviInfrastructureError;
  providerRequestId?: string;
  usage?: GeneratedImageOutput['usage'];
}) {
  const job = await getGenerationJob(input.userId, input.reservation.jobId).catch(() => null);
  if (!job || job.status !== 'processing') return;

  try {
    await dataConnectMutation('ReleaseTextToImageReservation', {
      jobId: input.reservation.jobId,
      reservationId: input.reservation.reservationId,
      releaseTransactionId: randomUUID(),
      releaseEventKey: `release:${input.reservation.jobId}`,
      usageId: randomUUID(),
      userId: input.userId,
      credits: input.reservation.credits,
      model: input.model,
      releaseLedgerAmount: input.reservation.credits,
      failureCategory: input.failure.category,
      failureMessage: input.failure.message,
      providerRequestId: input.providerRequestId || null,
      resolution: input.quality,
      durationMs: input.durationMs,
      inputReferenceCount: input.referenceImageCount,
      inputTokens: input.usage?.inputTokens ?? null,
      outputTokens: input.usage?.outputTokens ?? null,
      metadata: metadata({
        toolId: 'text_to_image',
        provider: 'gemini',
        model: input.model,
        resolution: input.quality,
        aspectRatio: input.aspectRatio,
        durationMs: input.durationMs,
        retryCount: 0,
        success: false,
        failureCategory: input.failure.category,
        creditsReserved: input.reservation.credits,
        creditsCharged: 0,
        creditsReleased: input.reservation.credits,
        pricing: serializeSaviPricingMetadata(input.reservation.pricing)
      })
    });
  } catch {
    throw new SaviInfrastructureError('INTERNAL_ERROR', 500, errorMessage('INTERNAL_ERROR'));
  }
}

export function classifyTextToImageFailure(error: unknown) {
  const existing = asSaviError(error);
  if (existing) return existing;

  const status = errorStatus(error);
  const text = errorText(error);
  const providerRequestId =
    error && typeof error === 'object' && typeof (error as { providerRequestId?: unknown }).providerRequestId === 'string'
      ? (error as { providerRequestId: string }).providerRequestId.slice(0, 512)
      : undefined;
  if (status === 408 || status === 504 || text.includes('timeout') || text.includes('timed out')) {
    return new SaviInfrastructureError('PROVIDER_TIMEOUT', 504, errorMessage('PROVIDER_TIMEOUT'), providerRequestId);
  }
  if (status === 429 || text.includes('rate limit') || text.includes('high demand')) {
    return new SaviInfrastructureError('PROVIDER_RATE_LIMIT', 429, errorMessage('PROVIDER_RATE_LIMIT'), providerRequestId);
  }
  if (text.includes('policy') || text.includes('safety') || text.includes('blocked') || text.includes('rejected')) {
    return new SaviInfrastructureError('POLICY_REJECTION', 422, errorMessage('POLICY_REJECTION'), providerRequestId);
  }
  if (status === 400 || text.includes('invalid') || text.includes('prompt')) {
    return new SaviInfrastructureError('INVALID_INPUT', 400, errorMessage('INVALID_INPUT'), providerRequestId);
  }
  if (status === 415 || text.includes('unsupported')) {
    return new SaviInfrastructureError('UNSUPPORTED_INPUT', 422, errorMessage('UNSUPPORTED_INPUT'), providerRequestId);
  }
  return new SaviInfrastructureError('PROVIDER_SERVER_ERROR', 502, errorMessage('PROVIDER_SERVER_ERROR'), providerRequestId);
}

async function spendableCredits(userId: string) {
  return (await getCreditAccount(userId)).availableCredits;
}

function quoteProtectedTextToImage(input: Pick<ProtectedTextToImageRequest, 'provider' | 'model' | 'quality' | 'aspectRatio' | 'referenceImageCount'>) {
  try {
    return quoteSaviPrice({
      provider: input.provider,
      model: input.model,
      toolId: 'text_to_image',
      operation: 'image_generation',
      input: { referenceImageCount: input.referenceImageCount },
      output: {
        imageCount: 1,
        resolution: input.quality,
        aspectRatio: input.aspectRatio
      }
    });
  } catch (error) {
    if (error instanceof SaviPricingError) {
      const category = error.category === 'INVALID_PRICING_INPUT' ? 'INVALID_INPUT' : 'PRICING_NOT_CONFIGURED';
      throw new SaviInfrastructureError(category, error.status, errorMessage(category));
    }
    throw new SaviInfrastructureError('PRICING_NOT_CONFIGURED', 503, errorMessage('PRICING_NOT_CONFIGURED'));
  }
}

export async function runProtectedTextToImage(input: ProtectedTextToImageRequest): Promise<ProtectedTextToImageResult> {
  if (!CLIENT_REQUEST_ID.test(input.clientRequestId)) {
    throw new SaviInfrastructureError('INVALID_INPUT', 400, errorMessage('INVALID_INPUT'));
  }

  const databaseUser = await resolveSaviDatabaseUser(input.user);
  const existing = await existingTextToImageJobResult(databaseUser.id, input.clientRequestId);
  if (existing) {
    const availableCredits = await spendableCredits(databaseUser.id).catch(() => undefined);
    if (existing.state === 'processing') return { ...existing, availableCredits };
    return {
      state: 'completed',
      jobId: existing.asset.jobId,
      assetId: existing.asset.id,
      filename: existing.asset.filename,
      mode: existing.mode,
      availableCredits
    };
  }
  if (!isTextToImageEnabled()) {
    throw new SaviInfrastructureError('INTERNAL_ERROR', 503, 'Text to Image is temporarily unavailable.');
  }

  const pricing = quoteProtectedTextToImage(input);
  const reserved = await reserveTextToImageCredits({
    userId: databaseUser.id,
    clientRequestId: input.clientRequestId,
    pricing,
    provider: input.provider,
    model: input.model,
    quality: input.quality,
    aspectRatio: input.aspectRatio,
    referenceImageCount: input.referenceImageCount
  });

  if (reserved && 'state' in reserved) {
    const availableCredits = await spendableCredits(databaseUser.id).catch(() => undefined);
    if (reserved.state === 'processing') return { ...reserved, availableCredits };
    return {
      state: 'completed',
      jobId: reserved.asset.jobId,
      assetId: reserved.asset.id,
      filename: reserved.asset.filename,
      mode: reserved.mode,
      availableCredits
    };
  }

  const startedAt = Date.now();
  let output: GeneratedImageOutput;
  try {
    output = await input.generate();
  } catch (error) {
    const failure = classifyTextToImageFailure(error);
    await releaseTextToImageReservation({
      userId: databaseUser.id,
      reservation: reserved,
      model: input.model,
      quality: input.quality,
      aspectRatio: input.aspectRatio,
      referenceImageCount: input.referenceImageCount,
      durationMs: Date.now() - startedAt,
      failure
    });
    throw failure;
  }

  let storedAsset: StoredAsset;
  try {
    storedAsset = await storePrivateAsset(databaseUser.id, output);
  } catch (error) {
    const failure = asSaviError(error) ?? new SaviInfrastructureError('STORAGE_FAILURE', 502, errorMessage('STORAGE_FAILURE'));
    await releaseTextToImageReservation({
      userId: databaseUser.id,
      reservation: reserved,
      model: input.model,
      quality: input.quality,
      aspectRatio: input.aspectRatio,
      referenceImageCount: input.referenceImageCount,
      durationMs: Date.now() - startedAt,
      failure,
      providerRequestId: output.providerRequestId,
      usage: output.usage
    });
    throw failure;
  }

  try {
    await finalizeTextToImage({
      userId: databaseUser.id,
      reservation: reserved,
      storedAsset,
      output,
      model: input.model,
      quality: input.quality,
      aspectRatio: input.aspectRatio,
      referenceImageCount: input.referenceImageCount,
      durationMs: Date.now() - startedAt
    });
  } catch {
    const job = await getGenerationJob(databaseUser.id, reserved.jobId).catch(() => null);
    const existingAsset = job?.status === 'completed' ? await getAssetForJob(databaseUser.id, reserved.jobId).catch(() => null) : null;
    if (existingAsset && job) {
      return {
        state: 'completed',
        jobId: reserved.jobId,
        assetId: existingAsset.id,
        filename: existingAsset.filename,
        mode: 'gemini',
        availableCredits: await spendableCredits(databaseUser.id).catch(() => undefined)
      };
    }

    await deletePrivateAsset(storedAsset.storagePath);
    const failure = new SaviInfrastructureError('INTERNAL_ERROR', 500, errorMessage('INTERNAL_ERROR'));
    await releaseTextToImageReservation({
      userId: databaseUser.id,
      reservation: reserved,
      model: input.model,
      quality: input.quality,
      aspectRatio: input.aspectRatio,
      referenceImageCount: input.referenceImageCount,
      durationMs: Date.now() - startedAt,
      failure,
      providerRequestId: output.providerRequestId,
      usage: output.usage
    });
    throw failure;
  }

  return {
    state: 'completed',
    jobId: reserved.jobId,
    assetId: storedAsset.assetId,
    filename: storedAsset.filename,
    mode: output.mode,
    availableCredits: await spendableCredits(databaseUser.id).catch(() => undefined)
  };
}

import { randomUUID } from 'node:crypto';
import { type SaviUser } from '@/lib/auth/session';
import { getSaviDataConnect, getSaviPrivateBucket } from '@/lib/firebase/admin';
import {
  quoteSaviPrice,
  serializeSaviPricingMetadata,
  SaviPricingError,
  type SaviPricingOperation,
  type SaviPricingQuote
} from '@/lib/pricing/saviPricing';
import {
  getAuthoritativeCreditBalance,
  getAuthoritativeCreditAccountByUserId,
  resolveSaviDatabaseUser,
  SaviInfrastructureError,
  type PrivateAsset,
  type SaviFailureCategory
} from '@/lib/savi/textToImageInfrastructure';

const CLIENT_REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;
const UUID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
const MAX_OUTPUT_BYTES = 250 * 1024 * 1024;

export type SaviProtectedMediaType = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'text';

export type SaviProtectedUsage = {
  inputTokens?: number;
  outputTokens?: number;
  audioTokens?: number;
  videoSeconds?: number;
  imageCount?: number;
};

export type SaviProtectedOutput = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  mediaType: SaviProtectedMediaType;
  providerRequestId?: string;
  usage?: SaviProtectedUsage;
  metadata?: Record<string, string | number | boolean | null>;
};

export type SaviProtectedOperationRequest = {
  user: SaviUser;
  clientRequestId: string;
  toolId: string;
  provider: string;
  model: string;
  operation: SaviPricingOperation;
  pricingInput?: {
    textCharacters?: number;
    referenceImageCount?: number;
    pageCount?: number;
  };
  pricingOutput?: {
    imageCount?: number;
    resolution?: string;
    aspectRatio?: string;
    videoSeconds?: number;
    audioSeconds?: number;
  };
  mediaType: SaviProtectedMediaType;
  generate: () => Promise<SaviProtectedOutput>;
};

export type SaviProtectedOperationResult =
  | {
      state: 'completed';
      jobId: string;
      assetId: string;
      filename: string;
      mimeType: string;
      mediaType: SaviProtectedMediaType;
      availableCredits?: number;
    }
  | {
      state: 'processing';
      jobId: string;
      availableCredits?: number;
    };

type DatabaseJob = {
  id: string;
  status: string;
  toolId: string;
  provider: string;
  model: string;
  clientRequestId: string;
  usageMetadata?: string | null;
};

type Reservation = {
  jobId: string;
  reservationId: string;
  credits: number;
  subscriptionCredits: number;
  pricing: SaviPricingQuote;
};

type StoredAsset = {
  assetId: string;
  storagePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

type ExistingJobResult =
  | { state: 'processing'; jobId: string }
  | { state: 'completed'; asset: PrivateAsset }
  | null;

function publicFailureMessage(category: SaviFailureCategory) {
  switch (category) {
    case 'INSUFFICIENT_CREDITS':
      return 'You do not have enough credits for this request.';
    case 'AUTH_REQUIRED':
      return 'Please sign in before using this tool.';
    case 'PROVIDER_TIMEOUT':
      return 'This request took too long. Your credits were not used.';
    case 'PROVIDER_RATE_LIMIT':
      return 'SAVI is busy right now. Please try again shortly.';
    case 'PROVIDER_SERVER_ERROR':
      return 'This service is temporarily unavailable. Your credits were not used.';
    case 'POLICY_REJECTION':
      return 'This request cannot be completed. Try changing the request.';
    case 'UNSUPPORTED_INPUT':
      return 'One of the supplied files is not supported for this tool.';
    case 'INVALID_INPUT':
      return 'Please check the request and try again.';
    case 'STORAGE_FAILURE':
      return 'SAVI could not save the result. Your credits were not used.';
    case 'PRICING_NOT_CONFIGURED':
      return 'This tool configuration is not available right now. No credits were used.';
    default:
      return 'SAVI could not complete this request. Please try again.';
  }
}

function metadata(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

function safeMetadata(value: Record<string, unknown> | undefined) {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item === null || ['string', 'number', 'boolean'].includes(typeof item))
  );
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message.toLowerCase() : '';
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  if (typeof record.status === 'number') return record.status;
  if (typeof record.statusCode === 'number') return record.statusCode;
  if (typeof record.code === 'number') return record.code;
  return undefined;
}

function providerRequestId(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as { providerRequestId?: unknown }).providerRequestId;
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 512) : undefined;
}

async function dataConnectQuery<T, Variables extends object>(operation: string, variables: Variables) {
  const response = await getSaviDataConnect().executeQuery<T, Variables>(operation, variables);
  return response.data;
}

async function dataConnectMutation<T, Variables extends object>(operation: string, variables: Variables) {
  const response = await getSaviDataConnect().executeMutation<T, Variables>(operation, variables);
  return response.data;
}

async function findJob(userId: string, clientRequestId: string) {
  const data = await dataConnectQuery<{ generationJobs?: DatabaseJob[] }, { userId: string; clientRequestId: string }>('FindGenerationJob', {
    userId,
    clientRequestId
  });
  return data.generationJobs?.[0] ?? null;
}

async function getJob(userId: string, jobId: string) {
  const data = await dataConnectQuery<{ generationJobs?: DatabaseJob[] }, { userId: string; jobId: string }>('GetGenerationJobForUser', {
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

async function resolveExistingJob(userId: string, job: DatabaseJob): Promise<ExistingJobResult> {
  if (job.status === 'processing') return { state: 'processing', jobId: job.id };
  if (job.status === 'completed') {
    const asset = await getAssetForJob(userId, job.id);
    if (!asset) {
      throw new SaviInfrastructureError('INTERNAL_ERROR', 500, publicFailureMessage('INTERNAL_ERROR'));
    }
    return { state: 'completed', asset };
  }
  if (job.status === 'failed') {
    throw new SaviInfrastructureError('INTERNAL_ERROR', 409, 'That request already ended. Please submit it again.');
  }
  return null;
}

async function resolveExistingJobForTool(userId: string, clientRequestId: string, toolId: string) {
  const existing = await findJob(userId, clientRequestId);
  if (!existing) return null;
  if (existing.toolId !== toolId) {
    throw new SaviInfrastructureError('INVALID_INPUT', 409, 'This retry identifier belongs to a different SAVI request. Start a new generation.');
  }
  return resolveExistingJob(userId, existing);
}

function quoteOperation(input: Omit<SaviProtectedOperationRequest, 'user' | 'clientRequestId' | 'mediaType' | 'generate'>) {
  try {
    return quoteSaviPrice({
      provider: input.provider,
      model: input.model,
      toolId: input.toolId,
      operation: input.operation,
      input: input.pricingInput,
      output: input.pricingOutput
    });
  } catch (error) {
    if (error instanceof SaviPricingError) {
      const category = error.category === 'INVALID_PRICING_INPUT' ? 'INVALID_INPUT' : 'PRICING_NOT_CONFIGURED';
      throw new SaviInfrastructureError(category, error.status, publicFailureMessage(category));
    }
    throw new SaviInfrastructureError('PRICING_NOT_CONFIGURED', 503, publicFailureMessage('PRICING_NOT_CONFIGURED'));
  }
}

function classifyFailure(error: unknown) {
  if (error instanceof SaviInfrastructureError) return error;
  const status = errorStatus(error);
  const text = errorText(error);
  const requestId = providerRequestId(error);
  if (status === 408 || status === 504 || text.includes('timeout') || text.includes('timed out')) {
    return new SaviInfrastructureError('PROVIDER_TIMEOUT', 504, publicFailureMessage('PROVIDER_TIMEOUT'), requestId);
  }
  if (status === 429 || text.includes('rate limit') || text.includes('high demand')) {
    return new SaviInfrastructureError('PROVIDER_RATE_LIMIT', 429, publicFailureMessage('PROVIDER_RATE_LIMIT'), requestId);
  }
  if (text.includes('policy') || text.includes('safety') || text.includes('blocked') || text.includes('rejected')) {
    return new SaviInfrastructureError('POLICY_REJECTION', 422, publicFailureMessage('POLICY_REJECTION'), requestId);
  }
  if (status === 400 || text.includes('invalid')) {
    return new SaviInfrastructureError('INVALID_INPUT', 400, publicFailureMessage('INVALID_INPUT'), requestId);
  }
  if (status === 413 || status === 415 || text.includes('unsupported')) {
    return new SaviInfrastructureError('UNSUPPORTED_INPUT', 422, publicFailureMessage('UNSUPPORTED_INPUT'), requestId);
  }
  return new SaviInfrastructureError('PROVIDER_SERVER_ERROR', 502, publicFailureMessage('PROVIDER_SERVER_ERROR'), requestId);
}

function extensionForMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'video/webm') return 'webm';
  if (normalized === 'video/mp4') return 'mp4';
  if (normalized === 'audio/mpeg') return 'mp3';
  if (normalized === 'audio/wav' || normalized === 'audio/x-wav') return 'wav';
  if (normalized === 'application/pdf') return 'pdf';
  if (normalized === 'application/zip') return 'zip';
  if (normalized === 'text/plain') return 'txt';
  return 'bin';
}

function safeFilename(filename: string, mimeType: string) {
  const extension = extensionForMimeType(mimeType);
  const fallback = `savi-generated.${extension}`;
  const base = filename.replace(/[^A-Za-z0-9._-]/g, '-').replace(/\.+/g, '.').slice(0, 120) || fallback;
  return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base.replace(/\.[^.]+$/, '')}.${extension}`;
}

function validateOutput(output: SaviProtectedOutput, expectedMediaType: SaviProtectedMediaType) {
  if (!Buffer.isBuffer(output.bytes) || output.bytes.length === 0 || output.bytes.length > MAX_OUTPUT_BYTES) {
    throw new SaviInfrastructureError('STORAGE_FAILURE', 502, publicFailureMessage('STORAGE_FAILURE'));
  }
  if (output.mediaType !== expectedMediaType || !output.mimeType || !output.filename) {
    throw new SaviInfrastructureError('UNSUPPORTED_INPUT', 422, publicFailureMessage('UNSUPPORTED_INPUT'));
  }
}

async function storePrivateAsset(userId: string, output: SaviProtectedOutput): Promise<StoredAsset> {
  const assetId = randomUUID();
  const filename = safeFilename(output.filename, output.mimeType);
  const storagePath = `users/${userId}/assets/${assetId}/generated.${extensionForMimeType(output.mimeType)}`;
  try {
    await getSaviPrivateBucket().file(storagePath).save(output.bytes, {
      resumable: false,
      contentType: output.mimeType,
      metadata: {
        cacheControl: 'private, no-store, max-age=0',
        contentDisposition: `inline; filename="${filename}"`
      }
    });
  } catch {
    throw new SaviInfrastructureError('STORAGE_FAILURE', 502, publicFailureMessage('STORAGE_FAILURE'));
  }
  return { assetId, storagePath, filename, mimeType: output.mimeType, sizeBytes: output.bytes.length };
}

async function deletePrivateAsset(storagePath: string) {
  await getSaviPrivateBucket().file(storagePath).delete({ ignoreNotFound: true }).catch(() => undefined);
}

async function reserve(input: {
  userId: string;
  clientRequestId: string;
  toolId: string;
  provider: string;
  model: string;
  pricing: SaviPricingQuote;
  metadata: Record<string, unknown>;
}): Promise<Reservation | Exclude<ExistingJobResult, null>> {
  const reusable = await resolveExistingJobForTool(input.userId, input.clientRequestId, input.toolId);
  if (reusable) return reusable;

  const reservation: Reservation = {
    jobId: randomUUID(),
    reservationId: randomUUID(),
    credits: input.pricing.saviCredits,
    subscriptionCredits: 0,
    pricing: input.pricing
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const account = await getAuthoritativeCreditAccountByUserId(input.userId);
    reservation.subscriptionCredits = Math.min(account.subscriptionCredits, reservation.credits);

    try {
      await dataConnectMutation('ReserveGenerationJob', {
        jobId: reservation.jobId,
        reservationId: reservation.reservationId,
        reservationTransactionId: randomUUID(),
        reservationEventKey: `reservation:${reservation.reservationId}`,
        userId: input.userId,
        toolId: input.toolId,
        provider: input.provider,
        model: input.model,
        clientRequestId: input.clientRequestId,
        credits: reservation.credits,
        expectedSubscriptionCredits: account.subscriptionCredits,
        expectedReservedSubscriptionCredits: account.reservedSubscriptionCredits,
        subscriptionCredits: reservation.subscriptionCredits,
        reservationLedgerAmount: -reservation.credits,
        reservationReason: `${input.toolId}_reservation`,
        metadata: metadata({ ...input.metadata, subscriptionCredits: reservation.subscriptionCredits })
      });
      return reservation;
    } catch (error) {
      const text = errorText(error);
      const latestAccount = text.includes('credit_account_state_changed') ? await getAuthoritativeCreditAccountByUserId(input.userId).catch(() => null) : null;
      if (text.includes('insufficient_credits') || (latestAccount && latestAccount.availableCredits < reservation.credits)) {
        throw new SaviInfrastructureError('INSUFFICIENT_CREDITS', 402, publicFailureMessage('INSUFFICIENT_CREDITS'));
      }
      if (text.includes('credit_account_state_changed') && attempt === 0) continue;
      try {
        const racedReusable = await resolveExistingJobForTool(input.userId, input.clientRequestId, input.toolId);
        if (racedReusable) return racedReusable;
      } catch (raceError) {
        if (raceError instanceof SaviInfrastructureError) throw raceError;
      }
      throw new SaviInfrastructureError('INTERNAL_ERROR', 500, publicFailureMessage('INTERNAL_ERROR'));
    }
  }

  throw new SaviInfrastructureError('INTERNAL_ERROR', 500, publicFailureMessage('INTERNAL_ERROR'));
}

async function finalize(input: {
  userId: string;
  toolId: string;
  provider: string;
  model: string;
  reservation: Reservation;
  asset: StoredAsset;
  output: SaviProtectedOutput;
  durationMs: number;
  pricingInput: SaviProtectedOperationRequest['pricingInput'];
  pricingOutput: SaviProtectedOperationRequest['pricingOutput'];
}) {
  const imageCount = input.output.usage?.imageCount ?? input.pricingOutput?.imageCount ?? 0;
  const resolution = input.pricingOutput?.resolution ?? null;
  const duration = input.output.usage?.videoSeconds
    ? Math.round(input.output.usage.videoSeconds * 1000)
    : input.durationMs;
  const usageMetadata = {
    toolId: input.toolId,
    provider: input.provider,
    model: input.model,
    mode: 'server',
    audioTokens: input.output.usage?.audioTokens ?? null,
    videoSeconds: input.output.usage?.videoSeconds ?? null,
    pricing: serializeSaviPricingMetadata(input.reservation.pricing),
    output: safeMetadata(input.output.metadata)
  };

  await dataConnectMutation('FinalizeGenerationJob', {
    jobId: input.reservation.jobId,
    reservationId: input.reservation.reservationId,
    chargeTransactionId: randomUUID(),
    chargeEventKey: `charge:${input.reservation.jobId}`,
    assetId: input.asset.assetId,
    usageId: randomUUID(),
    userId: input.userId,
    toolId: input.toolId,
    provider: input.provider,
    model: input.model,
    mediaType: input.output.mediaType,
    credits: input.reservation.credits,
    subscriptionCredits: input.reservation.subscriptionCredits,
    chargeLedgerAmount: 0,
    chargeReason: `${input.toolId}_finalized`,
    providerRequestId: input.output.providerRequestId || null,
    usageMetadata: metadata(usageMetadata),
    assetStoragePath: input.asset.storagePath,
    assetFilename: input.asset.filename,
    assetMimeType: input.asset.mimeType,
    assetSizeBytes: input.asset.sizeBytes,
    resolution,
    durationMs: duration,
    inputReferenceCount: input.pricingInput?.referenceImageCount ?? 0,
    imageCount,
    inputTokens: input.output.usage?.inputTokens ?? null,
    outputTokens: input.output.usage?.outputTokens ?? null,
    metadata: metadata({
      toolId: input.toolId,
      provider: input.provider,
      model: input.model,
      resolution,
      durationMs: duration,
      inputReferenceCount: input.pricingInput?.referenceImageCount ?? 0,
      imageCount,
      creditsReserved: input.reservation.credits,
      creditsCharged: input.reservation.credits,
      creditsReleased: 0,
      pricing: serializeSaviPricingMetadata(input.reservation.pricing),
      output: safeMetadata(input.output.metadata)
    })
  });
}

async function release(input: {
  userId: string;
  toolId: string;
  provider: string;
  model: string;
  reservation: Reservation;
  pricingInput: SaviProtectedOperationRequest['pricingInput'];
  pricingOutput: SaviProtectedOperationRequest['pricingOutput'];
  durationMs: number;
  failure: SaviInfrastructureError;
  output?: SaviProtectedOutput;
}) {
  const job = await getJob(input.userId, input.reservation.jobId).catch(() => null);
  if (!job || job.status !== 'processing') return;

  try {
    await dataConnectMutation('ReleaseGenerationReservation', {
      jobId: input.reservation.jobId,
      reservationId: input.reservation.reservationId,
      releaseTransactionId: randomUUID(),
      releaseEventKey: `release:${input.reservation.jobId}`,
      usageId: randomUUID(),
      userId: input.userId,
      toolId: input.toolId,
      provider: input.provider,
      model: input.model,
      credits: input.reservation.credits,
      subscriptionCredits: input.reservation.subscriptionCredits,
      releaseLedgerAmount: input.reservation.credits,
      releaseReason: `${input.toolId}_reservation_released`,
      failureCategory: input.failure.category,
      failureMessage: input.failure.message,
      providerRequestId: input.output?.providerRequestId || input.failure.providerRequestId || null,
      resolution: input.pricingOutput?.resolution ?? null,
      durationMs: input.durationMs,
      inputReferenceCount: input.pricingInput?.referenceImageCount ?? 0,
      inputTokens: input.output?.usage?.inputTokens ?? null,
      outputTokens: input.output?.usage?.outputTokens ?? null,
      metadata: metadata({
        toolId: input.toolId,
        provider: input.provider,
        model: input.model,
        failureCategory: input.failure.category,
        creditsReserved: input.reservation.credits,
        creditsCharged: 0,
        creditsReleased: input.reservation.credits,
        pricing: serializeSaviPricingMetadata(input.reservation.pricing)
      })
    });
  } catch {
    throw new SaviInfrastructureError('INTERNAL_ERROR', 500, publicFailureMessage('INTERNAL_ERROR'));
  }
}

async function balanceFor(user: SaviUser) {
  return (await getAuthoritativeCreditBalance(user).catch(() => null))?.availableCredits;
}

export async function runProtectedOperation(input: SaviProtectedOperationRequest): Promise<SaviProtectedOperationResult> {
  if (!CLIENT_REQUEST_ID.test(input.clientRequestId)) {
    throw new SaviInfrastructureError('INVALID_INPUT', 400, publicFailureMessage('INVALID_INPUT'));
  }

  const databaseUser = await resolveSaviDatabaseUser(input.user);
  const existing = await resolveExistingJobForTool(databaseUser.id, input.clientRequestId, input.toolId);
  if (existing) {
    const availableCredits = await balanceFor(input.user);
    if (existing.state === 'processing') return { ...existing, availableCredits };
    return {
      state: 'completed',
      jobId: existing.asset.jobId,
      assetId: existing.asset.id,
      filename: existing.asset.filename,
      mimeType: existing.asset.mimeType,
      mediaType: existing.asset.mediaType as SaviProtectedMediaType,
      availableCredits
    };
  }

  const pricing = quoteOperation(input);
  const baseMetadata = {
    toolId: input.toolId,
    provider: input.provider,
    model: input.model,
    operation: input.operation,
    input: input.pricingInput ?? {},
    output: input.pricingOutput ?? {},
    pricing: serializeSaviPricingMetadata(pricing)
  };
  const reserved = await reserve({
    userId: databaseUser.id,
    clientRequestId: input.clientRequestId,
    toolId: input.toolId,
    provider: input.provider,
    model: input.model,
    pricing,
    metadata: baseMetadata
  });

  if ('state' in reserved) {
    const availableCredits = await balanceFor(input.user);
    if (reserved.state === 'processing') return { ...reserved, availableCredits };
    return {
      state: 'completed',
      jobId: reserved.asset.jobId,
      assetId: reserved.asset.id,
      filename: reserved.asset.filename,
      mimeType: reserved.asset.mimeType,
      mediaType: reserved.asset.mediaType as SaviProtectedMediaType,
      availableCredits
    };
  }

  const startedAt = Date.now();
  let output: SaviProtectedOutput;
  try {
    output = await input.generate();
    validateOutput(output, input.mediaType);
  } catch (error) {
    const failure = classifyFailure(error);
    await release({
      userId: databaseUser.id,
      toolId: input.toolId,
      provider: input.provider,
      model: input.model,
      reservation: reserved,
      pricingInput: input.pricingInput,
      pricingOutput: input.pricingOutput,
      durationMs: Date.now() - startedAt,
      failure
    });
    throw failure;
  }

  let storedAsset: StoredAsset;
  try {
    storedAsset = await storePrivateAsset(databaseUser.id, output);
  } catch (error) {
    const failure = error instanceof SaviInfrastructureError ? error : new SaviInfrastructureError('STORAGE_FAILURE', 502, publicFailureMessage('STORAGE_FAILURE'));
    await release({
      userId: databaseUser.id,
      toolId: input.toolId,
      provider: input.provider,
      model: input.model,
      reservation: reserved,
      pricingInput: input.pricingInput,
      pricingOutput: input.pricingOutput,
      durationMs: Date.now() - startedAt,
      failure,
      output
    });
    throw failure;
  }

  try {
    await finalize({
      userId: databaseUser.id,
      toolId: input.toolId,
      provider: input.provider,
      model: input.model,
      reservation: reserved,
      asset: storedAsset,
      output,
      durationMs: Date.now() - startedAt,
      pricingInput: input.pricingInput,
      pricingOutput: input.pricingOutput
    });
  } catch {
    const job = await getJob(databaseUser.id, reserved.jobId).catch(() => null);
    const existingAsset = job?.status === 'completed' ? await getAssetForJob(databaseUser.id, reserved.jobId).catch(() => null) : null;
    if (existingAsset) {
      return {
        state: 'completed',
        jobId: existingAsset.jobId,
        assetId: existingAsset.id,
        filename: existingAsset.filename,
        mimeType: existingAsset.mimeType,
        mediaType: existingAsset.mediaType as SaviProtectedMediaType,
        availableCredits: await balanceFor(input.user)
      };
    }

    await deletePrivateAsset(storedAsset.storagePath);
    const failure = new SaviInfrastructureError('INTERNAL_ERROR', 500, publicFailureMessage('INTERNAL_ERROR'));
    await release({
      userId: databaseUser.id,
      toolId: input.toolId,
      provider: input.provider,
      model: input.model,
      reservation: reserved,
      pricingInput: input.pricingInput,
      pricingOutput: input.pricingOutput,
      durationMs: Date.now() - startedAt,
      failure,
      output
    });
    throw failure;
  }

  return {
    state: 'completed',
    jobId: reserved.jobId,
    assetId: storedAsset.assetId,
    filename: storedAsset.filename,
    mimeType: storedAsset.mimeType,
    mediaType: input.mediaType,
    availableCredits: await balanceFor(input.user)
  };
}

export async function recordFreeAiUsage(input: {
  user: SaviUser;
  clientRequestId?: string;
  toolId: string;
  provider: string;
  model: string;
  success: boolean;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  groundingRequestCount?: number;
  providerRequestId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const databaseUser = await resolveSaviDatabaseUser(input.user);
  // Free-chat telemetry shares GenerationJob's idempotency namespace. Prefixing
  // the client request keeps a retry idempotent for this telemetry event while
  // preventing it from colliding with a paid generation submitted by the same
  // browser request.
  const requestEntropy = CLIENT_REQUEST_ID.test(input.clientRequestId || '')
    ? input.clientRequestId!
    : randomUUID().replace(/-/g, '');
  const safeToolId = input.toolId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'free_ai';
  const clientRequestId = `telemetry_${safeToolId}_${requestEntropy}`.slice(0, 128);
  const metadataValue = {
    mode: 'free_fair_use',
    groundingRequestCount: input.groundingRequestCount ?? 0,
    ...safeMetadata(input.metadata)
  };

  await dataConnectMutation('RecordFreeAiUsage', {
    jobId: randomUUID(),
    usageId: randomUUID(),
    userId: databaseUser.id,
    clientRequestId,
    toolId: input.toolId,
    provider: input.provider,
    model: input.model,
    providerRequestId: input.providerRequestId || null,
    resolution: null,
    durationMs: input.durationMs,
    inputReferenceCount: 0,
    imageCount: 0,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    success: input.success,
    metadata: metadata(metadataValue)
  });
}

export function isSaviClientRequestId(value: string | undefined | null) {
  return Boolean(value && CLIENT_REQUEST_ID.test(value));
}

export function isSaviAssetId(value: string | undefined | null) {
  return Boolean(value && UUID.test(value));
}

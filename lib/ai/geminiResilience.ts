type GeminiAttempt = {
  model: string;
  status?: number;
  message?: string;
};

type GeminiRequestOptions<T> = {
  apiKey: string;
  models?: string[];
  requestForModel: (model: string) => { url: string; init: RequestInit };
  parseError?: (data: T) => string | undefined;
  attemptsPerModel?: number;
  timeoutMs?: number;
};

export class GeminiUnavailableError extends Error {
  readonly attempts: GeminiAttempt[];

  constructor(message: string, attempts: GeminiAttempt[]) {
    super(message);
    this.name = 'GeminiUnavailableError';
    this.attempts = attempts;
  }
}

const DEFAULT_TEXT_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

function sleep(duration: number) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

function isTransientStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function messageFromUnknown(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const record = value as { error?: { message?: unknown } };
  return typeof record.error?.message === 'string' ? record.error.message : '';
}

function configuredModels(models?: string[]) {
  const primary = process.env.GEMINI_TEXT_MODEL || 'gemini-3.6-flash';
  return [...(models || [primary, ...DEFAULT_TEXT_FALLBACKS])]
    .map((model) => model.trim())
    .filter(Boolean)
    .filter((model, index, all) => all.indexOf(model) === index);
}

/**
 * Gemini can briefly return 429/5xx during spikes. Keep retries and fallbacks
 * on the server so the browser never needs a model name or an API key.
 */
export async function requestGeminiWithFallback<T>({
  apiKey,
  models,
  requestForModel,
  parseError,
  attemptsPerModel = 2,
  timeoutMs = 30_000
}: GeminiRequestOptions<T>): Promise<{ data: T; model: string }> {
  const failures: GeminiAttempt[] = [];

  for (const model of configuredModels(models)) {
    for (let attempt = 0; attempt < attemptsPerModel; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const request = requestForModel(model);
        const response = await fetch(request.url, {
          ...request.init,
          headers: {
            'x-goog-api-key': apiKey,
            ...(request.init.headers || {})
          },
          signal: controller.signal
        });
        const data = (await response.json().catch(() => ({}))) as T;

        if (response.ok) return { data, model };

        const message = parseError?.(data) || messageFromUnknown(data) || 'Temporary Gemini availability issue.';
        failures.push({ model, status: response.status, message });

        if (!isTransientStatus(response.status)) {
          throw new GeminiUnavailableError(message, failures);
        }
      } catch (error) {
        if (error instanceof GeminiUnavailableError) throw error;
        failures.push({ model, message: error instanceof Error ? error.message : 'Network request failed.' });
      } finally {
        clearTimeout(timeout);
      }

      if (attempt < attemptsPerModel - 1) {
        await sleep(450 * (attempt + 1));
      }
    }
  }

  throw new GeminiUnavailableError('SAVI could not reach its AI service after retrying.', failures);
}

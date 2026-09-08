import { logOperational } from '../observability/logger';

export type SaviConfigurationArea = 'auth' | 'firebase' | 'gemini' | 'commerce' | 'webhook' | 'readiness';

export class SaviConfigurationError extends Error {
  constructor(
    readonly area: SaviConfigurationArea,
    readonly missing: string[]
  ) {
    super(`SAVI ${area} configuration is unavailable.`);
    this.name = 'SaviConfigurationError';
  }
}

function value(name: string) {
  return process.env[name]?.trim() || '';
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function addRequired(missing: Set<string>, name: string) {
  if (!value(name)) missing.add(name);
}

function addHttpsOrigin(missing: Set<string>) {
  const origin = value('SAVI_APP_ORIGIN');
  if (!origin) {
    missing.add('SAVI_APP_ORIGIN');
    return;
  }

  try {
    const parsed = new URL(origin);
    const localHostname = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1' || parsed.hostname === '[::1]';
    if (parsed.protocol !== 'https:' || localHostname || parsed.search || parsed.hash || parsed.username || parsed.password) {
      missing.add('SAVI_APP_ORIGIN');
    }
  } catch {
    missing.add('SAVI_APP_ORIGIN');
  }
}

function addFirebaseRequirements(missing: Set<string>) {
  addRequired(missing, 'FIREBASE_PROJECT_ID');
  addRequired(missing, 'FIREBASE_STORAGE_BUCKET');
  addRequired(missing, 'FIREBASE_DATA_CONNECT_SERVICE_ID');
  addRequired(missing, 'FIREBASE_DATA_CONNECT_LOCATION');
  addRequired(missing, 'FIREBASE_DATA_CONNECT_CONNECTOR');
}

function missingFor(area: SaviConfigurationArea) {
  const missing = new Set<string>();

  if (area === 'auth' || area === 'readiness') {
    addRequired(missing, 'SAVI_AUTH_SECRET');
    if (value('SAVI_AUTH_SECRET').length > 0 && value('SAVI_AUTH_SECRET').length < 32) missing.add('SAVI_AUTH_SECRET');
    addRequired(missing, 'GOOGLE_CLIENT_ID');
    addRequired(missing, 'GOOGLE_CLIENT_SECRET');
    addHttpsOrigin(missing);
  }

  if (area === 'firebase' || area === 'readiness' || area === 'webhook') addFirebaseRequirements(missing);
  if (area === 'commerce' || area === 'readiness') addHttpsOrigin(missing);
  if (area === 'commerce' || area === 'webhook') addRequired(missing, 'STRIPE_SECRET_KEY');
  if (area === 'webhook') addRequired(missing, 'STRIPE_WEBHOOK_SECRET');
  if (area === 'gemini' || area === 'readiness') addRequired(missing, 'GEMINI_API_KEY');

  if (isProduction() && value('SAVI_DEV_CREDIT_GRANT_ENABLED').toLowerCase() === 'true') {
    missing.add('SAVI_DEV_CREDIT_GRANT_ENABLED must be false');
  }

  return Array.from(missing);
}

export function getSaviConfigurationStatus(area: SaviConfigurationArea) {
  const missing = missingFor(area);
  return { ready: missing.length === 0, missing };
}

export function assertSaviProductionConfiguration(area: Exclude<SaviConfigurationArea, 'readiness'>) {
  if (!isProduction()) return;
  const missing = missingFor(area);
  if (!missing.length) return;
  logOperational('error', 'savi_configuration_invalid', { area, missing: missing.join(',') });
  throw new SaviConfigurationError(area, missing);
}

export function assertSaviReadiness() {
  if (!isProduction()) return;
  const missing = missingFor('readiness');
  if (!missing.length) return;
  logOperational('error', 'savi_readiness_failed', { missing: missing.join(',') });
  throw new SaviConfigurationError('readiness', missing);
}

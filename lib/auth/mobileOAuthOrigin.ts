const MOBILE_GOOGLE_CALLBACK_PATH = '/api/auth/mobile/google/callback';

function validHttpsOrigin(value: string | undefined) {
  const origin = value?.trim();
  if (!origin) return null;

  try {
    const parsed = new URL(origin);
    const localHostname = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1' || parsed.hostname === '[::1]';
    if (parsed.protocol !== 'https:' || localHostname || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function mobileOAuthOrigin() {
  return validHttpsOrigin(process.env.SAVI_MOBILE_OAUTH_ORIGIN);
}

export function mobileGoogleCallbackUrl() {
  const origin = mobileOAuthOrigin();
  if (!origin) throw new Error('Mobile OAuth origin is not configured.');
  return `${origin}${MOBILE_GOOGLE_CALLBACK_PATH}`;
}

export function isValidMobileOAuthOrigin(value: string | undefined) {
  return validHttpsOrigin(value) !== null;
}

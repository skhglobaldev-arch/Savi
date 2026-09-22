const configuredOrigin = process.env.EXPO_PUBLIC_SAVI_API_ORIGIN?.trim().replace(/\/$/, '');
const configuredMobileOAuthOrigin = process.env.EXPO_PUBLIC_SAVI_MOBILE_OAUTH_ORIGIN?.trim().replace(/\/$/, '');

function validHttpsOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export const saviApiOrigin = configuredOrigin || 'https://savi.skh.global';
export const mobileOAuthOrigin = validHttpsOrigin(configuredMobileOAuthOrigin);
export const mobileAuthCallbackUri = 'savi://auth/callback';

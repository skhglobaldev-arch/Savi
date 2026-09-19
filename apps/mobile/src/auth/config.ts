const configuredOrigin = process.env.EXPO_PUBLIC_SAVI_API_ORIGIN?.trim().replace(/\/$/, '');

export const saviApiOrigin = configuredOrigin || 'https://savi.skh.global';
export const mobileAuthCallbackUri = 'savi://auth/callback';

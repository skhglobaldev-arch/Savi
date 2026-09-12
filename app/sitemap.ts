import type { MetadataRoute } from 'next';

const publicRoutes = ['/', '/credits', '/privacy', '/terms', '/cookies', '/ai-disclaimer', '/refunds'];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.SAVI_APP_ORIGIN === 'https://savi.skh.global'
    ? process.env.SAVI_APP_ORIGIN
    : 'https://savi.skh.global';

  return publicRoutes.map((route) => ({
    url: new URL(route, origin).toString()
  }));
}

export type SaviMediaType = 'image' | 'video' | 'audio' | 'pdf' | 'zip' | 'text';

export type SaviMediaItem = {
  id: string;
  type: SaviMediaType;
  title: string;
  source: string;
  url?: string;
  filename?: string;
  text?: string;
  createdAt: number;
};

export const SAVI_MEDIA_LIBRARY_KEY = 'savi.media.library.v1';
export const SAVI_MEDIA_LIBRARY_EVENT = 'savi-media-library-updated';

export function makeMediaId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function loadMediaLibrary(): SaviMediaItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const value = window.localStorage.getItem(SAVI_MEDIA_LIBRARY_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as SaviMediaItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMediaLibrary(items: SaviMediaItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SAVI_MEDIA_LIBRARY_KEY, JSON.stringify(items.slice(0, 120)));
  window.dispatchEvent(new CustomEvent(SAVI_MEDIA_LIBRARY_EVENT));
}

export function recordMediaItem(item: Omit<SaviMediaItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
  if (typeof window === 'undefined') return;
  const nextItem: SaviMediaItem = {
    id: item.id || makeMediaId(),
    createdAt: item.createdAt || Date.now(),
    type: item.type,
    title: item.title,
    source: item.source,
    url: item.url,
    filename: item.filename,
    text: item.text
  };
  saveMediaLibrary([nextItem, ...loadMediaLibrary().filter((existing) => existing.id !== nextItem.id)]);
}

export function removeMediaItem(id: string) {
  saveMediaLibrary(loadMediaLibrary().filter((item) => item.id !== id));
}

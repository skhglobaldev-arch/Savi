'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  loadMediaLibrary,
  removeMediaItem,
  SAVI_MEDIA_LIBRARY_EVENT,
  type SaviMediaItem,
  type SaviMediaType
} from '@/lib/mediaLibrary';

const mediaSections: Array<{ type: SaviMediaType; label: string; empty: string }> = [
  { type: 'image', label: 'Images', empty: 'Generated and edited images will appear here.' },
  { type: 'video', label: 'Videos', empty: 'Generated clips and video previews will appear here.' },
  { type: 'audio', label: 'Voice', empty: 'Text to speech and radio outputs will appear here.' },
  { type: 'pdf', label: 'PDFs', empty: 'Processed PDF outputs will appear here.' },
  { type: 'zip', label: 'ZIP files', empty: 'Exported image packs will appear here.' },
  { type: 'text', label: 'Texts', empty: 'Scripts, briefs, summaries, and captions will appear here.' }
];

function dateLabel(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AllMediaLibrary() {
  const [items, setItems] = useState<SaviMediaItem[]>([]);
  const [activeItem, setActiveItem] = useState<SaviMediaItem | null>(null);
  const [activeType, setActiveType] = useState<SaviMediaType>('image');

  useEffect(() => {
    const refresh = () => setItems(loadMediaLibrary());
    refresh();
    window.addEventListener(SAVI_MEDIA_LIBRARY_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SAVI_MEDIA_LIBRARY_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (!activeItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveItem(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeItem]);

  const grouped = useMemo(() => {
    return mediaSections.map((section) => ({
      ...section,
      items: items.filter((item) => item.type === section.type)
    }));
  }, [items]);
  const activeSection = grouped.find((section) => section.type === activeType) ?? grouped[0];

  return (
    <section className="glass min-h-[calc(100vh-118px)] rounded-2xl p-4 md:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-400">Library</p>
          <h1 className="mt-2 text-2xl font-semibold text-white md:text-4xl">Your SAVI library</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">Find generated images, videos, voice, PDFs, ZIPs, and scripts in one clean place.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs font-semibold text-white/58">
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {grouped.map((section) => (
          <button
            key={section.type}
            type="button"
            onClick={() => setActiveType(section.type)}
            className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-left transition ${
              activeType === section.type ? 'border-white/15 bg-white/14 text-white shadow-[0_12px_30px_rgba(0,0,0,0.18)]' : 'border-white/10 bg-white/[0.035] text-white/52 hover:bg-white/8 hover:text-white'
            }`}
          >
            <span className="block text-sm font-semibold">{section.label}</span>
            <span className="mt-0.5 block text-[11px]">{section.items.length} saved</span>
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-white/10 pt-4">
        {activeSection.items.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {activeSection.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveItem(item)}
                className="group min-h-[44px] overflow-hidden rounded-lg border border-white/10 bg-black/20 text-left transition hover:border-violet-300/45"
              >
                <MediaThumb item={item} />
                <div className="p-3">
                  <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 truncate text-xs text-white/38">{item.source} · {dateLabel(item.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="savi-empty-state py-14">
            {activeSection.empty}
          </div>
        )}
      </div>

      {activeItem && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/78 p-3 backdrop-blur-xl" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 cursor-default" onClick={() => setActiveItem(null)} aria-label="Close media preview" />
          <div className="relative w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-[#080808] shadow-[0_28px_100px_rgba(0,0,0,0.5)]" aria-labelledby="media-preview-title">
            <h2 id="media-preview-title" className="sr-only">Media preview</h2>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{activeItem.title}</p>
                <p className="mt-0.5 truncate text-xs text-white/42">{activeItem.source} · {dateLabel(activeItem.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                {activeItem.url && (
                  <a href={activeItem.url} download={activeItem.filename || 'output'} className="inline-flex min-h-[44px] items-center rounded-lg bg-white px-4 py-2 text-xs font-bold text-black">
                    Download
                  </a>
                )}
                {activeItem.text && (
                  <button type="button" onClick={() => downloadText(activeItem.filename || 'output.txt', activeItem.text || '')} className="min-h-[44px] rounded-lg bg-white px-4 py-2 text-xs font-bold text-black">
                    Download
                  </button>
                )}
                <button type="button" onClick={() => {
                  removeMediaItem(activeItem.id);
                  setActiveItem(null);
                }} className="min-h-[44px] rounded-lg border border-white/10 bg-white/8 px-4 py-2 text-xs font-semibold text-white/58 hover:bg-white/14">
                  Remove
                </button>
                <button type="button" onClick={() => setActiveItem(null)} className="grid h-[44px] w-[44px] place-items-center rounded-lg border border-white/12 text-white/72 hover:bg-white/10" aria-label="Close media preview">
                  <span aria-hidden="true" className="relative block h-4 w-4 before:absolute before:left-1/2 before:top-1/2 before:h-px before:w-4 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:bg-current after:absolute after:left-1/2 after:top-1/2 after:h-px after:w-4 after:-translate-x-1/2 after:-translate-y-1/2 after:-rotate-45 after:bg-current" />
                </button>
              </div>
            </div>
            <div className="grid max-h-[78vh] place-items-center bg-black p-2">
              <MediaLarge item={activeItem} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function MediaThumb({ item }: { item: SaviMediaItem }) {
  if (item.type === 'image' && item.url) return <img src={item.url} alt="" className="aspect-video w-full object-cover" />;
  if (item.type === 'video' && item.url) return <video src={item.url} muted playsInline preload="metadata" className="aspect-video w-full object-cover" />;
  if (item.type === 'audio') return <div className="grid aspect-video place-items-center bg-gradient-to-br from-violet-700 via-blue-700 to-cyan-500 text-sm font-black text-white">Audio</div>;
  if (item.type === 'pdf') return <div className="grid aspect-video place-items-center bg-gradient-to-br from-rose-600 via-violet-700 to-slate-950 text-sm font-black text-white">PDF</div>;
  if (item.type === 'zip') return <div className="grid aspect-video place-items-center bg-gradient-to-br from-emerald-600 via-cyan-700 to-slate-950 text-sm font-black text-white">ZIP</div>;
  return <div className="grid aspect-video place-items-center bg-gradient-to-br from-slate-800 via-violet-800 to-black text-sm font-black text-white">Text</div>;
}

function MediaLarge({ item }: { item: SaviMediaItem }) {
  if (item.type === 'image' && item.url) return <img src={item.url} alt={item.title} className="max-h-[76vh] w-full object-contain" />;
  if (item.type === 'video' && item.url) return <video src={item.url} controls autoPlay className="max-h-[76vh] w-full object-contain" />;
  if (item.type === 'audio' && item.url) return <audio controls autoPlay src={item.url} className="w-full max-w-3xl" />;
  if (item.type === 'text' && item.text) return <pre className="max-h-[76vh] w-full overflow-auto whitespace-pre-wrap rounded-[20px] bg-white p-5 text-sm leading-7 text-slate-800">{item.text}</pre>;
  if (item.url) return <iframe src={item.url} title={item.title} className="h-[76vh] w-full rounded-[18px] bg-white" />;
  return <div className="p-8 text-center text-sm font-medium text-white/50">Preview is not available for this item.</div>;
}

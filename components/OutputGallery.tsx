'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

export type OutputGalleryItem = {
  id: string;
  type: 'image' | 'video';
  url: string;
  title: string;
  subtitle?: string;
  filename?: string;
};

export function OutputGallery({
  title = 'Outputs',
  items,
  emptyText = 'Generated outputs will appear here.',
  actions
}: {
  title?: string;
  items: OutputGalleryItem[];
  emptyText?: string;
  actions?: ReactNode;
}) {
  const [activeItem, setActiveItem] = useState<OutputGalleryItem | null>(null);

  useEffect(() => {
    if (!activeItem) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveItem(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeItem]);

  return (
    <>
      <section className="rounded-[26px] border border-violet-100 bg-white/68 p-3 shadow-[0_18px_50px_rgba(124,58,237,0.08)]">
        <div className="flex items-center justify-between gap-3 px-1 pb-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">{title}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{items.length ? `${items.length} saved result${items.length === 1 ? '' : 's'}` : emptyText}</p>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>

        {items.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <article key={item.id} className="group overflow-hidden rounded-[18px] border border-violet-100 bg-white">
                <button type="button" onClick={() => setActiveItem(item)} className="relative block aspect-video w-full overflow-hidden bg-slate-950 text-left">
                  {item.type === 'image' ? (
                    <img src={item.url} alt={item.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  ) : (
                    <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-contain transition duration-300 group-hover:scale-105" />
                  )}
                  <span className="absolute inset-0 bg-slate-950/0 transition group-hover:bg-slate-950/25" />
                  <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-slate-900 shadow-sm">
                    Open
                  </span>
                </button>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-800">{item.title}</p>
                    {item.subtitle && <p className="mt-0.5 truncate text-[11px] font-bold text-slate-400">{item.subtitle}</p>}
                  </div>
                  <a
                    href={item.url}
                    download={item.filename || 'savi-output'}
                    className="shrink-0 rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-black text-white"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Save
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid min-h-[138px] place-items-center rounded-[20px] border border-dashed border-violet-200 bg-white/45 px-4 text-center text-sm font-bold text-slate-400">
            {emptyText}
          </div>
        )}
      </section>

      {activeItem && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/78 p-3 backdrop-blur-xl" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close output preview" className="absolute inset-0 cursor-default" onClick={() => setActiveItem(null)} />
          <div className="relative w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 shadow-[0_28px_100px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{activeItem.title}</p>
                {activeItem.subtitle && <p className="mt-0.5 truncate text-xs font-bold text-white/48">{activeItem.subtitle}</p>}
              </div>
              <div className="flex items-center gap-2">
                <a href={activeItem.url} download={activeItem.filename || 'savi-output'} className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-950">
                  Download
                </a>
                <button type="button" onClick={() => setActiveItem(null)} className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-lg font-light text-white hover:bg-white/10" aria-label="Close output preview">
                  x
                </button>
              </div>
            </div>
            <div className="grid max-h-[78vh] place-items-center bg-black">
              {activeItem.type === 'image' ? (
                <img src={activeItem.url} alt={activeItem.title} className="max-h-[78vh] w-full object-contain" />
              ) : (
                <video src={activeItem.url} controls autoPlay className="max-h-[78vh] w-full object-contain" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

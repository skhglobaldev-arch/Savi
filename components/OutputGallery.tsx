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
      <section className="rounded-xl border border-white/10 bg-white/[0.035] p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3 px-1 pb-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/55">{title}</p>
            <p className="mt-1 text-xs font-bold text-white/45">{items.length ? `${items.length} saved result${items.length === 1 ? '' : 's'}` : emptyText}</p>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>

        {items.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <article key={item.id} className="group overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                <button type="button" onClick={() => setActiveItem(item)} className="relative block aspect-video min-h-[44px] w-full overflow-hidden bg-black text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                  {item.type === 'image' ? (
                    <img src={item.url} alt={item.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  ) : (
                    <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-contain transition duration-300 group-hover:scale-105" />
                  )}
                  <span className="absolute inset-0 bg-slate-950/0 transition group-hover:bg-slate-950/25" />
                  <span className="absolute right-2 top-2 rounded-md bg-black/65 px-2 py-1 text-[10px] font-black text-white shadow-sm">
                    Open
                  </span>
                </button>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-white">{item.title}</p>
                    {item.subtitle && <p className="mt-0.5 truncate text-[11px] font-bold text-white/45">{item.subtitle}</p>}
                  </div>
                  <a
                    href={item.url}
                    download={item.filename || 'output'}
                    className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg bg-white px-3 py-1.5 text-[11px] font-black text-black"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Save
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="savi-empty-state min-h-[138px] px-4 font-semibold">
            {emptyText}
          </div>
        )}
      </section>

      {activeItem && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/78 p-3 backdrop-blur-xl" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close output preview" className="absolute inset-0 cursor-default" onClick={() => setActiveItem(null)} />
          <div className="relative w-full max-w-6xl overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0d] shadow-[0_28px_100px_rgba(0,0,0,0.5)]" aria-labelledby="output-gallery-title">
            <h2 id="output-gallery-title" className="sr-only">Output preview</h2>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{activeItem.title}</p>
                {activeItem.subtitle && <p className="mt-0.5 truncate text-xs font-bold text-white/48">{activeItem.subtitle}</p>}
              </div>
              <div className="flex items-center gap-2">
                <a href={activeItem.url} download={activeItem.filename || 'output'} className="inline-flex min-h-[44px] items-center rounded-lg bg-white px-4 py-2 text-xs font-black text-black">
                  Download
                </a>
                <button type="button" onClick={() => setActiveItem(null)} className="grid h-[44px] w-[44px] place-items-center rounded-lg border border-white/15 text-lg font-light text-white hover:bg-white/10" aria-label="Close output preview">
                  <span aria-hidden="true" className="relative block h-4 w-4 before:absolute before:left-1/2 before:top-1/2 before:h-px before:w-4 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:bg-current after:absolute after:left-1/2 after:top-1/2 after:h-px after:w-4 after:-translate-x-1/2 after:-translate-y-1/2 after:-rotate-45 after:bg-current" />
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

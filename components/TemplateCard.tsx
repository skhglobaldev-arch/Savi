'use client';

import type { TemplateItem } from '@/lib/templates';
import { ToolPreview } from '@/components/ToolPreview';

export function TemplateCard({ item, onUse }: { item: TemplateItem; onUse: (item: TemplateItem) => void }) {
  return (
    <article className="group overflow-hidden rounded-[18px] border border-white/10 bg-[#0d0d0f] p-3 transition hover:-translate-y-0.5 hover:border-white/22 hover:bg-[#141417]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase text-white/36">{item.category}</p>
          <h3 className="mt-1.5 text-base font-semibold leading-snug text-white">{item.title}</h3>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/58">
          {item.credits} credits
        </span>
      </div>
      <ToolPreview previewId={item.id} compact />
      <p className="mt-3 min-h-[42px] text-xs leading-5 text-white/54">{item.description}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/52">Input: {item.inputType}</span>
        <button
          onClick={() => onUse(item)}
          className="rounded-full bg-white/12 px-3 py-1.5 text-xs font-semibold text-white transition group-hover:bg-white/18"
        >
          Use
        </button>
      </div>
    </article>
  );
}

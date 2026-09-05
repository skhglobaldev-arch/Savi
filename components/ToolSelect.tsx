'use client';

import { useEffect, useRef, useState } from 'react';

export function ToolSelect<T extends string>({
  label,
  value,
  options,
  labels,
  suffix = '',
  onChange
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  suffix?: string;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const currentLabel = `${labels?.[value] ?? value}${suffix}`;

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-full border border-violet-100 bg-white/72 px-4 text-left text-sm font-black text-slate-800 shadow-[0_12px_30px_rgba(124,58,237,0.08)] backdrop-blur transition hover:border-violet-200"
      >
        <span className="min-w-0">
          <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-violet-500">{label}</span>
          <span className="block truncate leading-4">{currentLabel}</span>
        </span>
        <span className={`text-xs text-violet-500 transition ${open ? 'rotate-180' : ''}`}>v</span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-full min-w-[150px] overflow-hidden rounded-[20px] border border-violet-100 bg-white/92 p-1 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-xl">
          {options.map((option) => {
            const active = option === value;
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-sm font-black transition ${active ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-violet-50'}`}
              >
                <span>{`${labels?.[option] ?? option}${suffix}`}</span>
                {active && <span>OK</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

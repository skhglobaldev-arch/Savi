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
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const currentLabel = `${labels?.[value] ?? value}${suffix}`;

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.06] px-4 text-left text-sm font-black text-white shadow-sm backdrop-blur transition hover:border-white/20"
      >
        <span className="min-w-0">
          <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-violet-500">{label}</span>
          <span className="block truncate leading-4">{currentLabel}</span>
        </span>
        <span aria-hidden="true" className={`h-2.5 w-2.5 rotate-45 border-b border-r border-white/45 transition ${open ? 'rotate-[225deg]' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-full min-w-[150px] overflow-hidden rounded-lg border border-white/10 bg-[#17171c] p-1 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl" role="listbox" aria-label={label}>
          {options.map((option) => {
            const active = option === value;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex min-h-[44px] w-full items-center justify-between rounded-md px-3 py-2 text-sm font-black transition ${active ? 'bg-white/[0.12] text-white' : 'text-white/65 hover:bg-white/[0.06] hover:text-white'}`}
              >
                <span>{`${labels?.[option] ?? option}${suffix}`}</span>
                {active && <span aria-hidden="true" className="text-white/45">OK</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

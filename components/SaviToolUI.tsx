import type { ReactNode } from 'react';

export type ToolCategoryOption = {
  id: string;
  label: string;
  count?: number;
};

export function ToolHeader({
  eyebrow,
  title,
  description,
  mark,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  mark: string;
  children?: ReactNode;
}) {
  return (
    <header className="savi-tool-header">
      <div className="flex items-start gap-3">
        <span className="savi-tool-mark" aria-hidden="true">
          {mark}
        </span>
        <div className="min-w-0">
          <p className="savi-tool-eyebrow">{eyebrow}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.01em] text-white md:text-2xl">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{description}</p>
        </div>
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </header>
  );
}

export function ToolCategoryTabs({
  options,
  value,
  onChange,
}: {
  options: ToolCategoryOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="savi-tool-tabs" role="tablist" aria-label="Tool categories">
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`savi-tool-tab${selected ? ' savi-tool-tab-active' : ''}`}
            onClick={() => onChange(option.id)}
          >
            <span>{option.label}</span>
            {typeof option.count === 'number' ? <span className="text-[11px] text-current/55">{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function ToolActionBar({
  quote,
  credits,
  quoteLabel,
  disabled = false,
  loading,
  label,
  onClick,
}: {
  quote: number | null;
  credits: number | null;
  quoteLabel?: string;
  disabled?: boolean;
  loading?: string;
  label: string;
  onClick: () => void;
}) {
  const estimate = quote !== null ? `Estimated: ~${quote} credits` : quoteLabel ?? 'Estimate unavailable';

  return (
    <div className="savi-tool-action-row" aria-live="polite">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{estimate}</p>
        {credits !== null ? <p className="mt-1 text-xs text-white/45">Balance: {credits.toLocaleString()} credits</p> : null}
      </div>
      <button
        type="button"
        className="savi-tool-action-primary shrink-0"
        disabled={disabled}
        aria-disabled={disabled}
        onClick={onClick}
      >
        {loading ?? label}
      </button>
    </div>
  );
}

export function ToolFieldLabel({
  label,
  hint,
  badge
}: {
  label: string;
  hint?: string;
  badge?: 'Required' | 'Optional' | 'Advanced';
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        {hint ? <p className="mt-1 text-xs leading-5 text-white/45">{hint}</p> : null}
      </div>
      {badge ? <span className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/42">{badge}</span> : null}
    </div>
  );
}

export function ToolResultEmpty({ children = 'Your result will appear here.' }: { children?: ReactNode }) {
  return <div className="savi-tool-result-empty" aria-live="polite">{children}</div>;
}

export function ToolStatus({
  kind,
  children,
}: {
  kind: 'error' | 'info' | 'loading';
  children: ReactNode;
}) {
  return (
    <div
      className={`savi-tool-status savi-tool-status-${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
    >
      {children}
    </div>
  );
}

'use client';

import type { ToolMode } from './ToolModeSelector';

export function ChatInput({
  value,
  setValue,
  mode,
  selectedTemplate,
  isLoading,
  onSubmit
}: {
  value: string;
  setValue: (value: string) => void;
  mode: ToolMode;
  setMode: (mode: ToolMode) => void;
  selectedTemplate?: string;
  isLoading?: boolean;
  onSubmit: () => void;
}) {
  return (
    <section className="glass rounded-[28px] p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Ask SAVI</p>
          <h2 className="mt-1 text-2xl font-black text-white">What do you want to create?</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs font-black text-white/62">
          {mode}
        </span>
      </div>
      {selectedTemplate && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white/70">
          Selected template: <strong>{selectedTemplate}</strong>
        </div>
      )}
      <div className="rounded-[24px] border border-white/10 bg-black/35 p-4">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={5}
          placeholder="Ask anything, paste text, or describe what you want to create..."
          className="min-h-[116px] w-full resize-none bg-transparent text-base leading-7 text-white outline-none placeholder:text-white/34"
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-bold text-white/62">+ Upload</button>
            <button className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-bold text-white/62">Image</button>
            <button className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-bold text-white/62">Voice</button>
          </div>
          <button disabled={isLoading} onClick={onSubmit} className="rounded-full bg-white px-6 py-3 font-black text-black shadow-[0_16px_35px_rgba(255,255,255,0.12)] hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60">
            {isLoading ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </section>
  );
}

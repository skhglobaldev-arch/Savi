'use client';

export function CreditBadge({ credits }: { credits: number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/60">
      <span className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_18px_rgba(59,130,246,0.55)]" />
      Credits <strong className="text-white">{credits}</strong>
    </div>
  );
}

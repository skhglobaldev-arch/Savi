'use client';

export function CreditBadge({ credits }: { credits: number | null | undefined }) {
  const label = typeof credits === 'number' ? credits.toLocaleString() : '—';

  return (
    <div className="savi-chip" aria-label={`${label} credits available`}>
      <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.35)]" aria-hidden="true" />
      Credits <strong className="text-white">{label}</strong>
    </div>
  );
}

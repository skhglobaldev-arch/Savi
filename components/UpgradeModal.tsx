'use client';

export function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm">
      <div className="glass max-w-md rounded-[32px] p-7">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200/80">Credits needed</p>
        <h2 className="mt-3 text-3xl font-black">Upgrade placeholder</h2>
        <p className="mt-4 leading-7 text-white/70">
          You do not have enough mock credits for this action. Stripe subscription and credit top-up will be connected later.
        </p>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="rounded-full bg-white px-5 py-3 font-bold text-black">Close</button>
          <button onClick={onClose} className="rounded-full border border-white/15 px-5 py-3 font-bold text-white/80">View plans</button>
        </div>
      </div>
    </div>
  );
}

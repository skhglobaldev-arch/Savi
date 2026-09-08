'use client';

export function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm">
      <div className="glass max-w-md rounded-[32px] p-7">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200/80">Credits needed</p>
        <h2 className="mt-3 text-3xl font-black">Not enough credits</h2>
        <p className="mt-4 leading-7 text-white/70">
          SAVI could not start this request because your available balance is too low. No credits were used.
        </p>
        <div className="mt-6 flex">
          <button onClick={onClose} className="rounded-full bg-white px-5 py-3 font-bold text-black">Close</button>
        </div>
      </div>
    </div>
  );
}

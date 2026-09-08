'use client';

import Link from 'next/link';

export function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="glass w-full max-w-md rounded-[32px] p-7" role="dialog" aria-modal="true" aria-labelledby="upgrade-modal-title" aria-describedby="upgrade-modal-description">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200/80">Credits needed</p>
        <h2 id="upgrade-modal-title" className="mt-3 text-3xl font-black">Not enough credits</h2>
        <p id="upgrade-modal-description" className="mt-4 leading-7 text-white/70">
          SAVI could not start this request because your available balance is too low. No credits were used.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/credits" onClick={onClose} className="rounded-full bg-white px-5 py-3 font-bold text-black">View credits</Link>
          <button type="button" onClick={onClose} className="rounded-full border border-white/12 bg-white/8 px-5 py-3 font-bold text-white/78">Close</button>
        </div>
      </div>
    </div>
  );
}

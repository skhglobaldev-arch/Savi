'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

export function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;
      const dialog = closeButtonRef.current?.closest('[role="dialog"]');
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="glass w-full max-w-md rounded-2xl p-6 sm:p-7" role="dialog" aria-modal="true" aria-labelledby="upgrade-modal-title" aria-describedby="upgrade-modal-description">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200/80">Credits needed</p>
        <h2 id="upgrade-modal-title" className="mt-3 text-2xl font-bold sm:text-3xl">Not enough credits</h2>
        <p id="upgrade-modal-description" className="mt-4 leading-7 text-white/70">
          SAVI could not start this request because your available balance is too low. No credits were used.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/credits" onClick={onClose} className="inline-flex min-h-[44px] items-center rounded-lg bg-white px-5 py-3 font-bold text-black">Credits &amp; Plans</Link>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="min-h-[44px] rounded-lg border border-white/12 bg-white/8 px-5 py-3 font-bold text-white/78">Close</button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useSaviAuth } from '@/lib/auth/useSaviAuth';
import { LegalConsentNotice } from './LegalLinks';

export function SaviAccountButton({ credits, className = '' }: { credits: number | null | undefined; className?: string }) {
  const { user, isLoading, signIn } = useSaviAuth();

  if (isLoading) {
    return <div className={`savi-skeleton h-9 w-24 ${className}`} aria-hidden="true" />;
  }

  if (!user) {
    return (
      <div className={`flex flex-col items-end ${className}`}>
        <button
          type="button"
          onClick={() => signIn()}
          className="savi-button savi-button-secondary"
        >
          <GoogleMark />
          Sign in
        </button>
        <LegalConsentNotice className="mt-1 max-w-[210px] text-right" />
      </div>
    );
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || 'S';
  return (
    <div className={`inline-flex h-9 max-w-[190px] items-center gap-2 rounded-full border border-white/14 bg-[#1a1a1a]/88 py-1 pl-1 pr-3 shadow-[0_12px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl ${className}`} title={user.email}>
      <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-violet-600 text-xs font-bold text-white">
        {user.picture ? <img src={user.picture} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : initial}
      </span>
      <span className="min-w-0 truncate text-xs font-medium text-white/84">{user.name}</span>
      <span className="h-4 w-px bg-white/12" />
      <span className="text-[11px] font-semibold text-violet-200">{typeof credits === 'number' ? credits.toLocaleString() : '—'}</span>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path fill="#4285F4" d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 0 1-2 3.1v2.5h3.2c1.9-1.8 3.1-4.4 3.1-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.2-2.5c-.9.6-2 .9-3.5.9-2.7 0-5-1.8-5.8-4.3H2.9v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.2 13.7a6 6 0 0 1 0-3.4V7.7H2.9A10 10 0 0 0 2.9 16l3.3-2.3Z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9C17 2.9 14.7 2 12 2a10 10 0 0 0-9.1 5.7l3.3 2.6C7 7.8 9.3 6 12 6Z" />
    </svg>
  );
}

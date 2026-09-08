'use client';

import Link from 'next/link';
import { CreditBadge } from './CreditBadge';

export function Header({ credits }: { credits?: number | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#101012]/88 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 via-blue-400 to-cyan-300">
            <span className="text-xs font-black text-white">S</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">SAVI</p>
            <p className="text-[11px] font-medium text-white/42">by SKH.GLOBAL</p>
          </div>
        </Link>
        <nav className="hidden items-center gap-5 text-sm font-medium text-white/54 md:flex">
          <Link className="hover:text-white" href="/workspace">Workspace</Link>
          <Link className="hover:text-white" href="/credits">Credits</Link>
          <Link className="hover:text-white" href="/settings">Settings</Link>
        </nav>
        <CreditBadge credits={credits} />
      </div>
    </header>
  );
}

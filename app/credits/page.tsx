'use client';

import { SaviSidebar } from '@/components/SaviSidebar';
import { useAuthoritativeCredits } from '@/lib/savi/useAuthoritativeCredits';

export default function CreditsPage() {
  const { credits, isLoading } = useAuthoritativeCredits();

  return (
    <main className="savi-app-home min-h-screen bg-black text-white">
      <SaviSidebar active="Credits" credits={credits} />
      <section className="savi-content-shell mx-auto max-w-7xl px-5 py-24 lg:py-12">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-violet-500">Credits</p>
        <h1 className="mt-4 text-5xl font-black">Your SAVI balance.</h1>
        <p className="mt-5 max-w-2xl leading-8 text-slate-600">
          This balance is loaded from your protected SAVI account. Tool quotes are shown before generation, and the server records every successful charge.
        </p>
        <div className="mt-10 max-w-xl glass rounded-[34px] p-6">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-violet-500">Available credits</p>
          <p className="mt-4 text-5xl font-black">
            {isLoading ? 'Loading...' : credits === null ? 'Sign in to view' : credits.toLocaleString()}
          </p>
          <p className="mt-5 text-sm leading-6 text-slate-600">
            SAVI does not offer purchasing, top-ups, or subscription checkout in this release. This page is an account balance view only.
          </p>
        </div>
      </section>
    </main>
  );
}

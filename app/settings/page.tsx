'use client';

import { SaviSidebar } from '@/components/SaviSidebar';
import { useAuthoritativeCredits } from '@/lib/savi/useAuthoritativeCredits';

export default function SettingsPage() {
  const { credits } = useAuthoritativeCredits();

  return (
    <main className="savi-app-home min-h-screen bg-black text-white">
      <SaviSidebar active="Settings" credits={credits} />
      <section className="savi-content-shell mx-auto max-w-4xl px-5 py-24 lg:py-12">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-200/75">Settings</p>
        <h1 className="mt-4 text-5xl font-black">Your SAVI workspace</h1>
        <div className="glass mt-8 rounded-[34px] p-6">
          <h2 className="text-2xl font-black">Account and generation</h2>
          <div className="mt-5 space-y-4 text-white/65">
            <p>Your SAVI session is connected to your Google account.</p>
            <p>Credits are held in your protected SAVI account and every paid tool confirms its credit use before it runs.</p>
            <p>Generated images, videos, audio, and documents stay private to your account and appear in All Media.</p>
            <p>Use Ask SAVI to plan a task, then confirm a tool action when you are ready to generate.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

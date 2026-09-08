'use client';

import { SaviSidebar } from '@/components/SaviSidebar';
import { useCommerceAccount } from '@/lib/commerce/useCommerceAccount';
import { useAuthoritativeCredits } from '@/lib/savi/useAuthoritativeCredits';
import { LegalLinks } from '@/components/LegalLinks';

export default function SettingsPage() {
  const { credits } = useAuthoritativeCredits();
  const { state, error, isLoading, pendingAction, openBillingPortal } = useCommerceAccount();

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
        <div className="glass mt-6 rounded-[34px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200/75">Billing</p>
              <h2 className="mt-3 text-2xl font-black">Subscription and payments</h2>
            </div>
            <button
              type="button"
              onClick={() => void openBillingPortal()}
              disabled={isLoading || !state?.billingProfile.exists || pendingAction === 'billing-portal'}
              className="rounded-full bg-white px-4 py-2 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pendingAction === 'billing-portal' ? 'Opening...' : 'Manage billing'}
            </button>
          </div>
          {isLoading ? <p className="mt-5 text-white/60">Loading billing state...</p> : null}
          {!isLoading && error ? <p className="mt-5 text-rose-200">{error}</p> : null}
          {!isLoading && !error && state?.currentSubscription ? (
            <div className="mt-5 rounded-2xl border border-white/10 p-4 text-white/70">
              <p className="font-bold text-white">{state.currentSubscription.planId}</p>
              <p className="mt-1 text-sm">Status: {state.currentSubscription.status}</p>
              {state.currentSubscription.currentPeriodEnd ? (
                <p className="mt-1 text-sm">Current period ends {new Date(state.currentSubscription.currentPeriodEnd).toLocaleDateString()}</p>
              ) : null}
              {state.currentSubscription.cancelAtPeriodEnd ? <p className="mt-1 text-sm">Cancellation is scheduled at period end.</p> : null}
              {state.currentSubscription.entitlements.length ? (
                <p className="mt-1 text-sm">Entitlements: {state.currentSubscription.entitlements.join(', ')}</p>
              ) : null}
            </div>
          ) : null}
          {!isLoading && !error && !state?.currentSubscription ? (
            <p className="mt-5 text-white/60">No active subscription is recorded for this account.</p>
          ) : null}
          <p className="mt-5 text-sm leading-6 text-white/50">Subscription credits roll over up to the plan cap. Welcome and top-up credits are not clipped or expired.</p>
        </div>
        <div className="glass mt-6 rounded-[34px] p-6">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200/75">Purchase history</p>
          <h2 className="mt-3 text-2xl font-black">Recent billing activity</h2>
          {!isLoading && state?.recentPurchases.length ? (
            <div className="mt-5 space-y-3">
              {state.recentPurchases.slice(0, 10).map((purchase, index) => {
                const item = typeof purchase.catalogItemId === 'string' ? purchase.catalogItemId : 'Commerce item';
                const status = typeof purchase.status === 'string' ? purchase.status : 'recorded';
                const creditsGranted = typeof purchase.creditsGranted === 'number' ? purchase.creditsGranted : null;
                const createdAt = typeof purchase.createdAt === 'string' ? purchase.createdAt : null;
                return (
                  <div key={typeof purchase.id === 'string' ? purchase.id : `${item}-${index}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 text-sm text-white/65 last:border-0 last:pb-0">
                    <span>{item}{creditsGranted ? ` · ${creditsGranted.toLocaleString()} credits` : ''}</span>
                    <span>{status}{createdAt ? ` · ${new Date(createdAt).toLocaleDateString()}` : ''}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {!isLoading && !state?.recentPurchases.length ? <p className="mt-5 text-white/60">No purchases are recorded for this account.</p> : null}
        </div>
        <LegalLinks className="mt-12 border-t border-white/10 pt-6" />
      </section>
    </main>
  );
}

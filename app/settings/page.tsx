'use client';

import Link from 'next/link';
import { SaviSidebar } from '@/components/SaviSidebar';
import { useCommerceAccount } from '@/lib/commerce/useCommerceAccount';
import { useAuthoritativeCredits } from '@/lib/savi/useAuthoritativeCredits';
import { LegalLinks } from '@/components/LegalLinks';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';

export default function SettingsPage() {
  const { credits } = useAuthoritativeCredits();
  const { user, signIn } = useSaviAuth();
  const { state, error, isLoading, pendingAction, openBillingPortal } = useCommerceAccount();
  const currentSubscription = state?.currentSubscription ?? null;
  const currentPlan = currentSubscription
    ? state?.catalog.plans.find((plan) => plan.id === currentSubscription.planId) ?? null
    : state?.catalog.plans.find((plan) => plan.id === 'free') ?? null;
  const planName = currentPlan?.displayName ?? (user ? 'Plan unavailable' : 'Free plan');

  return (
    <main className="savi-app-home min-h-screen bg-black text-white">
      <SaviSidebar active="Settings" credits={credits} />
      <section className="savi-content-shell mx-auto max-w-4xl px-5 py-24 lg:py-12">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-200/75">Settings</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Your SAVI workspace</h1>
        <div className="mt-7 border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <h2 className="text-xl font-bold sm:text-2xl">Account and generation</h2>
          <div className="mt-5 space-y-4 text-white/65">
            <p>{user ? `Signed in as ${user.email}.` : 'Sign in with Google to connect your SAVI workspace.'}</p>
            <p>Credits are protected, and paid actions confirm their cost before they run. Generated images, videos, audio, and documents stay private and appear in Library.</p>
            <p>Use Ask SAVI to plan a task, then confirm a tool action when you are ready to generate.</p>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-sm">
              <span className="text-white/52">Available credits</span>
              <span className="font-bold text-white">{typeof credits === 'number' ? credits.toLocaleString() : 'Sign in to view'}</span>
            </div>
          </div>
        </div>
        <div id="billing" className="mt-6 border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200/75">Billing</p>
              <h2 className="mt-3 text-2xl font-black">Current plan</h2>
            </div>
            <button
              type="button"
              onClick={() => user ? void openBillingPortal() : signIn()}
              disabled={Boolean(user && (isLoading || !state?.billingProfile.exists || pendingAction === 'billing-portal'))}
              className="min-h-[44px] rounded-lg bg-white px-4 py-2 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pendingAction === 'billing-portal' ? 'Opening...' : user ? 'Manage billing' : 'Sign in'}
            </button>
          </div>
          {isLoading ? <p className="mt-5 text-white/60">Loading billing state...</p> : null}
          {!isLoading && !user ? <p className="mt-5 text-white/60">Sign in to view your plan, renewal status, and billing history.</p> : null}
          {!isLoading && error ? <p className="mt-5 text-rose-200">{error}</p> : null}
          {!isLoading && user && !error ? (
            <div className="mt-5 border-t border-white/10 pt-5 text-white/70">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-xl font-bold text-white">{planName}</p>
                <span className="text-sm text-white/50">{currentSubscription ? formatBillingStatus(currentSubscription.status) : 'Free'}</span>
              </div>
              {currentSubscription?.currentPeriodEnd ? (
                <p className="mt-3 text-sm text-white/60">
                  {currentSubscription.cancelAtPeriodEnd ? 'Ends on' : 'Renews on'} {formatBillingDate(currentSubscription.currentPeriodEnd)}
                </p>
              ) : null}
              {currentSubscription?.cancelAtPeriodEnd ? <p className="mt-2 text-sm text-amber-100/75">Cancellation is scheduled for the end of the current billing period.</p> : null}
              {!currentSubscription ? <p className="mt-3 text-sm text-white/55">Explore plans when you are ready to add recurring credits.</p> : null}
              <div className="mt-5 flex flex-wrap items-center gap-4 text-sm">
                <Link href="/credits" className="inline-flex min-h-[44px] items-center rounded-lg font-bold text-cyan-100 underline decoration-cyan-100/30 underline-offset-4">Credits &amp; Plans</Link>
                <span className="text-white/35">Purchase history is listed below.</span>
              </div>
            </div>
          ) : null}
          <p className="mt-5 text-sm leading-6 text-white/50">Subscription credits roll over up to the plan cap. Welcome and top-up credits are not clipped or expired.</p>
        </div>
        <div className="mt-6 border border-white/10 bg-white/[0.035] p-5 sm:p-6">
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

function formatBillingDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatBillingStatus(status: string): string {
  return status.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

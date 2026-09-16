'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SaviAppShell, SaviPageHeader, SaviTopBar } from '@/components/SaviAppShell';
import { useCommerceAccount } from '@/lib/commerce/useCommerceAccount';
import { useAuthoritativeCredits } from '@/lib/savi/useAuthoritativeCredits';
import { LegalLinks } from '@/components/LegalLinks';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';

export default function SettingsPage() {
  const { credits } = useAuthoritativeCredits();
  const { user, signIn, signOut } = useSaviAuth();
  const { state, error, isLoading, pendingAction, openBillingPortal } = useCommerceAccount();
  const [deletionState, setDeletionState] = useState<'idle' | 'submitting' | 'requested'>('idle');
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const currentSubscription = state?.currentSubscription ?? null;
  const currentPlan = currentSubscription
    ? state?.catalog.plans.find((plan) => plan.id === currentSubscription.planId) ?? null
    : state?.catalog.plans.find((plan) => plan.id === 'free') ?? null;
  const planName = currentPlan?.displayName ?? (user ? 'Plan unavailable' : 'Free plan');

  async function requestAccountDeletion() {
    if (!window.confirm('Request deletion of this SAVI account?')) return;
    setDeletionState('submitting');
    setDeletionError(null);
    try {
      const response = await fetch('/api/account/deletion-request', { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || 'SAVI could not record the deletion request.');
      setDeletionState('requested');
      await signOut();
    } catch (requestError) {
      setDeletionState('idle');
      setDeletionError(requestError instanceof Error ? requestError.message : 'SAVI could not record the deletion request.');
    }
  }

  return (
    <SaviAppShell active="Settings" credits={credits} contentClassName="savi-mobile-content-offset">
      <SaviTopBar title="Settings" />
      <div className="savi-page-container savi-page-container-narrow">
        <SaviPageHeader
          eyebrow="Settings"
          title="Your SAVI workspace"
          description="Manage your account, billing access, purchase history, and account preferences."
        />
        <div className="savi-panel mt-7 p-5 sm:p-6">
          <h2 className="savi-section-title sm:text-2xl">Account and generation</h2>
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
        <div id="billing" className="savi-panel mt-6 scroll-mt-20 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="savi-eyebrow">Billing</p>
              <h2 className="mt-1 text-2xl font-bold">Current plan</h2>
            </div>
            <button
              type="button"
              onClick={() => user ? void openBillingPortal() : signIn()}
              disabled={Boolean(user && (isLoading || !state?.billingProfile.exists || pendingAction === 'billing-portal'))}
              className="savi-button savi-button-primary"
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
                <Link href="/credits" className="savi-button savi-button-ghost px-0 text-violet-200">Credits &amp; Plans</Link>
                <span className="text-white/35">Purchase history is listed below.</span>
              </div>
            </div>
          ) : null}
          <p className="mt-5 text-sm leading-6 text-white/50">Subscription credits roll over up to the plan cap. Welcome and top-up credits are not clipped or expired.</p>
        </div>
        <div className="savi-panel mt-6 p-5 sm:p-6">
          <p className="savi-eyebrow">Purchase history</p>
          <h2 className="mt-1 text-2xl font-bold">Recent billing activity</h2>
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
        <div className="savi-panel mt-6 border-rose-200/15 p-5 sm:p-6">
          <p className="savi-eyebrow text-rose-200/80">Account</p>
          <h2 className="mt-1 text-2xl font-bold">Request account deletion</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60">Submit an authenticated deletion request. The operator will process it under the published account and billing policy; you will be signed out after the request is recorded.</p>
          {deletionState === 'requested' ? <p className="mt-4 text-sm text-emerald-200">Your deletion request was recorded and you have been signed out.</p> : null}
          {deletionError ? <p className="mt-4 text-sm text-rose-200">{deletionError}</p> : null}
          {user && deletionState !== 'requested' ? (
            <button type="button" onClick={() => void requestAccountDeletion()} disabled={deletionState === 'submitting'} className="savi-button savi-button-danger mt-5">
              {deletionState === 'submitting' ? 'Recording request...' : 'Request account deletion'}
            </button>
          ) : null}
        </div>
        <LegalLinks className="mt-12 border-t border-white/10 pt-6" />
      </div>
    </SaviAppShell>
  );
}

function formatBillingDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatBillingStatus(status: string): string {
  return status.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

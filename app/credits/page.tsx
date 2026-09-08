'use client';

import { SaviSidebar } from '@/components/SaviSidebar';
import { useCommerceAccount } from '@/lib/commerce/useCommerceAccount';
import { useAuthoritativeCredits } from '@/lib/savi/useAuthoritativeCredits';

export default function CreditsPage() {
  const { credits, isLoading } = useAuthoritativeCredits();
  const {
    state,
    error,
    isLoading: isCommerceLoading,
    pendingAction,
    startSubscriptionCheckout,
    startTopUpCheckout
  } = useCommerceAccount();

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
          <p className="mt-5 text-sm leading-6 text-slate-600">Credits are added only after a verified Stripe payment event is processed.</p>
        </div>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="glass rounded-[30px] p-6">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-violet-500">Subscriptions</p>
            <h2 className="mt-3 text-2xl font-black">Choose a SAVI plan</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Choose a plan for recurring credits. Creator is recommended for regular creative work.</p>
            <div className="mt-6 space-y-3">
              {isCommerceLoading ? <p className="text-sm text-slate-500">Loading plans...</p> : null}
              {!isCommerceLoading && !state ? <p className="text-sm text-rose-600">{error || 'Sign in to view subscription plans.'}</p> : null}
              {!isCommerceLoading && state && !state.catalog.plans.length ? (
                <p className="text-sm text-slate-500">Product decision required before plans can be offered.</p>
              ) : null}
              {state?.catalog.plans.map((plan) => (
                <div key={plan.id} className={`rounded-2xl border p-4 ${plan.recommended ? 'border-violet-500/60 bg-violet-50' : 'border-black/10'}`}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900">{plan.displayName}</h3>
                        {plan.recommended ? <span className="rounded-full bg-violet-600 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white">Recommended</span> : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {plan.priceDisplay} {plan.id === 'free' ? '' : `/${plan.billingInterval}`} · {plan.includedRecurringCredits > 0 ? `${plan.includedRecurringCredits.toLocaleString()} recurring credits` : `${plan.oneTimeWelcomeCredits.toLocaleString()} one-time welcome credits`}
                      </p>
                      {plan.rolloverCapCredits > 0 ? <p className="mt-1 text-xs text-slate-500">Subscription rollover cap: {plan.rolloverCapCredits.toLocaleString()} credits</p> : null}
                    </div>
                    <button
                      type="button"
                      disabled={!plan.checkoutAvailable || pendingAction === `plan:${plan.id}`}
                      onClick={() => void startSubscriptionCheckout(plan.id)}
                      className="shrink-0 rounded-full bg-black px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {pendingAction === `plan:${plan.id}` ? 'Opening...' : plan.id === 'free' ? 'Included' : plan.checkoutAvailable ? 'Choose plan' : 'Stripe setup pending'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-[30px] p-6">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-violet-500">Top-ups</p>
            <h2 className="mt-3 text-2xl font-black">Add credits when needed</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">One-time packs are fulfilled by the verified Stripe webhook after payment.</p>
            <div className="mt-6 space-y-3">
              {isCommerceLoading ? <p className="text-sm text-slate-500">Loading top-ups...</p> : null}
              {!isCommerceLoading && state && !state.catalog.topUpPacks.length ? (
                <p className="text-sm text-slate-500">Product decision required before top-ups can be offered.</p>
              ) : null}
              {state?.catalog.topUpPacks.map((pack) => (
                <div key={pack.id} className="rounded-2xl border border-black/10 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900">{pack.displayName}</h3>
                      <p className="mt-1 text-sm text-slate-600">{pack.priceDisplay} · {pack.creditsGranted.toLocaleString()} credits that never expire</p>
                    </div>
                    <button
                      type="button"
                      disabled={!pack.checkoutAvailable || pendingAction === `pack:${pack.id}`}
                      onClick={() => void startTopUpCheckout(pack.id)}
                      className="shrink-0 rounded-full bg-black px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {pendingAction === `pack:${pack.id}` ? 'Opening...' : pack.checkoutAvailable ? 'Add credits' : 'Stripe setup pending'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {state && state.catalog.productDecisionRequired.stripePriceIds ? (
          <p className="mt-6 text-sm text-slate-500">The approved catalog is ready. Stripe Price IDs still need manual test configuration before checkout can open.</p>
        ) : null}
      </section>
    </main>
  );
}

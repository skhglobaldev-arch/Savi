'use client';

import { SaviSidebar } from '@/components/SaviSidebar';
import { useCommerceAccount, type CommerceCatalogState } from '@/lib/commerce/useCommerceAccount';
import { useAuthoritativeCredits } from '@/lib/savi/useAuthoritativeCredits';
import { LegalLinks } from '@/components/LegalLinks';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';

type CatalogPlan = CommerceCatalogState['plans'][number];

export default function CreditsPage() {
  const { credits, isLoading: isCreditsLoading } = useAuthoritativeCredits();
  const {
    state,
    error,
    isLoading: isCommerceLoading,
    catalog: publicCatalog,
    pendingAction,
    startSubscriptionCheckout,
    startTopUpCheckout,
    openBillingPortal
  } = useCommerceAccount();
  const { user, signIn } = useSaviAuth();
  const catalog = state?.catalog ?? publicCatalog;
  const currentSubscription = state?.currentSubscription ?? null;
  const currentPlan = currentSubscription && catalog
    ? findPlan(catalog, currentSubscription.planId)
    : catalog?.plans.find((plan) => plan.id === 'free') ?? null;
  const breakdown = state?.creditBreakdown ?? null;
  const totalCredits = breakdown?.total ?? credits;
  const planCredits = breakdown?.planCredits ?? null;
  const nonPlanCredits = breakdown?.nonPlanCredits ?? null;
  const reservedCredits = breakdown?.reservedCredits ?? null;
  const isPaidPlan = Boolean(currentSubscription && currentSubscription.planId !== 'free');
  const lowCreditThreshold = getLowCreditThreshold(currentPlan, currentSubscription);
  const isLowCredits = typeof totalCredits === 'number' && totalCredits <= lowCreditThreshold;
  const planShare = typeof totalCredits === 'number' && totalCredits > 0 && typeof planCredits === 'number'
    ? Math.min(100, Math.max(0, (planCredits / totalCredits) * 100))
    : 0;

  return (
    <main className="savi-app-home min-h-screen bg-black text-white">
      <SaviSidebar active="Credits" credits={credits} />
      <section className="savi-content-shell savi-mobile-content-offset w-full max-w-6xl px-5 pb-16 lg:py-12">
        <header className="border-b border-white/10 pb-7">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-300/80">Credits &amp; Plans</p>
          <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Keep your creative flow moving.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">
                See what is available now, what belongs to your plan, and when your next plan cycle begins.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="border border-white/10 px-3 py-2 text-white/62">
                {currentPlan ? currentPlan.displayName : user ? 'Plan unavailable' : 'Free plan'}
              </span>
              {currentSubscription ? (
                <span className="border border-emerald-300/25 px-3 py-2 text-emerald-100">{getSubscriptionStatus(currentSubscription.status)}</span>
              ) : null}
            </div>
          </div>
        </header>

        {isLowCredits ? (
          <aside className="mt-6 flex flex-col gap-4 border border-amber-200/25 bg-amber-200/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-between" role="status">
            <div>
              <p className="text-sm font-bold text-amber-50">You are running low on credits.</p>
              <p className="mt-1 text-sm text-amber-50/65">Add a one-time pack or review plans before your next generation.</p>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-sm font-bold">
              <a className="inline-flex min-h-[44px] items-center text-amber-100 underline decoration-amber-100/35 underline-offset-4" href="#top-ups">Add credits</a>
              <a className="inline-flex min-h-[44px] items-center text-amber-100 underline decoration-amber-100/35 underline-offset-4" href="#plans">View plans</a>
            </div>
          </aside>
        ) : null}

        {error ? <p className="mt-5 border border-rose-200/20 bg-rose-200/[0.06] px-4 py-3 text-sm text-rose-100" role="alert">{error}</p> : null}

        <section className="mt-8 border border-white/10 bg-white/[0.035] p-5 sm:p-6" aria-labelledby="credit-overview-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/42">Balance</p>
              <h2 id="credit-overview-title" className="mt-2 text-xl font-bold">Credit overview</h2>
            </div>
            <p className="text-sm text-white/48">{isCreditsLoading || isCommerceLoading ? 'Refreshing account...' : 'Available to use now'}</p>
          </div>
          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-4xl font-black tracking-tight sm:text-5xl">{formatCredits(totalCredits)}</p>
              <p className="mt-2 text-sm text-white/52">total available credits</p>
            </div>
            <div className="w-full max-w-xl" aria-label="Credit composition">
              <div className="flex h-2 overflow-hidden bg-white/10">
                <div className="bg-violet-300" style={{ width: `${planShare}%` }} />
                <div className="bg-cyan-200/70" style={{ width: `${100 - planShare}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/52">
                <span><i className="mr-2 inline-block h-2 w-2 bg-violet-300" />Plan credits</span>
                <span><i className="mr-2 inline-block h-2 w-2 bg-cyan-200/70" />Top-up &amp; welcome credits</span>
              </div>
            </div>
          </div>
          <div className="mt-7 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">
            <CreditStat label="Plan credits" value={planCredits} />
            <CreditStat label="Top-up & welcome credits" value={nonPlanCredits} />
            <CreditStat label="Currently in progress" value={reservedCredits} />
          </div>
          {breakdown ? (
            <p className="mt-5 max-w-3xl text-xs leading-5 text-white/42">
              Plan credits are used first. Top-up and welcome credits stay outside the plan balance and do not expire. Their live total is shown together because SAVI tracks them as one non-plan balance after spending.
            </p>
          ) : (
            <p className="mt-5 text-xs leading-5 text-white/42">The detailed composition will appear when your account balance finishes loading.</p>
          )}
        </section>

        <section className="mt-10 border border-violet-200/20 bg-violet-200/[0.045] p-5 sm:p-6" aria-labelledby="current-plan-title">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-200/70">Your plan</p>
              <h2 id="current-plan-title" className="mt-2 text-2xl font-black">{currentPlan?.displayName ?? 'Current plan unavailable'}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/58">{getPlanSummary(currentPlan, isPaidPlan)}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {isPaidPlan && state?.billingProfile.exists ? (
                <button
                  type="button"
                  onClick={() => void openBillingPortal()}
                  disabled={pendingAction === 'billing-portal'}
                  className="min-h-[44px] rounded-lg border border-white/20 bg-white/[0.08] px-4 py-2 text-sm font-bold text-white transition hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {pendingAction === 'billing-portal' ? 'Opening...' : 'Manage billing'}
                </button>
              ) : null}
              {!isPaidPlan ? <a href="#plans" className="inline-flex min-h-[44px] items-center rounded-lg border border-violet-200/35 px-4 py-2 text-sm font-bold text-violet-100 transition hover:bg-violet-200/[0.08]">Explore plans</a> : null}
            </div>
          </div>
          <div className="mt-6 grid gap-x-8 gap-y-5 border-t border-white/10 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <PlanFact label={currentPlan?.includedRecurringCredits ? 'Monthly credits' : 'Welcome credits'} value={currentPlan ? formatCredits(currentPlan.includedRecurringCredits || currentPlan.oneTimeWelcomeCredits) : 'Unavailable'} />
            <PlanFact label="Plan price" value={currentPlan ? currentPlan.priceDisplay : 'Unavailable'} />
            <PlanFact label={currentSubscription?.cancelAtPeriodEnd ? 'Ends on' : 'Next renewal'} value={formatDate(currentSubscription?.currentPeriodEnd)} />
            <PlanFact label="Status" value={currentSubscription ? getSubscriptionStatus(currentSubscription.status) : 'Free'} />
          </div>
          {currentPlan?.rolloverCapCredits ? (
            <p className="mt-6 border-t border-white/10 pt-5 text-sm leading-6 text-white/58">
              Up to {currentPlan.rolloverCapCredits.toLocaleString()} unused plan credits can roll into the next cycle. One-time top-ups and welcome credits remain available separately and do not expire.
            </p>
          ) : null}
          {currentSubscription?.cancelAtPeriodEnd ? (
            <p className="mt-4 text-sm text-amber-100/80">Your plan is set to end at the current period end. Your existing credits remain available under SAVI&apos;s current credit rules.</p>
          ) : null}
        </section>

        <section id="plans" className="mt-10 scroll-mt-8" aria-labelledby="plans-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/42">Compare</p>
              <h2 id="plans-title" className="mt-2 text-xl font-bold">Plans that fit the way you create</h2>
            </div>
            <p className="text-sm text-white/48">Creator is recommended for regular creative work.</p>
          </div>
          <div className="mt-5 overflow-hidden border-y border-white/10">
            {isCommerceLoading && !catalog ? <p className="px-4 py-5 text-sm text-white/55">Loading plans...</p> : null}
            {!isCommerceLoading && !catalog ? <p className="px-4 py-5 text-sm text-rose-100">{error || 'Pricing is unavailable right now.'}</p> : null}
            {catalog?.plans.map((plan) => {
              const isCurrent = plan.id === currentPlan?.id;
              return (
                <div key={plan.id} className={`flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between ${isCurrent ? 'bg-white/[0.055]' : ''}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-white">{plan.displayName}</h3>
                      {isCurrent ? <span className="border border-violet-200/30 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-100">Current plan</span> : null}
                      {plan.recommended ? <span className="border border-cyan-200/25 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100">Recommended</span> : null}
                    </div>
                    <p className="mt-2 text-sm text-white/55">
                      {plan.priceDisplay}{plan.id === 'free' ? '' : ` / ${plan.billingInterval}`} · {plan.includedRecurringCredits > 0 ? `${plan.includedRecurringCredits.toLocaleString()} monthly credits` : `${plan.oneTimeWelcomeCredits.toLocaleString()} welcome credits`}
                    </p>
                    {plan.rolloverCapCredits > 0 ? <p className="mt-1 text-xs text-white/38">Rollover up to {plan.rolloverCapCredits.toLocaleString()}</p> : null}
                  </div>
                  <div className="shrink-0">
                    {isCurrent ? <span className="text-sm text-white/45">Selected</span> : (
                      <button
                        type="button"
                        disabled={plan.id === 'free' || Boolean(user && (!plan.checkoutAvailable || pendingAction === `plan:${plan.id}`))}
                        onClick={() => { if (plan.id !== 'free') { if (user) void startSubscriptionCheckout(plan.id); else signIn(); } }}
                        className="min-h-[44px] rounded-lg border border-white/20 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {pendingAction === `plan:${plan.id}` ? 'Opening...' : plan.id === 'free' ? 'Included' : !user ? 'Sign in to choose' : plan.checkoutAvailable ? 'Choose plan' : 'Unavailable'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {catalog && !catalog.plans.length ? <p className="px-4 py-5 text-sm text-white/55">Plans are not available yet.</p> : null}
          </div>
        </section>

        <section id="top-ups" className="mt-10 scroll-mt-8" aria-labelledby="top-ups-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/42">One-time credits</p>
              <h2 id="top-ups-title" className="mt-2 text-xl font-bold">Add a little more room</h2>
            </div>
            <p className="text-sm text-white/48">Top-ups are added to your balance and do not expire.</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {isCommerceLoading && !catalog ? <p className="text-sm text-white/55">Loading top-ups...</p> : null}
            {catalog?.topUpPacks.map((pack) => (
              <div key={pack.id} className="flex min-h-40 flex-col justify-between border border-white/10 bg-white/[0.035] p-4">
                <div>
                  <h3 className="font-bold text-white">{pack.displayName}</h3>
                  <p className="mt-2 text-2xl font-black text-white">{pack.priceDisplay}</p>
                  <p className="mt-1 text-sm text-white/52">{pack.creditsGranted.toLocaleString()} credits · one-time</p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(user && (!pack.checkoutAvailable || pendingAction === `pack:${pack.id}`))}
                  onClick={() => user ? void startTopUpCheckout(pack.id) : signIn()}
                  className="mt-5 min-h-[44px] w-full rounded-lg border border-white/20 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pendingAction === `pack:${pack.id}` ? 'Opening...' : !user ? 'Sign in to add' : pack.checkoutAvailable ? 'Add credits' : 'Unavailable'}
                </button>
              </div>
            ))}
            {catalog && !catalog.topUpPacks.length ? <p className="text-sm text-white/55">Top-ups are not available yet.</p> : null}
          </div>
        </section>

        <LegalLinks className="mt-12 border-t border-white/10 pt-6" />
      </section>
    </main>
  );
}

function findPlan(catalog: CommerceCatalogState, planId: string): CatalogPlan | null {
  return catalog.plans.find((plan) => plan.id === planId) ?? null;
}

function formatCredits(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toLocaleString() : 'Unavailable';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function getSubscriptionStatus(status: string): string {
  return status.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function getPlanSummary(plan: CatalogPlan | null, isPaidPlan: boolean): string {
  if (!plan) return 'Your current plan details are temporarily unavailable.';
  if (!isPaidPlan) return 'Start with the essentials, then move up when your creative work calls for more room.';
  return `${plan.includedRecurringCredits.toLocaleString()} credits each month for ${plan.priceDisplay}, with a clear rollover cap for unused plan credits.`;
}

function getLowCreditThreshold(plan: CatalogPlan | null, subscription: CommerceAccountSubscription | null): number {
  if (!plan || plan.id === 'free' || !subscription) return 50;
  return Math.max(50, Math.round(plan.includedRecurringCredits * 0.1));
}

type CommerceAccountSubscription = NonNullable<ReturnType<typeof useCommerceAccount>['state']>['currentSubscription'];

function CreditStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-xs text-white/42">{label}</p>
      <p className="mt-2 text-lg font-bold text-white">{formatCredits(value)}</p>
    </div>
  );
}

function PlanFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-white/42">{label}</p>
      <p className="mt-2 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';

export type CommerceAccountState = {
  availableCredits: number | null;
  creditBreakdown: {
    total: number;
    planCredits: number;
    nonPlanCredits: number;
    reservedCredits: number;
    reservedPlanCredits: number;
  } | null;
  catalog: {
    version: string;
    plans: Array<{
      id: string;
      displayName: string;
      provider: 'stripe' | 'internal';
      billingInterval: 'month' | 'year';
      currency: string;
      priceDisplay: string;
      includedRecurringCredits: number;
      oneTimeWelcomeCredits: number;
      rolloverCapCredits: number;
      entitlements: string[];
      recommended: boolean;
      status: string;
      catalogVersion: string;
      checkoutAvailable: boolean;
    }>;
    topUpPacks: Array<{
      id: string;
      displayName: string;
      currency: string;
      priceDisplay: string;
      creditsGranted: number;
      status: string;
      catalogVersion: string;
      checkoutAvailable: boolean;
    }>;
    productDecisionRequired: {
      prices: boolean;
      stripePriceIds: boolean;
      creditRollover: boolean;
      refunds: boolean;
    };
  };
  billingProfile: {
    provider: 'stripe';
    exists: boolean;
    email?: string | null;
    createdAt?: string | null;
  };
  currentSubscription: {
    id: string;
    provider: string;
    planId: string;
    catalogVersion: string;
    status: string;
    providerStatus: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: string | null;
    entitlements: string[];
  } | null;
  recentPurchases: Array<Record<string, unknown>>;
  recentCreditGrants: Array<Record<string, unknown>>;
};

export type CommerceCatalogState = CommerceAccountState['catalog'];

type CheckoutKind = 'subscription' | 'topup';

async function checkout(kind: CheckoutKind, id: string) {
  const response = await fetch(`/api/commerce/checkout/${kind === 'subscription' ? 'subscription' : 'topup'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(kind === 'subscription' ? { planId: id } : { packId: id })
  });
  const data = (await response.json().catch(() => ({}))) as { url?: unknown; error?: unknown };
  if (!response.ok || typeof data.url !== 'string') {
    throw new Error(typeof data.error === 'string' ? data.error : 'Checkout is unavailable.');
  }
  window.location.assign(data.url);
}

export function useCommerceAccount() {
  const { user, isLoading: isAuthLoading } = useSaviAuth();
  const [state, setState] = useState<CommerceAccountState | null>(null);
  const [catalog, setCatalog] = useState<CommerceCatalogState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    let catalogResponse: Response | null = null;
    try {
      catalogResponse = await fetch('/api/commerce/catalog', { cache: 'no-store' });
      const catalogData = (await catalogResponse.json().catch(() => ({}))) as Partial<CommerceCatalogState>;
      if (catalogResponse.ok && Array.isArray(catalogData.plans) && Array.isArray(catalogData.topUpPacks)) {
        setCatalog(catalogData as CommerceCatalogState);
      } else {
        setCatalog(null);
      }
    } catch {
      setCatalog(null);
    }

    if (!user) {
      setState(null);
      setError(catalogResponse?.ok === false ? 'Pricing is unavailable right now.' : null);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/commerce/account', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const data = (await response.json().catch(() => ({}))) as CommerceAccountState & { error?: unknown };
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Billing is unavailable.');
      setState(data);
      setCatalog(data.catalog);
      setError(null);
      return data;
    } catch (caught) {
      setState(null);
      setError(caught instanceof Error ? caught.message : 'Billing is unavailable.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isAuthLoading) return;
    void refresh();
  }, [isAuthLoading, refresh]);

  const startSubscriptionCheckout = useCallback(async (planId: string) => {
    setPendingAction(`plan:${planId}`);
    try {
      await checkout('subscription', planId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Checkout is unavailable.');
    } finally {
      setPendingAction(null);
    }
  }, []);

  const startTopUpCheckout = useCallback(async (packId: string) => {
    setPendingAction(`pack:${packId}`);
    try {
      await checkout('topup', packId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Checkout is unavailable.');
    } finally {
      setPendingAction(null);
    }
  }, []);

  const openBillingPortal = useCallback(async () => {
    setPendingAction('billing-portal');
    try {
      const response = await fetch('/api/commerce/billing-portal', {
        method: 'POST',
        credentials: 'same-origin'
      });
      const data = (await response.json().catch(() => ({}))) as { url?: unknown; error?: unknown };
      if (!response.ok || typeof data.url !== 'string') {
        throw new Error(typeof data.error === 'string' ? data.error : 'Billing portal is unavailable.');
      }
      window.location.assign(data.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Billing portal is unavailable.');
    } finally {
      setPendingAction(null);
    }
  }, []);

  return {
    state,
    catalog: state?.catalog ?? catalog,
    error,
    isLoading: isAuthLoading || isLoading,
    pendingAction,
    refresh,
    startSubscriptionCheckout,
    startTopUpCheckout,
    openBillingPortal
  };
}

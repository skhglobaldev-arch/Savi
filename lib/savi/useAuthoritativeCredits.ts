'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';

type CreditBalanceResponse = {
  availableCredits?: unknown;
};

export function useAuthoritativeCredits() {
  const { user, isLoading: isAuthLoading } = useSaviAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setCredits(null);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/credits/balance', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const data = (await response.json().catch(() => ({}))) as CreditBalanceResponse;
      const availableCredits = typeof data.availableCredits === 'number' ? data.availableCredits : null;
      setCredits(response.ok ? availableCredits : null);
      return response.ok ? availableCredits : null;
    } catch {
      setCredits(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isAuthLoading) return;
    void refresh();
  }, [isAuthLoading, refresh]);

  return { credits, isLoading: isAuthLoading || isLoading, refresh };
}

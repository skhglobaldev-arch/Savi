'use client';

import { useCallback, useEffect, useState } from 'react';

export type SaviAuthUser = {
  id: string;
  email: string;
  name: string;
  picture?: string;
  planId: 'free';
};

const AUTH_CHANGED_EVENT = 'savi-auth-changed';

export function useSaviAuth() {
  const [user, setUser] = useState<SaviAuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      const data = (await response.json().catch(() => ({}))) as { user?: SaviAuthUser | null };
      setUser(data.user || null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener(AUTH_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    void fetch('/api/legal/consent', { method: 'POST' }).catch(() => undefined);
  }, [user?.id]);

  const signIn = useCallback((returnTo = `${window.location.pathname}${window.location.search}`) => {
    window.location.assign(`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`);
  }, []);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
  }, []);

  return { user, isLoading, refresh, signIn, signOut };
}

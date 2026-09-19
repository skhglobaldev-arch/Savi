import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { beginMobileGoogleSignIn, clearStoredMobileSession, currentMobileUser, readStoredMobileSession, signOutMobileSession } from './mobileAuth';
import type { MobileAuthStatus, MobileSaviUser } from './types';

type MobileAuthContextValue = {
  user: MobileSaviUser | null;
  status: MobileAuthStatus;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  restore: () => Promise<void>;
};

const MobileAuthContext = createContext<MobileAuthContextValue | null>(null);

export function MobileAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MobileSaviUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<MobileAuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const restore = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const stored = await readStoredMobileSession();
      if (!stored) {
        setToken(null);
        setUser(null);
        setStatus('signed_out');
        return;
      }
      const resolvedUser = await currentMobileUser(stored);
      if (!resolvedUser) {
        await clearStoredMobileSession();
        setToken(null);
        setUser(null);
        setStatus('signed_out');
        return;
      }
      setToken(stored);
      setUser(resolvedUser);
      setStatus('signed_in');
    } catch {
      await clearStoredMobileSession().catch(() => undefined);
      setToken(null);
      setUser(null);
      setStatus('signed_out');
    }
  }, []);

  useEffect(() => { void restore(); }, [restore]);

  const signIn = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const session = await beginMobileGoogleSignIn();
      setToken(session.token);
      setUser(session.user);
      setStatus('signed_in');
    } catch (cause) {
      setToken(null);
      setUser(null);
      setError(cause instanceof Error ? cause.message : 'SAVI sign-in could not be completed.');
      setStatus('error');
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutMobileSession(token);
    setToken(null);
    setUser(null);
    setError(null);
    setStatus('signed_out');
  }, [token]);

  const value = useMemo(() => ({ user, status, error, signIn, signOut, restore }), [error, restore, signIn, signOut, status, user]);
  return <MobileAuthContext.Provider value={value}>{children}</MobileAuthContext.Provider>;
}

export function useMobileAuth() {
  const context = useContext(MobileAuthContext);
  if (!context) throw new Error('useMobileAuth must be used inside MobileAuthProvider.');
  return context;
}

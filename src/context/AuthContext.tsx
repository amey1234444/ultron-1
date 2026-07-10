import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { apiFetch } from '../lib/apiClient';
import type { PublicUser } from '../lib/roles';

type SignupInput = {
  username: string;
  name: string;
  email: string;
  password: string;
  captchaToken: string;
  captchaAnswer: string;
};

// Self-service signups no longer log the user in — they create a pending account
// that a super admin must approve. `signup` therefore returns the outcome rather
// than setting the current user.
type SignupResult = { pending: boolean; message: string };

type AuthState = {
  user: PublicUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<SignupResult>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      const data = await res.json();
      setUser(res.ok ? (data.user ?? null) : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Heartbeat: while signed in, ping /api/auth/me periodically so the server
  // keeps this user's "last seen" fresh and they show as online to admins.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      void apiFetch('/api/auth/me').catch(() => {});
    }, 45_000);
    return () => clearInterval(id);
  }, [user]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed.');
    setUser(data.user as PublicUser);
  }, []);

  const signup = useCallback(async (input: SignupInput): Promise<SignupResult> => {
    const res = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sign up failed.');
    // No session is issued; the account is pending approval.
    return {
      pending: !!data.pending,
      message: data.message || 'Account created. Awaiting super-admin approval.',
    };
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, signup, logout, refresh }),
    [user, loading, login, signup, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider.');
  return ctx;
}

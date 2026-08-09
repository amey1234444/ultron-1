import { useRouter } from 'next/router';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '../../context/AuthContext';
import { hasAtLeast, type Role } from '../../lib/roles';
import { AppLoader } from './AppLoader';

type AuthGateProps = {
  children: ReactNode;
  minRole?: Role;
};

// Client-side guard: redirects to /login when unauthenticated, and home when the
// user lacks the required role. API routes enforce the same rules server-side.
export function AuthGate({ children, minRole }: AuthGateProps) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void router.replace('/home');
      return;
    }
    if (minRole && !hasAtLeast(user.role, minRole)) {
      void router.replace('/');
    }
  }, [loading, user, minRole, router]);

  // Covers the whole gap between signing in and the console being ready: the
  // session check, the redirect, and the first render of a heavy screen.
  if (loading || !user || (minRole && !hasAtLeast(user.role, minRole))) {
    return <AppLoader />;
  }

  return <>{children}</>;
}

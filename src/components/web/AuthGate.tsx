import { useRouter } from 'next/router';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../../context/AuthContext';
import { hasAtLeast, type Role } from '../../lib/roles';

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

  if (loading || !user || (minRole && !hasAtLeast(user.role, minRole))) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-dark">
        <ActivityIndicator color="#F5F5F5" />
      </View>
    );
  }

  return <>{children}</>;
}

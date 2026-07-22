import { useRouter } from 'next/router';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '../../context/AuthContext';
import { canManageUsers, ROLE_LABEL } from '../../lib/roles';

// Slim authentication strip rendered above the studio. Kept separate from the
// shared TopBar so the RN component tree stays untouched.
export function AccountBar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  if (!user) return null;

  const onLogout = async () => {
    await logout();
    void router.replace('/login');
  };

  return (
    <View className="flex-row flex-wrap items-center justify-between gap-2 border-b border-line-dark bg-surface-darkpanel px-3 py-2 sm:px-4">
      <View className="flex-row items-center gap-2">
        <Text className="font-body-medium text-sm text-ink">{user.name}</Text>
        <View className="rounded-full bg-accent-soft px-2 py-0.5">
          <Text className="font-body-medium text-[11px] uppercase tracking-wide text-accent">
            {ROLE_LABEL[user.role]}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        {canManageUsers(user.role) ? (
          <Pressable
            onPress={() => router.push('/admin/users')}
            className="rounded-lg border border-line-dark px-3 py-1.5"
          >
            <Text className="font-body-medium text-xs text-ink">Manage Users</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onLogout} className="rounded-lg border border-line-dark px-3 py-1.5">
          <Text className="font-body-medium text-xs text-ink">Sign Out</Text>
        </Pressable>
      </View>
    </View>
  );
}

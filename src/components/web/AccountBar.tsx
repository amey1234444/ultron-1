import { useRouter } from 'next/router';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { useAuth } from '../../context/AuthContext';
import { canManageUsers, ROLE_LABEL } from '../../lib/roles';

// Account block pinned to the bottom of the studio's left sidebar: who's signed
// in, their role, and the Manage Users / Sign Out actions. Theme-aware so it
// blends into the light or dark sidebar it sits in.
export function AccountBar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { isDark } = useAppTheme();
  if (!user) return null;

  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';

  const onLogout = async () => {
    await logout();
    void router.replace('/login');
  };

  return (
    <View className="gap-2.5 px-3 py-3">
      <View className="flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-full bg-accent-soft">
          <Text className="font-body-bold text-xs uppercase text-accent">{user.name.slice(0, 1)}</Text>
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className={cn('font-body-medium text-sm', inkClass)}>
            {user.name}
          </Text>
          <Text className="font-body-medium text-[10px] uppercase tracking-wide text-accent">
            {ROLE_LABEL[user.role]}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        {canManageUsers(user.role) ? (
          <Pressable
            onPress={() => router.push('/admin/users')}
            className={cn('items-center rounded-lg border py-1.5', lineClass)}
          >
            <Text className={cn('font-body-medium text-xs', inkClass)}>Manage Users</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onLogout} className={cn('items-center rounded-lg border py-1.5', lineClass)}>
          <Text className={cn('font-body-medium text-xs', inkClass)}>Sign Out</Text>
        </Pressable>
      </View>
    </View>
  );
}

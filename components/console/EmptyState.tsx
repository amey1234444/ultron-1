import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';

type EmptyStateProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

export function EmptyState({ title, description, children }: EmptyStateProps) {
  const { isDark } = useAppTheme();

  return (
    <View className="flex-1 items-center justify-center gap-4 p-10">
      <Text className={cn('font-body-bold text-lg tracking-tight', isDark ? 'text-ink' : 'text-ink-inverse')}>
        {title}
      </Text>
      <Text className={cn('max-w-sm text-center font-body text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {description}
      </Text>
      {children && <View className="mt-2 flex-row gap-3">{children}</View>}
    </View>
  );
}

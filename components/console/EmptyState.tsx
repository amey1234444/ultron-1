import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';

type EmptyStateProps = {
  title: string;
  description: string;
  /** Wide-tracked mono label above the title; defaults to a neutral status. */
  eyebrow?: string;
  children?: ReactNode;
};

export function EmptyState({ title, description, eyebrow = 'Nothing here yet', children }: EmptyStateProps) {
  const { isDark } = useAppTheme();

  return (
    <View className="flex-1 items-center justify-center p-10">
      <View
        className={cn(
          'max-w-md items-center gap-3 rounded-2xl border px-8 py-9',
          isDark ? 'border-line-dark bg-white/[0.03]' : 'border-line-light bg-white',
        )}
      >
        <Text className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">{eyebrow}</Text>
        <Text
          className={cn(
            'text-center font-heading text-2xl uppercase tracking-[0.04em]',
            isDark ? 'text-ink' : 'text-ink-inverse',
          )}
        >
          {title}
        </Text>
        <Text className={cn('text-center font-body text-sm leading-5', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {description}
        </Text>
        {children && <View className="mt-2 flex-row gap-3">{children}</View>}
      </View>
    </View>
  );
}

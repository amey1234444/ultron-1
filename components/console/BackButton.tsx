import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';

export function BackButton({ label = 'Back', onPress }: { label?: string; onPress: () => void }) {
  const { isDark } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className={cn(
        'self-start flex-row items-center gap-1.5 rounded-full border px-3 py-2',
        isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel',
      )}
    >
      <MaterialCommunityIcons name="arrow-left" size={16} color={isDark ? '#F5F5F5' : '#0A0A0A'} />
      <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>{label}</Text>
    </Pressable>
  );
}

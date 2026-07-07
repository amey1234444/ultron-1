import { Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';

export function RightInspector() {
  const { isDark } = useAppTheme();

  return (
    <View
      className={cn(
        'w-72 border-l p-4',
        isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light',
      )}
    >
      <Text className={cn('font-body-medium text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>Inspector</Text>
      <Text className={cn('mt-2 font-body text-xs leading-5', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        Select a project, device, rack or machine to see its properties, configuration and
        validation here.
      </Text>
    </View>
  );
}

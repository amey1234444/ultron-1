import { Pressable, Text, View } from 'react-native';

import { useAppTheme, ThemePreference } from '../hooks/useAppTheme';
import { cn } from '../lib/cn';

const OPTIONS: ThemePreference[] = ['light', 'dark'];

export function ThemeToggle() {
  const { colorScheme, setPreference, isDark } = useAppTheme();

  return (
    <View
      className={cn(
        'flex-row rounded-full border p-1',
        isDark ? 'border-line-dark' : 'border-line-light',
      )}
    >
      {OPTIONS.map((option) => {
        const active = colorScheme === option;
        return (
          <Pressable
            key={option}
            onPress={() => setPreference(option)}
            className={cn(
              'rounded-full px-3 py-1.5',
              active && (isDark ? 'bg-ink' : 'bg-ink-inverse'),
            )}
          >
            <Text
              className={cn(
                'font-body-medium text-xs',
                active
                  ? isDark
                    ? 'text-ink-inverse'
                    : 'text-ink'
                  : isDark
                    ? 'text-ink-muted'
                    : 'text-ink-inverse-muted',
              )}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

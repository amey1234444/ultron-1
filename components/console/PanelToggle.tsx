import { Pressable, Text } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';

type PanelToggleProps = {
  collapsed: boolean;
  onPress: () => void;
  left?: number;
  right?: number;
  testID?: string;
};

export function PanelToggle({ collapsed, onPress, left, right, testID = 'permission:ui.panel.left.toggle' }: PanelToggleProps) {
  const { isDark } = useAppTheme();

  const arrow = right !== undefined ? (collapsed ? '‹' : '›') : collapsed ? '›' : '‹';

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      className={cn(
        'absolute z-10 h-6 w-6 items-center justify-center rounded-full border',
        isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light',
      )}
      style={{ left, right, top: '50%', marginTop: -12 }}
    >
      <Text className={cn('font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{arrow}</Text>
    </Pressable>
  );
}

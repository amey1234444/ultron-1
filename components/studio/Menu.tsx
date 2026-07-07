import type { ReactNode } from 'react';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';

const MENU_WIDTH = 208;
const MENU_MAX_HEIGHT = 280;
const EDGE_MARGIN = 12;

export function MenuContainer({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  const { isDark } = useAppTheme();
  const { width, height } = useWindowDimensions();

  const left = Math.min(x, width - MENU_WIDTH - EDGE_MARGIN);
  const top = Math.min(y, height - MENU_MAX_HEIGHT - EDGE_MARGIN);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable className="flex-1" onPress={onClose}>
        <View
          className={cn(
            'absolute gap-0.5 rounded-xl border p-1.5',
            isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel',
          )}
          style={{ left, top, width: MENU_WIDTH }}
        >
          {children}
        </View>
      </Pressable>
    </Modal>
  );
}

export function MenuItem({
  label,
  onPress,
  disabled,
  hint,
  danger,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  hint?: string;
  danger?: boolean;
  testID?: string;
}) {
  const { isDark } = useAppTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      testID={testID}
      className={cn('rounded-lg px-3 py-2', disabled && 'opacity-40')}
    >
      <Text className={cn('font-body-medium text-sm', danger ? 'text-status-critical' : isDark ? 'text-ink' : 'text-ink-inverse')}>
        {label}
      </Text>
      {hint && (
        <Text className={cn('mt-0.5 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{hint}</Text>
      )}
    </Pressable>
  );
}

export function MenuDivider() {
  const { isDark } = useAppTheme();
  return <View className={cn('my-1 h-px', isDark ? 'bg-line-dark' : 'bg-line-light')} />;
}

import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';

type DialogProps = {
  visible: boolean;
  title: string;
  onRequestClose: () => void;
  children: ReactNode;
  footer: ReactNode;
};

export function Dialog({ visible, title, onRequestClose, children, footer }: DialogProps) {
  const { isDark } = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <Pressable
        onPress={onRequestClose}
        className="flex-1 items-center justify-center bg-black/50 p-6"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className={cn(
            'w-full max-w-md rounded-2xl border p-6',
            isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel',
          )}
        >
          <Text className={cn('font-body-bold text-base', isDark ? 'text-ink' : 'text-ink-inverse')}>{title}</Text>
          <View className="mt-4 gap-4">{children}</View>
          <View className="mt-6 flex-row justify-end gap-3">{footer}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

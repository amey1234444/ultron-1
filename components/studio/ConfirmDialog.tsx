import { Text } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { ActionButton } from './ActionButton';
import { Dialog } from './Dialog';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ visible, title, message, confirmLabel, onCancel, onConfirm }: ConfirmDialogProps) {
  const { isDark } = useAppTheme();

  return (
    <Dialog
      visible={visible}
      title={title}
      onRequestClose={onCancel}
      footer={
        <>
          <ActionButton label="Cancel" variant="secondary" onPress={onCancel} />
          <ActionButton label={confirmLabel} variant="danger" onPress={onConfirm} />
        </>
      }
    >
      <Text className={cn('font-body text-sm leading-5', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{message}</Text>
    </Dialog>
  );
}

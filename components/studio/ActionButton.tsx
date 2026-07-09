import { Pressable, Text } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import type { PermissionKey } from '../../lib/permissions';

type ActionButtonProps = {
  label: string;
  // Non-mutating actions (Cancel, etc.) don't map to a backend permission.
  permission?: PermissionKey;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
};

// `permission` is not enforced client-side — it documents the backend permission
// this action maps to, per the spec's permission-ready-frontend requirement.
export function ActionButton({ label, permission, onPress, variant = 'primary', disabled }: ActionButtonProps) {
  const { isDark } = useAppTheme();

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityState={{ disabled }}
      testID={permission ? `permission:${permission}` : 'ui.action.cancel'}
      className={cn(
        'items-center rounded-xl border px-4 py-2.5',
        variant === 'primary' && (isDark ? 'border-ink bg-ink' : 'border-ink-inverse bg-ink-inverse'),
        variant === 'secondary' && (isDark ? 'border-line-dark bg-transparent' : 'border-line-light bg-transparent'),
        variant === 'danger' && 'border-status-critical bg-status-critical',
        disabled && 'opacity-40',
      )}
    >
      <Text
        className={cn(
          'font-body-medium text-sm',
          variant === 'primary' && (isDark ? 'text-ink-inverse' : 'text-ink'),
          variant === 'secondary' && (isDark ? 'text-ink' : 'text-ink-inverse'),
          variant === 'danger' && 'text-white',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

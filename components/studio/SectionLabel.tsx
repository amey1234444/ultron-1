import { Text } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';

// `active` is only passed by toggle-style callers (e.g. the Hierarchy/Devices
// switch) to pick out the selected side; standalone headers omit it and get the
// original block-label spacing/muted styling.
export function SectionLabel({ children, active }: { children: string; active?: boolean }) {
  const { isDark } = useAppTheme();

  return (
    <Text
      className={cn(
        'font-body-medium text-[10px] uppercase tracking-wider',
        active === undefined && 'mb-1.5 px-3',
        active ? (isDark ? 'text-ink' : 'text-ink-inverse') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
      )}
    >
      {children}
    </Text>
  );
}

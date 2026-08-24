import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { LEVEL_HEX } from '../../../../lib/condition';

// Whether the page is showing current data, and how sure it is of that. Kept
// separate from sensor condition: every reading can be healthy while the feed
// itself is stale, and that is the more urgent thing to know.
export type FeedStatus = 'live' | 'delayed' | 'offline';

const FEED_LABEL: Record<FeedStatus, string> = { live: 'LIVE', delayed: 'DELAYED', offline: 'OFFLINE' };
const FEED_HEX: Record<FeedStatus, string> = {
  live: LEVEL_HEX.normal,
  delayed: LEVEL_HEX.alert,
  offline: '#737373',
};

export type MachineHeaderProps = {
  machineName: string;
  template: string;
  // "Plant 01 / Process Line A" — the machine's place in the hierarchy. Passed in
  // rather than derived, because the page is given a machine, not a path.
  path?: string;
  subtitle?: string;
  // The eyebrow above the machine name. Defaults to the overview, but the
  // analysis view is a different page and must not claim to be that one.
  section?: string;
  feed: FeedStatus;
  // Seconds since the last accepted update, when known.
  ageSeconds?: number | null;
  // Machine selector. Omitted entirely when the host has nowhere to navigate,
  // rather than rendering a control that does nothing.
  onSelectMachine?: () => void;
  onRefresh?: () => void;
};

function ageLabel(feed: FeedStatus, ageSeconds: number | null | undefined) {
  if (ageSeconds === null || ageSeconds === undefined) return null;
  if (feed === 'offline') return `last seen ${formatAge(ageSeconds)} ago`;
  return formatAge(ageSeconds);
}

function formatAge(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}

export function MachineHeader({
  machineName,
  template,
  path,
  subtitle = 'Live condition monitoring',
  section = 'MACHINE OVERVIEW',
  feed,
  ageSeconds,
  onSelectMachine,
  onRefresh,
}: MachineHeaderProps) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  const feedColour = FEED_HEX[feed];
  const age = ageLabel(feed, ageSeconds);

  return (
    <View className="flex-row flex-wrap items-start justify-between gap-4">
      <View className="gap-1">
        <Text className={cn('font-mono text-[10px] tracking-[0.18em]', mutedClass)}>ULTRON / {section}</Text>

        <View className="flex-row flex-wrap items-baseline gap-2">
          <Text className={cn('font-heading-medium text-[22px]', inkClass)}>{machineName}</Text>
          <Text className={cn('font-body text-[14px]', mutedClass)}>· {template}</Text>
        </View>

        <Text className={cn('font-body text-[11px]', mutedClass)}>
          {path ? `${path} • ` : ''}
          {subtitle}
        </Text>
      </View>

      <View className="flex-row items-center gap-2">
        <View className={cn('flex-row items-center gap-2 rounded-full border px-2.5 py-1.5', lineClass)}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: feedColour }} />
          <Text style={{ color: feedColour }} className="font-mono text-[10px] font-bold tracking-wider">
            {FEED_LABEL[feed]}
          </Text>
          {age ? <Text className={cn('font-mono text-[10px]', mutedClass)}>· {age}</Text> : null}
        </View>

        {onRefresh ? (
          <Pressable onPress={onRefresh} accessibilityRole="button" accessibilityLabel="Refresh data" className={cn('rounded-full border px-2.5 py-1.5', lineClass)}>
            <Text className={cn('font-mono text-[10px] tracking-wider', mutedClass)}>REFRESH</Text>
          </Pressable>
        ) : null}

        {onSelectMachine ? (
          <Pressable
            onPress={onSelectMachine}
            accessibilityRole="button"
            accessibilityLabel="Change machine"
            className="flex-row items-center gap-2 rounded-full border border-accent/35 bg-accent/10 px-3 py-1.5"
          >
            <Text className="font-body-bold text-[11px] text-accent">{machineName}</Text>
            <Text className="font-mono text-[10px] text-accent">▾</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

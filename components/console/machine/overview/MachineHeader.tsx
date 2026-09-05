import { ChevronDown, RefreshCw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { levelHexes } from '../../../../lib/condition';
import { consolePalette } from '../../../../lib/consoleTheme';

// Whether the page is showing current data, and how sure it is of that. Kept
// separate from sensor condition: every reading can be healthy while the feed
// itself is stale, and that is the more urgent thing to know.
export type FeedStatus = 'live' | 'delayed' | 'offline';

const FEED_LABEL: Record<FeedStatus, string> = { live: 'LIVE', delayed: 'DELAYED', offline: 'OFFLINE' };
function feedHexes(isDark: boolean): Record<FeedStatus, string> {
  const levels = levelHexes(isDark);
  return { live: levels.normal, delayed: levels.alert, offline: consolePalette(isDark).neutral };
}

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
  if (seconds < 60) return `${Math.round(seconds)} sec ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

function formatClock(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
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
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const palette = consolePalette(isDark);

  const feedColour = feedHexes(isDark)[feed];
  const age = ageLabel(feed, ageSeconds);
  const [clock, setClock] = useState<{ time: string; date: string } | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock({ time: formatClock(now), date: formatDate(now) });
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View className="flex-row flex-wrap items-start justify-between gap-5">
      <View style={{ flexGrow: 1, flexBasis: 430, minWidth: 260 }} className="gap-1">
        <Text className={cn('font-mono text-[11px] tracking-[0.22em]', mutedClass)}>BLACKGATE / {section}</Text>

        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <Text className={cn('font-heading-medium text-[26px] leading-[32px]', inkClass)}>{machineName}</Text>
          {onSelectMachine ? (
            <Pressable
              onPress={onSelectMachine}
              accessibilityRole="button"
              accessibilityLabel="Change machine"
              className="flex-row items-center gap-1.5 rounded-md border px-2 py-1"
              style={({ pressed }) => ({
                borderColor: palette.line,
                backgroundColor: pressed ? palette.hoverSurface : palette.panelRaised,
              })}
            >
              <Text className={cn('font-mono text-[10px] tracking-wider', mutedClass)}>SELECT</Text>
              <ChevronDown color={palette.inkMuted} size={14} strokeWidth={1.7} />
            </Pressable>
          ) : null}
        </View>

        <Text className={cn('font-body text-[13px]', mutedClass)}>
          {template} · {path ? `${path} · ` : ''}{subtitle}
        </Text>
      </View>

      <View className="flex-row flex-wrap items-center justify-end gap-3">
        <View
          className="flex-row items-center gap-2.5 rounded-xl border px-3.5 py-2.5"
          style={{ borderColor: palette.lineStrong, backgroundColor: isDark ? '#080A0A' : palette.panel }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: feedColour,
              shadowColor: feedColour,
              shadowOpacity: feed === 'live' ? 0.6 : 0,
              shadowRadius: 7,
            }}
          />
          <Text style={{ color: feedColour }} className="font-mono text-[13px] font-bold tracking-wider">
            {FEED_LABEL[feed]}
          </Text>
          {age ? <Text className={cn('font-body text-[11.5px]', mutedClass)}>{age}</Text> : null}
        </View>

        {onRefresh ? (
          <Pressable
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel="Refresh data"
            className="items-center justify-center rounded-lg border"
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderColor: palette.line,
              backgroundColor: pressed ? palette.hoverSurface : palette.panelRaised,
            })}
          >
            <RefreshCw color={palette.inkMuted} size={16} strokeWidth={1.7} />
          </Pressable>
        ) : null}

        <View style={{ width: 1, height: 42, backgroundColor: palette.line }} />
        <View style={{ minWidth: 116 }} className="gap-0.5">
          <Text className={cn('font-mono text-[14px] tabular-nums', inkClass)}>{clock?.time ?? '--:--:--'}</Text>
          <Text className={cn('font-body text-[11.5px]', mutedClass)}>{clock?.date ?? '-- --- ----'}</Text>
        </View>
      </View>
    </View>
  );
}

import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { ChannelRef } from '../../../lib/rack';
import { LIVE_RANGE_FOR_LETTER, useLiveHistory } from './liveValue';
import type { MappedChannel } from './RackOccupancyView';
import { Sparkline } from './Sparkline';

const LIVE_COLOUR = '#3FB950';
const WARNING_COLOUR = '#F2A93B';
const CRITICAL_COLOUR = '#EF4444';

function statusColour(channel: ChannelRef, value: number): string {
  if (channel.alarmCritical !== undefined && value >= channel.alarmCritical) return CRITICAL_COLOUR;
  if (channel.alarmWarning !== undefined && value >= channel.alarmWarning) return WARNING_COLOUR;
  return LIVE_COLOUR;
}

function TrendCard({ mapped, machineId }: { mapped: MappedChannel; machineId: string }) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const { channel, label } = mapped;
  // Keyed by the box's own id, not the channel's — several boxes can point at
  // the same real channel, and they should each keep an independent trend
  // history rather than silently sharing one (and colliding on this storage key).
  const history = useLiveHistory(channel.letter, true, `ultron.trendhistory.${machineId}.${mapped.id}`);
  const latest = history[history.length - 1];
  const colour = statusColour(channel, latest);
  const range = LIVE_RANGE_FOR_LETTER[channel.letter];

  return (
    <View
      className={cn('gap-2 rounded-xl border px-3 py-2.5', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
      style={{ width: 232, borderColor: `${colour}55` }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className={cn('rounded-full border px-1.5 py-0.5', lineClass)}>
            <Text className={cn('font-mono text-[10px]', mutedClass)}>{channel.code}</Text>
          </View>
          <Text numberOfLines={1} className={cn('font-body text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>
            {label}
          </Text>
        </View>
        <Text style={{ color: colour }} className="font-mono text-xs font-bold">
          {latest.toFixed(2)} {channel.unit}
        </Text>
      </View>

      <Sparkline values={history} colour={colour} range={range} />
    </View>
  );
}

export type TrendViewProps = {
  mappedChannels: MappedChannel[];
  machineId: string;
  expectedPoints: number;
};

// Actual View → Trend: a rolling ~1-minute sparkline per mapped channel — quick
// "is this moving in a bad direction" glance, not a full historian. Each card's
// vertical scale is fixed to its measurement kind's plausible band (not its own
// buffer's min/max), so e.g. two Temperature cards are visually comparable.
export function TrendView({ mappedChannels, machineId, expectedPoints }: TrendViewProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  if (mappedChannels.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className={cn('font-body text-sm italic', mutedClass)}>
          No rack channels are mapped to this machine yet — link a box to a channel in Design mode.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 12 }}>
      {expectedPoints > 0 && (
        <Text className={cn('font-body text-[11px]', mutedClass)}>
          {mappedChannels.length} of {expectedPoints} expected points mapped
        </Text>
      )}
      <View className="flex-row flex-wrap gap-3">
        {mappedChannels.map((mapped) => (
          <TrendCard key={mapped.id} mapped={mapped} machineId={machineId} />
        ))}
      </View>
    </ScrollView>
  );
}

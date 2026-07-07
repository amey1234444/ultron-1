import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { ChannelRef } from '../../../lib/rack';
import { LIVE_RANGE_FOR_LETTER, useLiveValue, type LiveKindLetter } from './liveValue';
import type { MappedChannel } from './RackOccupancyView';

const LIVE_COLOUR = '#3FB950';
const WARNING_COLOUR = '#F2A93B';
const CRITICAL_COLOUR = '#EF4444';

const SECTION_FOR_LETTER: Partial<Record<LiveKindLetter, string>> = {
  V: 'Vibration Overview',
  T: 'Temperature Overview',
  S: 'Speed Overview',
  P: 'Pressure Overview',
  C: 'Current Overview',
};

const SECTION_ORDER: LiveKindLetter[] = ['P', 'T', 'V', 'S', 'C'];

function statusColour(channel: ChannelRef, value: number): string {
  if (channel.alarmCritical !== undefined && value >= channel.alarmCritical) return CRITICAL_COLOUR;
  if (channel.alarmWarning !== undefined && value >= channel.alarmWarning) return WARNING_COLOUR;
  return LIVE_COLOUR;
}

function OverviewCard({ mapped }: { mapped: MappedChannel }) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const { channel, label } = mapped;
  const value = useLiveValue(channel.letter, true);
  const colour = statusColour(channel, value);
  const range = LIVE_RANGE_FOR_LETTER[channel.letter];

  return (
    <View
      className={cn('gap-1.5 rounded-xl border px-3 py-2.5', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
      style={{ width: 200, borderColor: `${colour}55` }}
    >
      <View className="flex-row items-center justify-between">
        <Text style={{ color: colour }} className="font-body-bold text-sm">
          {channel.code}
        </Text>
        <View className={cn('rounded-full border px-1.5 py-0.5', lineClass)}>
          <Text className={cn('font-mono text-[10px]', mutedClass)}>{channel.code}</Text>
        </View>
      </View>

      <Text numberOfLines={1} className={cn('font-body text-xs', mutedClass)}>
        {label}
      </Text>

      <Text style={{ color: colour }} className="font-mono text-sm font-bold">
        {value.toFixed(range.decimals)} {channel.unit}
      </Text>
    </View>
  );
}

export type MachineOverviewProps = {
  mappedChannels: MappedChannel[];
  // Total measurement points defined on the machine template (e.g. RAV's Motor
  // component lists 6) — compared against how many are actually box-mapped to a
  // real rack channel, as a rough "how complete is this commissioning" signal.
  expectedPoints: number;
};

// Actual View → Overview: mapped channels grouped by measurement kind (Pressure
// Overview, Temperature Overview, ...) — the "at a glance" dashboard summary.
export function MachineOverview({ mappedChannels, expectedPoints }: MachineOverviewProps) {
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
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 24 }}>
      {expectedPoints > 0 && (
        <Text className={cn('font-body text-[11px]', mutedClass)}>
          {mappedChannels.length} of {expectedPoints} expected points mapped
        </Text>
      )}
      {SECTION_ORDER.map((letter) => {
        const inSection = mappedChannels.filter((m) => m.channel.letter === letter);
        if (inSection.length === 0) return null;

        return (
          <View key={letter} className="gap-3">
            <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>{SECTION_FOR_LETTER[letter]}</Text>
            <View className="flex-row flex-wrap gap-3">
              {inSection.map((mapped) => (
                <OverviewCard key={mapped.id} mapped={mapped} />
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

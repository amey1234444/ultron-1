import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { ChannelRef } from '../../../lib/rack';
import type { DeviceNode } from '../../../lib/devices';
import { useChannelReading } from '../../../lib/liveChannelValue';
import { LIVE_RANGE_FOR_LETTER, NO_VALUE_TEXT } from './liveValue';

// Grey: nothing has reported for this channel.
const NO_DATA_COLOUR = '#8B8D93';
import { Rav01LayoutCanvas } from './Rav01LayoutCanvas';
import type { MappedChannel } from './RackOccupancyView';
import { RotaryAirlockValve } from './RotaryAirlockValve';

const LIVE_COLOUR = '#3FBF6A';
const WARNING_COLOUR = '#D9962B';
const CRITICAL_COLOUR = '#D64545';

type Level = 'normal' | 'warning' | 'critical';
const LEVEL_COLOUR: Record<Level, string> = { normal: LIVE_COLOUR, warning: WARNING_COLOUR, critical: CRITICAL_COLOUR };

function levelFor(channel: ChannelRef, value: number): Level {
  if (channel.alarmCritical !== undefined && value >= channel.alarmCritical) return 'critical';
  if (channel.alarmWarning !== undefined && value >= channel.alarmWarning) return 'warning';
  return 'normal';
}

// The single point card rendered into each Rav01LayoutCanvas slot — live value,
// coloured by the channel's real alarm thresholds, reporting its current level
// up so the matching trail can be coloured the same way (Rav01LayoutCanvas's
// getTrailColour only sees the static `point` object, not the live number).
function LivePointCard({
  mapped,
  devices,
  onLevelChange,
}: {
  mapped: MappedChannel;
  devices: DeviceNode[];
  onLevelChange: (level: Level) => void;
}) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const { channel, label } = mapped;
  const reading = useChannelReading(channel, devices);
  const value = reading.value;
  const hasReading = typeof value === 'number';
  const level = hasReading ? levelFor(channel, value) : 'normal';
  const colour = hasReading ? LEVEL_COLOUR[level] : NO_DATA_COLOUR;
  const range = LIVE_RANGE_FOR_LETTER[channel.letter];

  useEffect(() => {
    onLevelChange(level);
  }, [level, onLevelChange]);

  return (
    <View
      className={cn('h-full gap-1.5 overflow-hidden rounded-xl border px-3 py-2', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
      style={{ borderColor: `${colour}55` }}
    >
      <View className="flex-row items-center justify-between">
        <Text style={{ color: colour }} className="font-body-bold text-sm">
          {channel.code}
        </Text>
        <View className={cn('rounded-full border px-1.5 py-0.5', lineClass)}>
          <Text className={cn('font-mono text-[11.5px]', mutedClass)}>{channel.code}</Text>
        </View>
      </View>

      <Text numberOfLines={1} className={cn('font-body text-xs', mutedClass)}>
        {label}
      </Text>

      <Text style={{ color: colour }} className="font-mono text-sm font-bold">
        {hasReading ? `${value.toFixed(range.decimals)} ${channel.unit}` : NO_VALUE_TEXT}
      </Text>
    </View>
  );
}

export type RavActualCanvasProps = {
  mappedChannels: MappedChannel[];
  devices?: DeviceNode[];
};

// Actual View → Machine for RAV: Rav01LayoutCanvas's hand-tuned 11-slot
// arrangement, fed with real box↔channel mappings instead of fixed demo
// values — live readings, live alarm-threshold colouring, real labels.
export function RavActualCanvas({ mappedChannels, devices = [] }: RavActualCanvasProps) {
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const setLevelFor = (id: string, level: Level) => setLevels((prev) => (prev[id] === level ? prev : { ...prev, [id]: level }));

  // Multiple template slots can point at the same underlying channel (the demo
  // rack only has one real V1 channel, but the template has seven V1-lettered
  // slots) — key by array position, not channel.id, so slots stay distinct.
  const points = mappedChannels.map((m, i) => ({ id: `${m.channel.id}__${i}`, label: m.label }));

  return (
    <Rav01LayoutCanvas
      points={points}
      renderMachine={() => <RotaryAirlockValve />}
      renderPointCard={(point, index) => (
        <LivePointCard mapped={mappedChannels[index]} devices={devices} onLevelChange={(level) => setLevelFor(point.id, level)} />
      )}
      getTrailColour={(point) => LEVEL_COLOUR[levels[point.id] ?? 'normal']}
    />
  );
}

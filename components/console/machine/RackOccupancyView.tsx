import { ScrollView, Text, View } from 'react-native';

import { EmptyState } from '../EmptyState';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { DeviceNode } from '../../../lib/devices';
import type { CardNode, ChannelRef } from '../../../lib/rack';
import { useChannelReading } from '../../../lib/liveChannelValue';
import { LIVE_RANGE_FOR_LETTER, NO_VALUE_TEXT } from './liveValue';

const LIVE_COLOUR = '#3FBF6A';
// Grey: nothing has reported for this channel. Distinct from any alarm colour.
const NO_DATA_COLOUR = '#8B8D93';
const WARNING_COLOUR = '#D9962B';
const CRITICAL_COLOUR = '#D64545';

// `id` is the mapping's own identity (the box that's linked to this channel),
// not the channel's — several boxes can legitimately point at the same real
// channel (e.g. a template with more V1-lettered slots than the demo rack has
// real V1 channels), and keying list items by `channel.id` in that case
// produces React's "two children with the same key" warning.
export type MappedChannel = { id: string; channel: ChannelRef; label: string; templatePointCode?: string };

function statusColour(channel: ChannelRef, value: number): string {
  if (channel.alarmCritical !== undefined && value >= channel.alarmCritical) return CRITICAL_COLOUR;
  if (channel.alarmWarning !== undefined && value >= channel.alarmWarning) return WARNING_COLOUR;
  return LIVE_COLOUR;
}

function ChannelReadout({ mapped, devices }: { mapped: MappedChannel; devices: DeviceNode[] }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const { channel, label } = mapped;
  const reading = useChannelReading(channel, devices);
  const value = reading.value;
  const hasReading = typeof value === 'number';
  // No reading means no alarm colour — an absent value is grey, not green.
  const colour = hasReading ? statusColour(channel, value) : NO_DATA_COLOUR;
  const range = LIVE_RANGE_FOR_LETTER[channel.letter];

  return (
    <View className="flex-row items-center justify-between gap-3 border-t px-3 py-2" style={{ borderColor: isDark ? '#252525' : '#E5E5E5' }}>
      <View className="flex-1 flex-row items-center gap-2">
        <View className={cn('rounded-full border px-1.5 py-0.5', lineClass)}>
          <Text className={cn('font-mono text-[10px]', mutedClass)}>{channel.code}</Text>
        </View>
        <Text numberOfLines={1} className={cn('font-body text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>
          {label}
        </Text>
      </View>
      <Text style={{ color: colour }} className="font-mono text-xs font-bold">
        {hasReading ? `${value.toFixed(range.decimals)} ${channel.unit}` : NO_VALUE_TEXT}
      </Text>
    </View>
  );
}

function SlotOccupancyCard({
  slot,
  card,
  channels,
  devices,
}: {
  slot: number;
  card: CardNode | null;
  channels: MappedChannel[];
  devices: DeviceNode[];
}) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  return (
    <View className={cn('overflow-hidden rounded-xl border', lineClass, isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')} style={{ borderColor: `${LIVE_COLOUR}55` }}>
      <View className="flex-row items-center justify-between px-3 py-2">
        <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>
          Slot {String(slot).padStart(2, '0')}
        </Text>
        <Text className={cn('font-body text-[11px]', mutedClass)}>{card?.type ?? 'Unknown card'}</Text>
      </View>
      {channels.map((mapped) => (
        <ChannelReadout key={mapped.id} mapped={mapped} devices={devices} />
      ))}
    </View>
  );
}

export type RackOccupancyViewProps = {
  devices: DeviceNode[];
  cards: CardNode[];
  mappedChannels: MappedChannel[];
  expectedPoints: number;
};

// Actual View → Rack: shows only the physical rack slots/channels this machine
// is actually mapped to (not the whole rack's occupancy) — a quick "where does
// this machine's data physically come from" reference for the floor.
export function RackOccupancyView({ devices, cards, mappedChannels, expectedPoints }: RackOccupancyViewProps) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const rackIds = Array.from(new Set(mappedChannels.map((m) => m.channel.rackId)));

  if (rackIds.length === 0) {
    return <EmptyState title="No racks mapped" description="Rack occupancy follows saved mappings — link a box to a channel in Design mode, then save the canvas configuration." />;
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 20 }}>
      {expectedPoints > 0 && (
        <Text className={cn('font-body text-[11px]', mutedClass)}>
          {mappedChannels.length} of {expectedPoints} expected points mapped
        </Text>
      )}
      {rackIds.map((rackId) => {
        const rack = devices.find((d) => d.id === rackId);
        const bySlot = new Map<number, MappedChannel[]>();
        mappedChannels
          .filter((m) => m.channel.rackId === rackId)
          .forEach((m) => {
            const list = bySlot.get(m.channel.slot) ?? [];
            list.push(m);
            bySlot.set(m.channel.slot, list);
          });
        const slots = Array.from(bySlot.keys()).sort((a, b) => a - b);

        return (
          <View key={rackId} className="gap-3">
            <View className="flex-row items-baseline gap-2">
              <Text className={cn('font-body-bold text-base', isDark ? 'text-ink' : 'text-ink-inverse')}>{rack?.name ?? 'Unknown rack'}</Text>
              {rack && <Text className={cn('font-body text-xs', mutedClass)}>{rack.model}</Text>}
            </View>
            <View className={cn('border', lineClass)} style={{ borderColor: 'transparent' }}>
              <View className="flex-row flex-wrap gap-3">
                {slots.map((slot) => (
                  <View key={slot} style={{ width: 260 }}>
                    <SlotOccupancyCard slot={slot} card={cards.find((c) => c.deviceId === rackId && c.slot === slot) ?? null} channels={bySlot.get(slot)!} devices={devices} />
                  </View>
                ))}
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

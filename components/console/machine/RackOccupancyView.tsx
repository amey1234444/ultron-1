import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { EmptyState } from '../EmptyState';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { deviceWithGatewayConnectionState, gatewayForRack, type DeviceNode } from '../../../lib/devices';
import type { LiveState } from '../../../lib/liveTelemetry';
import type { CardNode, ChannelRef } from '../../../lib/rack';
import { useChannelReading } from '../../../lib/liveChannelValue';
import { RackFaceplate } from '../rack/RackFaceplate';
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

type RackGroup = {
  rackId: string;
  rack: DeviceNode | undefined;
  gatewayName: string | null;
  channels: MappedChannel[];
  slots: number[];
  bySlot: Map<number, MappedChannel[]>;
};

// The physical rack, as drawn in the asset hierarchy, for one machine.
function RackSection({
  group,
  cards,
  devices,
  live,
}: {
  group: RackGroup;
  cards: CardNode[];
  devices: DeviceNode[];
  live?: LiveState;
}) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const { rack, slots, bySlot } = group;

  const rackCards = useMemo(() => cards.filter((card) => card.deviceId === group.rackId), [cards, group.rackId]);
  // The rack's own status can be overridden by an unconfigured gateway above it,
  // exactly as in the device tree — the faceplate LEDs must agree with it.
  const rackWithState = useMemo(
    () => (rack ? deviceWithGatewayConnectionState(rack, devices) : undefined),
    [rack, devices],
  );

  const online = rackWithState?.status === 'Online';

  return (
    <View className={cn('overflow-hidden rounded-2xl border', lineClass, isDark ? 'bg-white/[0.02]' : 'bg-white')}>
      <View className="flex-row flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: isDark ? '#252525' : '#E5E5E5' }}>
        <View className="min-w-0 flex-row items-center gap-2.5">
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: online ? LIVE_COLOUR : NO_DATA_COLOUR,
            }}
          />
          <View className="min-w-0">
            <Text numberOfLines={1} className={cn('font-body-bold text-base', isDark ? 'text-ink' : 'text-ink-inverse')}>
              {rack?.name ?? 'Unknown rack'}
            </Text>
            <Text numberOfLines={1} className={cn('font-mono text-[9.5px] uppercase tracking-[0.18em]', mutedClass)}>
              {[rack?.model, group.gatewayName ? `via ${group.gatewayName}` : null, rackWithState?.status]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        <Text className={cn('font-body text-[11px]', mutedClass)}>
          {group.channels.length} channel{group.channels.length === 1 ? '' : 's'} on slot{slots.length === 1 ? '' : 's'}{' '}
          {slots.map((slot) => String(slot).padStart(2, '0')).join(', ')}
        </Text>
      </View>

      {/* The rack itself. Read-only here: this is a "where does this machine's
          data physically come from" reference, not the rack configurator. A
          mapping can only name a rack that exists, so the missing-device case is
          a stale-layout guard rather than an expected state. */}
      {rackWithState ? (
        <RackFaceplate
          device={rackWithState}
          cards={rackCards}
          live={live}
          editable={false}
          fill={false}
          slots={slots}
          onPressEmpty={() => {}}
          onPressCard={() => {}}
        />
      ) : (
        <Text className={cn('px-6 py-8 text-center font-body text-xs', mutedClass)}>
          This rack is no longer in the device tree — only the last known channel readings are shown.
        </Text>
      )}

      <View className="flex-row flex-wrap gap-3 px-6 pb-6">
        {slots.map((slot) => (
          <View key={slot} style={{ width: 260 }}>
            <SlotOccupancyCard
              slot={slot}
              card={rackCards.find((card) => card.slot === slot) ?? null}
              channels={bySlot.get(slot)!}
              devices={devices}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

export type RackOccupancyViewProps = {
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  mappedChannels: MappedChannel[];
};

// Actual View → Rack: the physical rack, drawn exactly as the asset hierarchy
// draws it, but carrying only the racks and channels this machine is configured
// against. A machine wired across several racks gets one faceplate per rack,
// stacked in a single scroll.
export function RackOccupancyView({ devices, cards, live, mappedChannels }: RackOccupancyViewProps) {
  const groups = useMemo<RackGroup[]>(() => {
    const order: string[] = [];
    const byRack = new Map<string, MappedChannel[]>();
    for (const mapped of mappedChannels) {
      const rackId = mapped.channel.rackId;
      if (!byRack.has(rackId)) {
        byRack.set(rackId, []);
        order.push(rackId);
      }
      byRack.get(rackId)!.push(mapped);
    }

    return order.map((rackId) => {
      const channels = byRack.get(rackId)!;
      const rack = devices.find((device) => device.id === rackId);
      const bySlot = new Map<number, MappedChannel[]>();
      for (const mapped of channels) {
        const list = bySlot.get(mapped.channel.slot) ?? [];
        list.push(mapped);
        bySlot.set(mapped.channel.slot, list);
      }
      return {
        rackId,
        rack,
        gatewayName: rack ? gatewayForRack(rack, devices)?.name ?? null : null,
        channels,
        slots: Array.from(bySlot.keys()).sort((a, b) => a - b),
        bySlot,
      };
    });
  }, [mappedChannels, devices]);

  if (groups.length === 0) {
    return <EmptyState title="No racks mapped" description="Rack occupancy follows saved mappings — link a box to a channel in Design mode, then save the canvas configuration." />;
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 20 }}>
      {groups.map((group) => (
        <RackSection key={group.rackId} group={group} cards={cards} devices={devices} live={live} />
      ))}
    </ScrollView>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { EmptyState } from '../EmptyState';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { cardElevation, consolePalette, statusTone, type ConsolePalette } from '../../../lib/consoleTheme';
import { deviceWithGatewayConnectionState, gatewayForRack, type DeviceNode } from '../../../lib/devices';
import type { LiveState } from '../../../lib/liveTelemetry';
import { TOTAL_SLOTS, type CardNode, type ChannelRef } from '../../../lib/rack';
import { useChannelReading } from '../../../lib/liveChannelValue';
import { text } from '../../ui';
import { RackFaceplate } from '../rack/RackFaceplate';
import { LIVE_RANGE_FOR_LETTER, NO_VALUE_TEXT } from './liveValue';

// `id` is the mapping's own identity (the box that's linked to this channel),
// not the channel's — several boxes can legitimately point at the same real
// channel (e.g. a template with more V1-lettered slots than the demo rack has
// real V1 channels), and keying list items by `channel.id` in that case
// produces React's "two children with the same key" warning.
export type MappedChannel = { id: string; channel: ChannelRef; label: string; templatePointCode?: string };

// --- Compact rack navigator geometry -----------------------------------------
//
// The rack strip used to be one full-height section per rack — a faceplate, a
// header block and a column of 260px slot cards, all expanded, all at once.
// On a machine wired across two racks that is most of a screen spent on
// "which rack is this channel on", before a single reading has been read.
//
// It is a navigator now: one tile per rack, sized so a row of them can be
// scanned in a second or two, and the detail — faceplate, slots, live
// readings — opens for the rack that is selected. Nothing was removed; the
// secondary half of it stopped being permanently on screen.
const TILE_MIN_WIDTH = 164;
const TILE_MAX_WIDTH = 196;
const TILE_PAD = 9;
const TILE_GAP = 8;
// The slot strip: 14 cells, so a rack's occupancy is a shape rather than a
// sentence. Sized to fit TILE_MIN_WIDTH less the tile's own padding.
const SLOT_CELL_HEIGHT = 9;
const SLOT_CELL_GAP = 2;

function statusToneFor(online: boolean) {
  return online ? ('normal' as const) : ('offline' as const);
}

function ChannelReadout({
  mapped,
  devices,
  palette,
}: {
  mapped: MappedChannel;
  devices: DeviceNode[];
  palette: ConsolePalette;
}) {
  const { channel, label } = mapped;
  const reading = useChannelReading(channel, devices);
  const value = reading.value;
  const hasReading = typeof value === 'number';
  // No reading means no alarm colour — an absent value is grey, not green.
  const tone = !hasReading
    ? statusTone(palette, 'offline')
    : channel.alarmCritical !== undefined && value >= channel.alarmCritical
      ? statusTone(palette, 'danger')
      : channel.alarmWarning !== undefined && value >= channel.alarmWarning
        ? statusTone(palette, 'alert')
        : statusTone(palette, 'normal');
  const range = LIVE_RANGE_FOR_LETTER[channel.letter];

  return (
    <View
      className="flex-row items-center justify-between gap-3 px-2.5 py-1.5"
      style={{ borderTopWidth: 1, borderTopColor: palette.lineSubtle }}
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <View className="rounded-[5px] border px-1.5 py-[1px]" style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}>
          <Text className={text.code} style={{ color: palette.inkFaint }}>
            {channel.code}
          </Text>
        </View>
        <Text numberOfLines={1} className={cn('min-w-0 flex-1', text.body)} style={{ color: palette.ink }}>
          {label}
        </Text>
      </View>
      <Text className={text.data} style={{ color: hasReading ? tone.value : palette.inkFaint, fontVariant: ['tabular-nums'] }}>
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
  palette,
}: {
  slot: number;
  card: CardNode | null;
  channels: MappedChannel[];
  devices: DeviceNode[];
  palette: ConsolePalette;
}) {
  return (
    <View
      className="overflow-hidden rounded-[10px] border"
      style={{ borderColor: palette.line, backgroundColor: palette.panel }}
    >
      <View className="flex-row items-center justify-between px-2.5 py-1.5" style={{ backgroundColor: palette.panelRaised }}>
        <Text className={text.bodyStrong} style={{ color: palette.ink }}>
          Slot {String(slot).padStart(2, '0')}
        </Text>
        <Text className={text.meta} style={{ color: palette.inkFaint }}>
          {card?.type ?? 'Unknown card'}
        </Text>
      </View>
      {channels.map((mapped) => (
        <ChannelReadout key={mapped.id} mapped={mapped} devices={devices} palette={palette} />
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

/**
 * The 14-slot chassis as a strip of cells.
 *
 * Three states, and they are the three facts a rack tile has to carry: a slot
 * this machine reads through (accent), a slot that holds a card belonging to
 * something else (filled grey), and an empty slot (outline). It replaces the
 * sentence "3 channels on slots 02, 04, 07" with a shape, which is the whole
 * reason the tile can be this small.
 */
function SlotStrip({
  installed,
  mapped,
  palette,
  accent,
  width,
}: {
  installed: Set<number>;
  mapped: Set<number>;
  palette: ConsolePalette;
  accent: string;
  width: number;
}) {
  const cell = Math.max(5, Math.floor((width - SLOT_CELL_GAP * (TOTAL_SLOTS - 1)) / TOTAL_SLOTS));
  return (
    <View className="flex-row" style={{ gap: SLOT_CELL_GAP }}>
      {Array.from({ length: TOTAL_SLOTS }, (_, index) => index + 1).map((slot) => {
        const isMapped = mapped.has(slot);
        const isInstalled = installed.has(slot);
        return (
          <View
            key={slot}
            style={{
              width: cell,
              height: SLOT_CELL_HEIGHT,
              borderRadius: 2,
              backgroundColor: isMapped ? accent : isInstalled ? palette.lineStrong : 'transparent',
              borderWidth: isMapped ? 0 : 1,
              borderColor: palette.line,
            }}
          />
        );
      })}
    </View>
  );
}

/**
 * One rack, compact.
 *
 * What stays permanently visible is the shortlist: which rack, whether it is
 * reachable, how much of it is populated, how much of it this machine reads,
 * and whether it is the one currently open. Model, gateway and the per-channel
 * readings are one press away rather than always on screen.
 */
function RackTile({
  group,
  cards,
  devices,
  selected,
  onPress,
  width,
}: {
  group: RackGroup;
  cards: CardNode[];
  devices: DeviceNode[];
  selected: boolean;
  onPress: () => void;
  width: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [hovered, setHovered] = useState(false);

  const rackCards = useMemo(() => cards.filter((card) => card.deviceId === group.rackId), [cards, group.rackId]);
  const rackWithState = useMemo(
    () => (group.rack ? deviceWithGatewayConnectionState(group.rack, devices) : undefined),
    [group.rack, devices],
  );
  const online = rackWithState?.status === 'Online';
  const tone = statusTone(palette, statusToneFor(online));

  const installed = useMemo(() => new Set(rackCards.map((card) => card.slot)), [rackCards]);
  const mappedSlots = useMemo(() => new Set(group.slots), [group.slots]);

  const border = selected ? tone.border : hovered ? palette.lineStrong : palette.line;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${group.rack?.name ?? 'Unknown rack'}, ${online ? 'online' : 'offline'}, ${installed.size} of ${TOTAL_SLOTS} slots populated, ${group.channels.length} channels mapped to this machine`}
      style={{
        width,
        borderWidth: 1,
        borderColor: border,
        borderRadius: 10,
        paddingHorizontal: TILE_PAD,
        paddingVertical: 8,
        gap: 6,
        backgroundColor: selected ? palette.selected : hovered ? palette.hover : palette.panel,
        ...cardElevation(isDark),
      }}
    >
      <View className="flex-row items-center gap-1.5">
        <View style={{ width: 6, height: 6, borderRadius: 4, backgroundColor: tone.dot }} />
        <Text numberOfLines={1} className={cn('min-w-0 flex-1', text.bodyStrong)} style={{ color: palette.ink }}>
          {group.rack?.name ?? 'Unknown rack'}
        </Text>
        <Text className={text.meta} style={{ color: tone.fg }}>
          {online ? 'Healthy' : 'Offline'}
        </Text>
      </View>

      <SlotStrip
        installed={installed}
        mapped={mappedSlots}
        palette={palette}
        accent={tone.dot}
        width={width - TILE_PAD * 2 - 2}
      />

      {/* One line for both counts. The gateway behind them is secondary and
          appears on hover or once the rack is open. */}
      <View className="flex-row items-center justify-between gap-2">
        <Text numberOfLines={1} className={text.meta} style={{ color: palette.inkMuted, fontVariant: ['tabular-nums'] }}>
          {installed.size}/{TOTAL_SLOTS} slots
        </Text>
        <Text className={text.meta} style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
          {group.channels.length} ch · {group.slots.length} mapped
        </Text>
      </View>
    </Pressable>
  );
}

// The opened rack: the physical chassis exactly as the asset hierarchy draws it,
// plus the live reading on every channel this machine is wired to.
function RackDetail({
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
  const palette = consolePalette(isDark);
  const { rack, slots, bySlot } = group;

  const rackCards = useMemo(() => cards.filter((card) => card.deviceId === group.rackId), [cards, group.rackId]);
  // The rack's own status can be overridden by an unconfigured gateway above it,
  // exactly as in the device tree — the faceplate LEDs must agree with it.
  const rackWithState = useMemo(
    () => (rack ? deviceWithGatewayConnectionState(rack, devices) : undefined),
    [rack, devices],
  );

  return (
    <View
      className="overflow-hidden rounded-[14px] border"
      style={{ borderColor: palette.line, backgroundColor: palette.panel, ...cardElevation(isDark) }}
    >
      <View
        className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5"
        style={{ borderBottomWidth: 1, borderBottomColor: palette.line, backgroundColor: palette.panelRaised }}
      >
        <Text numberOfLines={1} className={text.title} style={{ color: palette.ink }}>
          {rack?.name ?? 'Unknown rack'}
        </Text>
        <Text numberOfLines={1} className={text.meta} style={{ color: palette.inkMuted }}>
          {[rack?.model, group.gatewayName ? `via ${group.gatewayName}` : null, rackWithState?.status]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      {/* Read-only here: this is a "where does this machine's data physically
          come from" reference, not the rack configurator. A mapping can only
          name a rack that exists, so the missing-device case is a stale-layout
          guard rather than an expected state. */}
      {rackWithState ? (
        <RackFaceplate
          device={rackWithState}
          cards={rackCards}
          live={live}
          editable={false}
          fill={false}
          density="compact"
          slots={slots}
          onPressEmpty={() => {}}
          onPressCard={() => {}}
        />
      ) : (
        <Text className={cn('px-6 py-6 text-center', text.body)} style={{ color: palette.inkMuted }}>
          This rack is no longer in the device tree — only the last known channel readings are shown.
        </Text>
      )}

      <View className="flex-row flex-wrap gap-2.5 px-4 pb-4">
        {slots.map((slot) => (
          <View key={slot} style={{ width: 236 }}>
            <SlotOccupancyCard
              slot={slot}
              card={rackCards.find((card) => card.slot === slot) ?? null}
              channels={bySlot.get(slot)!}
              devices={devices}
              palette={palette}
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

// Actual View → Rack: the physical racks this machine's data comes through,
// drawn exactly as the asset hierarchy draws them, but carrying only the racks
// and channels this machine is configured against.
export function RackOccupancyView({ devices, cards, live, mappedChannels }: RackOccupancyViewProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const [stripWidth, setStripWidth] = useState<number | null>(null);

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

  // A rack is always open. On a single-rack machine that means this view opens
  // exactly as it did before the navigator existed; on a multi-rack one it opens
  // on the first rack rather than on all of them at once.
  useEffect(() => {
    setSelectedRackId((current) =>
      current && groups.some((group) => group.rackId === current) ? current : (groups[0]?.rackId ?? null),
    );
  }, [groups]);

  const selected = groups.find((group) => group.rackId === selectedRackId) ?? groups[0] ?? null;

  // Tiles share the row evenly rather than each taking its natural width, so a
  // two-rack machine does not get two tiles floating in a wide empty band.
  const tileWidth = (() => {
    if (!stripWidth) return TILE_MIN_WIDTH;
    const perRow = Math.max(
      1,
      Math.min(groups.length, Math.floor((stripWidth + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP))),
    );
    return Math.min(
      TILE_MAX_WIDTH,
      Math.max(TILE_MIN_WIDTH, Math.floor((stripWidth - TILE_GAP * (perRow - 1)) / perRow)),
    );
  })();

  if (groups.length === 0) {
    return <EmptyState title="No racks mapped" description="Rack occupancy follows saved mappings — link a box to a channel in Design mode, then save the canvas configuration." />;
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View className="gap-2.5">
        <View className="flex-row items-center gap-3">
          <Text className={text.label} style={{ color: palette.inkFaint }}>
            Racks
          </Text>
          <View className="h-px flex-1" style={{ backgroundColor: palette.line }} />
          <Text className={text.meta} style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
            {groups.length} rack{groups.length === 1 ? '' : 's'} · {mappedChannels.length} channels
          </Text>
        </View>

        <View
          className="flex-row flex-wrap"
          style={{ gap: TILE_GAP }}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            setStripWidth((previous) => (previous !== null && Math.abs(previous - width) < 1 ? previous : width));
          }}
        >
          {groups.map((group) => (
            <RackTile
              key={group.rackId}
              group={group}
              cards={cards}
              devices={devices}
              width={tileWidth}
              selected={selected?.rackId === group.rackId}
              onPress={() => setSelectedRackId(group.rackId)}
            />
          ))}
        </View>
      </View>

      {selected ? <RackDetail group={selected} cards={cards} devices={devices} live={live} /> : null}
    </ScrollView>
  );
}

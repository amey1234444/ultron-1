import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { DeviceNode } from '../../../lib/devices';
import {
  channelAlarmLevel,
  channelLiveStatus,
  latestMeasurementForChannel,
  type ChannelAlarmLevel,
  type LiveState,
} from '../../../lib/liveTelemetry';
import { cn } from '../../../lib/cn';
import {
  TOTAL_SLOTS,
  channelCountForCardType,
  channelNamesForCard,
  isCardConfigured,
  slotKind,
  type CardNode,
} from '../../../lib/rack';
import { CardTypeIcon } from './cardIcons';

type CardListViewProps = {
  cards: CardNode[];
  device: DeviceNode;
  live?: LiveState;
  onOpenMenu?: (card: CardNode, x: number, y: number) => void;
};

// One flex weight per column, shared by the header and every row so the two can
// never drift apart. The slot column is deliberately narrow — it is the spine
// the eye tracks down, not a data column.
const COLS = {
  slot: 0.55,
  type: 1.7,
  name: 1.9,
  channels: 1.0,
  config: 1.2,
  status: 1.15,
} as const;

const HEADERS: [keyof typeof COLS, string][] = [
  ['slot', 'Slot'],
  ['type', 'Card Type'],
  ['name', 'Name'],
  ['channels', 'Channels'],
  ['config', 'Config'],
  ['status', 'Status'],
];

// The card-level rollup: liveness and worst alarm folded into the one badge a
// commissioning engineer reads first. Colour is spent only here and only when it
// means something — everything else on the row stays achromatic.
type RollupTone = 'danger' | 'alert' | 'live' | 'stale' | 'idle';

const ROLLUP_META: Record<RollupTone, { label: string; dot: string; text: string }> = {
  danger: { label: 'Danger', dot: 'bg-status-critical', text: 'text-status-critical' },
  alert: { label: 'Alert', dot: 'bg-status-warning', text: 'text-status-warning' },
  live: { label: 'Live', dot: 'bg-status-success', text: 'text-status-success' },
  stale: { label: 'Missing data', dot: 'bg-status-critical', text: 'text-status-critical' },
  idle: { label: 'No data', dot: 'bg-ink-muted', text: 'text-ink-muted' },
};

const ALARM_RANK: Record<ChannelAlarmLevel, number> = { normal: 0, alert: 1, danger: 2 };

type Rollup = { channels: number; liveCount: number; tone: RollupTone };

function cardRollup(device: DeviceNode, card: CardNode, live: LiveState | undefined): Rollup {
  const channels = channelCountForCardType(card.type);

  // A controller carries no channels; its own branch of channelLiveStatus reads
  // the slot's link state instead, so ask about channel 1 and let it answer.
  if (channels === 0) {
    const status = live ? channelLiveStatus(device, card, 1, live) : 'idle';
    return { channels: 0, liveCount: 0, tone: status === 'active' ? 'live' : status === 'stale' ? 'stale' : 'idle' };
  }

  let liveCount = 0;
  let anyStale = false;
  let worst: ChannelAlarmLevel = 'normal';

  for (let channelId = 1; channelId <= channels; channelId += 1) {
    const status = live ? channelLiveStatus(device, card, channelId, live) : 'idle';
    if (status === 'active') liveCount += 1;
    if (status === 'stale') anyStale = true;
    const measurement = live && status === 'active' ? latestMeasurementForChannel(device, card, channelId, live) : undefined;
    const alarm = channelAlarmLevel(measurement);
    if (ALARM_RANK[alarm] > ALARM_RANK[worst]) worst = alarm;
  }

  const tone: RollupTone =
    worst === 'danger' ? 'danger' : worst === 'alert' ? 'alert' : liveCount > 0 ? 'live' : anyStale ? 'stale' : 'idle';

  return { channels, liveCount, tone };
}

// A card that has never been named has nothing worth printing here, so the row
// says so outright rather than showing an em dash that reads as "no data".
function primaryLabel(card: CardNode): string | null {
  if (channelCountForCardType(card.type) > 0) return channelNamesForCard(card)[0]?.trim() || null;
  if ('controllerName' in card.config) return card.config.controllerName.trim() || null;
  return null;
}

function Chip({ label, isDark, quiet = false }: { label: string; isDark: boolean; quiet?: boolean }) {
  return (
    <View className={cn('self-start rounded border px-1.5 py-0.5', isDark ? 'border-line-dark' : 'border-line-light')}>
      <Text
        className={cn(
          'font-mono text-[10px] uppercase tracking-wider',
          quiet ? (isDark ? 'text-ink-muted' : 'text-ink-inverse-muted') : isDark ? 'text-ink' : 'text-ink-inverse',
        )}
      >
        {label}
      </Text>
    </View>
  );
}

export function CardListView({ cards, device, live, onOpenMenu }: CardListViewProps) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  const cardBySlot = useMemo(() => new Map(cards.map((card) => [card.slot, card])), [cards]);

  // Every slot in the rack is listed, occupied or not. An empty slot is a fact a
  // commissioning engineer needs — omitting it would hide the gap in the spine.
  const slots = useMemo(() => Array.from({ length: TOTAL_SLOTS }, (_, index) => index + 1), []);
  const installedCount = cards.length;

  return (
    <View className="flex-1 px-6 pt-5">
      <View className="flex-row items-baseline justify-between pb-3">
        <Text className={cn('font-mono text-[11px] uppercase tracking-wider', mutedClass)}>
          {installedCount} of {TOTAL_SLOTS} slots occupied
        </Text>
      </View>

      {/* Header sits outside the ScrollView: there is no position:sticky here, so
          staying visible means never scrolling in the first place. */}
      <View className={cn('flex-row items-center gap-3 border-b px-4 pb-2', lineClass)}>
        {HEADERS.map(([key, label]) => (
          <Text
            key={key}
            style={{ flex: COLS[key] }}
            className={cn('font-mono text-[10px] uppercase tracking-wider', mutedClass)}
          >
            {label}
          </Text>
        ))}
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
      >
        {slots.map((slot) => {
          const card = cardBySlot.get(slot) ?? null;
          const kind = slotKind(slot);

          if (!card) {
            return (
              <View
                key={slot}
                className={cn('mb-1.5 flex-row items-center gap-3 rounded-lg border border-dashed px-4 py-3', lineClass)}
              >
                <View style={{ flex: COLS.slot }}>
                  <Text className={cn('font-mono text-sm', mutedClass)}>{String(slot).padStart(2, '0')}</Text>
                  <Text className={cn('font-mono text-[9px] uppercase tracking-wider', mutedClass)}>
                    {kind === 'acquisition' ? 'acq' : 'ctrl'}
                  </Text>
                </View>
                <Text style={{ flex: COLS.type }} className={cn('font-body text-sm', mutedClass)}>
                  Empty slot
                </Text>
                <Text style={{ flex: COLS.name }} className={cn('font-body text-sm', mutedClass)}>
                  Accepts {kind}
                </Text>
                <Text style={{ flex: COLS.channels }} className={cn('font-mono text-sm', mutedClass)}>
                  —
                </Text>
                <View style={{ flex: COLS.config }} />
                <View style={{ flex: COLS.status }} />
              </View>
            );
          }

          const { channels, liveCount, tone } = cardRollup(device, card, live);
          const rollup = ROLLUP_META[tone];
          const label = primaryLabel(card);
          const configured = isCardConfigured(card);

          return (
            <Pressable
              key={card.id}
              onPress={onOpenMenu ? (e) => onOpenMenu(card, e.nativeEvent.pageX, e.nativeEvent.pageY) : undefined}
              className={cn(
                'mb-1.5 flex-row items-center gap-3 rounded-lg border px-4 py-3',
                lineClass,
                isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel',
              )}
            >
              <View style={{ flex: COLS.slot }}>
                <Text className={cn('font-mono text-sm', inkClass)}>{String(slot).padStart(2, '0')}</Text>
                <Text className={cn('font-mono text-[9px] uppercase tracking-wider', mutedClass)}>
                  {kind === 'acquisition' ? 'acq' : 'ctrl'}
                </Text>
              </View>

              <View style={{ flex: COLS.type }} className="flex-row items-center gap-2">
                <CardTypeIcon type={card.type} color={isDark ? '#F7F6F2' : '#0A0B0D'} size={15} />
                <Text numberOfLines={1} className={cn('font-body-medium text-sm', inkClass)}>
                  {card.type}
                </Text>
              </View>

              <Text
                style={{ flex: COLS.name }}
                numberOfLines={1}
                className={cn('font-body text-sm', label ? inkClass : mutedClass)}
              >
                {label ?? 'Unnamed'}
              </Text>

              <Text style={{ flex: COLS.channels }} className={cn('font-mono text-sm', mutedClass)}>
                {channels === 0 ? '—' : `${liveCount}/${channels} live`}
              </Text>

              <View style={{ flex: COLS.config }}>
                {!configured ? (
                  <Chip label="Not configured" isDark={isDark} />
                ) : card.enabled ? (
                  <Chip label="Configured" isDark={isDark} quiet />
                ) : (
                  <Chip label="Disabled" isDark={isDark} />
                )}
              </View>

              <View style={{ flex: COLS.status }} className="flex-row items-center gap-1.5">
                <View className={cn('h-1.5 w-1.5 rounded-full', rollup.dot)} />
                <Text numberOfLines={1} className={cn('font-body text-xs', rollup.text)}>
                  {rollup.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

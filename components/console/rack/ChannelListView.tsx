import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { DeviceNode } from '../../../lib/devices';
import {
  channelAlarmLevel,
  channelLiveStatus,
  latestMeasurementForChannel,
  type ChannelAlarmLevel,
  type ChannelLiveStatus,
  type LiveMeasurement,
  type LiveState,
} from '../../../lib/liveTelemetry';
import { channelAlarmLimits, channelCountForCardType, channelNamesForCard, type CardNode } from '../../../lib/rack';

type ChannelListViewProps = {
  device: DeviceNode;
  cards: CardNode[];
  live?: LiveState;
};

const COLS = {
  channel: 0.95,
  sensor: 2.0,
  status: 1.15,
  value: 0.95,
  unit: 0.7,
  alarm: 1.0,
} as const;

// Status and alarm are the only things on this screen allowed colour, and each
// hue states one thing: green is measured now, amber is over the alert
// threshold, red is over danger or the data is gone. Everything else is grey.
// Classes rather than hex so the palette stays in tailwind.config.js.
const STATUS_META: Record<ChannelLiveStatus, { label: string; dot: string; text: string }> = {
  active: { label: 'Active', dot: 'bg-status-success', text: 'text-status-success' },
  // "Missing data" and "No data" are different faults: stale means the channel
  // should be reporting and is not, idle means nothing is expected yet.
  stale: { label: 'Missing data', dot: 'bg-status-critical', text: 'text-status-critical' },
  idle: { label: 'No data', dot: 'bg-ink-muted', text: 'text-ink-muted' },
};

const ALARM_META: Record<ChannelAlarmLevel, { label: string; dot: string; text: string }> = {
  normal: { label: 'Normal', dot: 'bg-status-success', text: 'text-status-success' },
  alert: { label: 'Alert', dot: 'bg-status-warning', text: 'text-status-warning' },
  danger: { label: 'Danger', dot: 'bg-status-critical', text: 'text-status-critical' },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live only' },
  { key: 'alarm', label: 'In alarm' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

const NO_VALUE = '—';

/**
 * Splits a reading into its number and its unit so the two can sit in separate
 * columns and the decimal points line up down the page.
 *
 * Mirrors the validity guards in `formatMeasurement` exactly — an invalid or
 * non-GOOD reading prints as an em dash rather than a stale number — but stops
 * short of joining the two halves back together.
 */
function splitMeasurement(measurement: LiveMeasurement | undefined): { value: string; unit: string } {
  if (!measurement) return { value: NO_VALUE, unit: '' };
  if (measurement.measurementValid === false || measurement.quality !== 'GOOD') return { value: NO_VALUE, unit: '' };
  if (measurement.valueDisplay) return { value: measurement.valueDisplay, unit: measurement.unit ?? '' };
  if (measurement.value === null || measurement.value === undefined) {
    // Nothing numeric to split, but the controller may still have sent a
    // preformatted string — show it whole rather than dropping the reading.
    return measurement.valueWithUnit ? { value: measurement.valueWithUnit, unit: '' } : { value: NO_VALUE, unit: '' };
  }
  const magnitude = Math.abs(measurement.value);
  const decimals = magnitude >= 100 ? 1 : magnitude >= 1 ? 2 : 3;
  const value = Number.isInteger(measurement.value) ? String(measurement.value) : measurement.value.toFixed(decimals);
  return { value, unit: measurement.unit ?? '' };
}

function Dot({ label, dot, text }: { label: string; dot: string; text: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      <Text numberOfLines={1} className={cn('font-body text-xs', text)}>
        {label}
      </Text>
    </View>
  );
}

function configuredAlarmLevel(card: CardNode, measurement: LiveMeasurement | undefined): ChannelAlarmLevel {
  if (!measurement || typeof measurement.value !== 'number' || !('alarmHigh' in card.config)) return channelAlarmLevel(measurement);
  const limits = channelAlarmLimits(card.config);
  if (limits.highHigh !== null && measurement.value >= limits.highHigh) return 'danger';
  if (limits.lowLow !== null && measurement.value <= limits.lowLow) return 'danger';
  if (limits.high !== null && measurement.value >= limits.high) return 'alert';
  if (limits.low !== null && measurement.value <= limits.low) return 'alert';
  return 'normal';
}

export function ChannelListView({ device, cards, live }: ChannelListViewProps) {
  const { isDark } = useAppTheme();
  const [filter, setFilter] = useState<FilterKey>('all');

  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  // Slot order is the spine. One acquisition card carries exactly one channel
  // (see channelCountForCardType), so ordering by slot already groups the list
  // by card — the S__.CH_ column down the left edge is the grouping, and adding
  // a header per single-row group would be decoration rather than structure.
  const rows = useMemo(() => {
    return [...cards]
      .filter((card) => channelCountForCardType(card.type) > 0)
      .sort((a, b) => a.slot - b.slot)
      .flatMap((card) =>
        channelNamesForCard(card).map((name, index) => {
          const channelId = index + 1;
          const status: ChannelLiveStatus =
            device.status !== 'Online' ? 'stale' : live ? channelLiveStatus(device, card, channelId, live) : 'idle';
          const measurement = live && status === 'active' ? latestMeasurementForChannel(device, card, channelId, live) : undefined;
          return {
            id: `S${String(card.slot).padStart(2, '0')}.CH${channelId}`,
            // Falls back to the same shape lib/rack.ts uses for an unnamed
            // channel, so a channel reads identically here and anywhere it has
            // been mapped, instead of the old truncating "(unnamed, slot n)".
            label: name.trim() || `${card.type} · Slot ${card.slot}`,
            named: name.trim().length > 0,
            status,
            measurement,
            alarm: configuredAlarmLevel(card, measurement),
          };
        }),
      );
  }, [cards, device, live]);

  const visible = useMemo(() => {
    if (filter === 'live') return rows.filter((row) => row.status === 'active');
    if (filter === 'alarm') return rows.filter((row) => row.alarm !== 'normal');
    return rows;
  }, [rows, filter]);

  const liveCount = rows.filter((row) => row.status === 'active').length;
  const alarmCount = rows.filter((row) => row.alarm !== 'normal').length;

  if (rows.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-10">
        <Text className={cn('font-body text-sm', mutedClass)}>No channels yet — install an acquisition card first.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 px-6 pt-5">
      <View className="flex-row items-center justify-between pb-3">
        <Text className={cn('font-mono text-[11px] uppercase tracking-wider', mutedClass)}>
          {rows.length} ch · {liveCount} live · {alarmCount} in alarm
        </Text>
        <View className={cn('flex-row rounded-full border p-0.5', lineClass)}>
          {FILTERS.map((option) => {
            const active = filter === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setFilter(option.key)}
                className={cn('rounded-full px-2.5 py-1', active && (isDark ? 'bg-ink' : 'bg-ink-inverse'))}
              >
                <Text
                  className={cn(
                    'font-mono text-[10px] uppercase tracking-wider',
                    active ? (isDark ? 'text-ink-inverse' : 'text-ink') : mutedClass,
                  )}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Outside the ScrollView so it stays put while rows move under it. */}
      <View className={cn('flex-row items-center gap-3 border-b px-4 pb-2', lineClass)}>
        <Text style={{ flex: COLS.channel }} className={cn('font-mono text-[10px] uppercase tracking-wider', mutedClass)}>
          Channel
        </Text>
        <Text style={{ flex: COLS.sensor }} className={cn('font-mono text-[10px] uppercase tracking-wider', mutedClass)}>
          Sensor
        </Text>
        <Text style={{ flex: COLS.status }} className={cn('font-mono text-[10px] uppercase tracking-wider', mutedClass)}>
          Status
        </Text>
        <Text
          style={{ flex: COLS.value, textAlign: 'right' }}
          className={cn('font-mono text-[10px] uppercase tracking-wider', mutedClass)}
        >
          Value
        </Text>
        <Text style={{ flex: COLS.unit }} className={cn('font-mono text-[10px] uppercase tracking-wider', mutedClass)}>
          Unit
        </Text>
        <Text style={{ flex: COLS.alarm }} className={cn('font-mono text-[10px] uppercase tracking-wider', mutedClass)}>
          Alarm
        </Text>
      </View>

      {visible.length === 0 ? (
        <View className="flex-1 items-center justify-center p-10">
          <Text className={cn('font-body text-sm', mutedClass)}>
            {filter === 'live' ? 'No channels are reporting right now.' : 'No channels are in alarm.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
        >
          {visible.map((row) => {
            const status = STATUS_META[row.status];
            const alarm = ALARM_META[row.alarm];
            const { value, unit } = splitMeasurement(row.measurement);
            return (
              <View
                key={row.id}
                className={cn(
                  'mb-1.5 flex-row items-center gap-3 rounded-lg border px-4 py-3',
                  lineClass,
                  isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel',
                )}
              >
                <Text style={{ flex: COLS.channel }} className={cn('font-mono text-sm', inkClass)}>
                  {row.id}
                </Text>
                <Text
                  style={{ flex: COLS.sensor }}
                  numberOfLines={1}
                  className={cn('font-body text-sm', row.named ? inkClass : mutedClass)}
                >
                  {row.measurement?.sensor ? `${row.label} · ${row.measurement.sensor}` : row.label}
                </Text>
                <View style={{ flex: COLS.status }}>
                  <Dot label={status.label} dot={status.dot} text={status.text} />
                </View>
                {/* Right-aligned number, left-aligned unit: the decimal points
                    line up down the column and the units read as a list. */}
                <Text
                  style={{ flex: COLS.value, textAlign: 'right' }}
                  className={cn('font-mono text-sm', value === NO_VALUE ? mutedClass : inkClass)}
                >
                  {value}
                </Text>
                <Text style={{ flex: COLS.unit }} numberOfLines={1} className={cn('font-mono text-xs', mutedClass)}>
                  {unit}
                </Text>
                <View style={{ flex: COLS.alarm }}>
                  {row.measurement ? (
                    <Dot label={alarm.label} dot={alarm.dot} text={alarm.text} />
                  ) : (
                    <Text className={cn('font-mono text-sm', mutedClass)}>{NO_VALUE}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

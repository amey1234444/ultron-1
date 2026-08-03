import { Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { DeviceNode } from '../../../lib/devices';
import {
  channelAlarmLevel,
  channelLiveStatus,
  formatMeasurement,
  latestMeasurementForChannel,
  type ChannelAlarmLevel,
  type ChannelLiveStatus,
  type LiveState,
} from '../../../lib/liveTelemetry';
import { channelCountForCardType, type CardNode } from '../../../lib/rack';

type ChannelListViewProps = {
  device: DeviceNode;
  cards: CardNode[];
  live?: LiveState;
};

function channelLabelsFor(card: CardNode): string[] {
  if ('channelNames' in card.config) {
    return card.config.channelNames.map((name, index) => name || `${card.type} (unnamed CH${index + 1})`);
  }
  return [card.type];
}

const STATUS_META: Record<ChannelLiveStatus, { label: string; colour: string }> = {
  active: { label: 'Active', colour: '#16A34A' },
  stale: { label: 'Missing data', colour: '#DC2626' },
  idle: { label: 'No data', colour: '#A1A1AA' },
};

const ALARM_META: Record<ChannelAlarmLevel, { label: string; colour: string }> = {
  normal: { label: 'Normal', colour: '#16A34A' },
  alert: { label: 'Alert', colour: '#D97706' },
  danger: { label: 'Danger', colour: '#DC2626' },
};

function Dot({ label, colour }: { label: string; colour: string }) {
  return (
    <View style={{ flex: 1 }} className="flex-row items-center gap-2">
      <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: colour }} />
      <Text className="font-body text-sm" style={{ color: colour }}>
        {label}
      </Text>
    </View>
  );
}

function StatusCell({ status }: { status: ChannelLiveStatus }) {
  const meta = STATUS_META[status];
  return <Dot label={meta.label} colour={meta.colour} />;
}

export function ChannelListView({ device, cards, live }: ChannelListViewProps) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const rows = [...cards]
    .filter((c) => channelCountForCardType(c.type) > 0)
    .sort((a, b) => a.slot - b.slot)
    .flatMap((card) =>
      channelLabelsFor(card).map((label, index) => ({
        id: `S${String(card.slot).padStart(2, '0')}.CH${index + 1}`,
        card,
        channelId: index + 1,
        label,
      })),
    );

  if (rows.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-10">
        <Text className={cn('font-body text-sm', mutedClass)}>No channels yet - install an acquisition card first.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 px-6 py-5">
      <View className={cn('mb-3 flex-row items-center gap-3 border-b px-4 pb-3', lineClass)}>
        {['Channel', 'Sensor', 'Status', 'Live Value', 'Alarm'].map((h) => (
          <Text key={h} style={{ flex: 1 }} className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>
            {h}
          </Text>
        ))}
      </View>

      {rows.map(({ id, card, channelId, label }) => {
        const status = device.status !== 'Online' ? 'stale' : live ? channelLiveStatus(device, card, channelId, live) : 'idle';
        const measurement = live && status === 'active' ? latestMeasurementForChannel(device, card, channelId, live) : undefined;
        const alarm = ALARM_META[channelAlarmLevel(measurement)];
        return (
          <View
            key={id}
            className={cn('mb-2 flex-row items-center gap-3 rounded-xl border px-4 py-3', lineClass, isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
          >
            <Text style={{ flex: 1 }} className={cn('font-mono text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>
              {id}
            </Text>
            <Text style={{ flex: 1 }} numberOfLines={1} className={cn('font-body text-sm', mutedClass)}>
              {measurement?.sensor ? `${label} (${measurement.sensor})` : label}
            </Text>
            <StatusCell status={status} />
            <Text style={{ flex: 1 }} className={cn('font-mono text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>
              {formatMeasurement(measurement)}
            </Text>
            {measurement ? <Dot label={alarm.label} colour={alarm.colour} /> : <Text style={{ flex: 1 }} className={cn('font-body text-sm', mutedClass)}>-</Text>}
          </View>
        );
      })}
    </View>
  );
}

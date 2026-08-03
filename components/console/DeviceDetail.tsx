import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { totalChannelsFor, type DeviceNode } from '../../lib/devices';
import {
  activeChannelsForDevice,
  channelAlarmLevel,
  formatMeasurement,
  gatewayForDevice,
  lastSeenLabel,
  measurementsForDevice,
  type LiveState,
} from '../../lib/liveTelemetry';
import { BackButton } from './BackButton';

const ALARM_SUFFIX = { normal: '', alert: '  ALERT', danger: '  DANGER' } as const;

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';

  return (
    <View className={cn('flex-row items-center justify-between border-b px-5 py-3', lineClass)}>
      <Text className={cn('font-body text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
      <Text className={cn(mono ? 'font-mono' : 'font-body-medium', 'text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{value}</Text>
    </View>
  );
}

export function DeviceDetail({ device, live, onBack }: { device: DeviceNode; live?: LiveState; onBack: () => void }) {
  const { isDark } = useAppTheme();
  const gateway = live ? gatewayForDevice(device, live) : undefined;
  const measurements = live ? measurementsForDevice(device, live) : [];
  // Channels the rack is actually reporting on right now, not a configuration count.
  const { active: mapped, total } = live ? activeChannelsForDevice(device, live) : { active: 0, total: totalChannelsFor(device.type) };
  const alarms = measurements.filter((m) => channelAlarmLevel(m) !== 'normal').length;

  return (
    <ScrollView className="flex-1">
      <View className="px-6 pt-5">
        <BackButton label="Back to Devices" onPress={onBack} />
      </View>

      <View className="px-6 pt-3">
        <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{device.name}</Text>
      </View>

      <View className={cn('mx-6 mt-4 rounded-xl border', isDark ? 'border-line-dark' : 'border-line-light')}>
        <Row label="Device" value={device.name} />
        {device.realGatewayId && <Row label="Gateway Script ID" value={device.realGatewayId} mono />}
        {device.type === 'Rack' && <Row label="Rack Script ID" value={device.realRackId !== undefined && device.realRackId !== null ? String(device.realRackId) : '-'} mono />}
        <Row label="Model" value={device.model} mono />
        <Row label="IP Address" value={device.ip} mono />
        <Row label="Port" value={device.port} mono />
        <Row label="Protocol" value={device.protocol} />
        <Row label="Status" value={device.status} />
        {gateway && <Row label="Gateway ID" value={gateway.gatewayId} mono />}
        <Row label="Last Communication" value={gateway ? lastSeenLabel(gateway) : device.status === 'Online' ? 'Just now' : '—'} />
        {device.type === 'Rack' && <Row label="Sensor Mapping" value={`${mapped} / ${total}`} mono />}
      </View>

      {device.type === 'Rack' && (
        <View className="flex-row gap-3 px-6 pt-3">
          <MiniStat label="Connected Points" value={mapped} />
          <MiniStat label="Points In Alarm" value={alarms} />
          <MiniStat label="Available Channels" value={Math.max(total - mapped, 0)} />
        </View>
      )}

      {measurements.length > 0 && (
        <View className="px-6 pb-6 pt-5">
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            Live Measurements
          </Text>
          <View className={cn('mt-2 rounded-xl border', isDark ? 'border-line-dark' : 'border-line-light')}>
            {measurements.map((m) => (
              <Row
                key={`${m.slotId}.${m.channelId}.${m.measurementType}`}
                label={`Slot ${m.slotId} · CH${m.channelId} · ${m.sensor ?? m.measurementType}`}
                value={`${formatMeasurement(m)}${ALARM_SUFFIX[channelAlarmLevel(m)]}`}
                mono
              />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  const { isDark } = useAppTheme();
  return (
    <View className={cn('flex-1 rounded-xl border p-4', isDark ? 'border-line-dark' : 'border-line-light')}>
      <Text className={cn('font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
      <Text className={cn('mt-1 font-mono text-xl', isDark ? 'text-ink' : 'text-ink-inverse')}>{value}</Text>
    </View>
  );
}

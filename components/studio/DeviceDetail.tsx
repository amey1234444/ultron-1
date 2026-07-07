import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { totalChannelsFor, type DeviceNode } from '../../lib/devices';

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

export function DeviceDetail({ device, onBack }: { device: DeviceNode; onBack: () => void }) {
  const { isDark } = useAppTheme();
  const total = totalChannelsFor(device.type);
  const mapped = 0; // real mapping arrives with channel mapping (spec §9)

  return (
    <View className="flex-1">
      <Pressable onPress={onBack} className="px-6 pt-5">
        <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>‹ Devices</Text>
      </Pressable>

      <View className="px-6 pt-3">
        <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{device.name}</Text>
      </View>

      <View className={cn('mx-6 mt-4 rounded-xl border', isDark ? 'border-line-dark' : 'border-line-light')}>
        <Row label="Device" value={device.name} />
        <Row label="Model" value={device.model} mono />
        <Row label="IP Address" value={device.ip} mono />
        <Row label="Port" value={device.port} mono />
        <Row label="Protocol" value={device.protocol} />
        <Row label="Status" value={device.status} />
        <Row label="Last Communication" value={device.status === 'Online' ? 'Just now' : '—'} />
        {device.type === 'Rack' && <Row label="Sensor Mapping" value={`${mapped} / ${total}`} mono />}
      </View>

      {device.type === 'Rack' && (
        <View className="flex-row gap-3 px-6 pt-3">
          <MiniStat label="Connected Points" value={mapped} />
          <MiniStat label="Disconnected Points" value={0} />
          <MiniStat label="Available Channels" value={total - mapped} />
        </View>
      )}
    </View>
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

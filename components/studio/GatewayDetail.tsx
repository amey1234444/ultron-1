import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { displayIpFor, lastCommunicationLabel, racksForGateway, type DeviceNode } from '../../lib/devices';
import type { ProjectNode } from '../../lib/hierarchy';
import { PERMISSIONS } from '../../lib/permissions';
import { ActionButton } from './ActionButton';
import { DevicesTable } from './DevicesTable';

type GatewayDetailProps = {
  gateway: DeviceNode;
  devices: DeviceNode[];
  projects: ProjectNode[];
  canConfigure: boolean;
  onBack: () => void;
  onAddRack: () => void;
  onOpenRack: (id: string) => void;
  onOpenMenu?: (x: number, y: number, deviceId: string) => void;
};

function ModeTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-full border px-3 py-1.5',
        active
          ? isDark
            ? 'border-ink bg-ink'
            : 'border-ink-inverse bg-ink-inverse'
          : isDark
            ? 'border-line-dark'
            : 'border-line-light',
      )}
    >
      <Text className={cn('font-body-medium text-xs', active ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {label}
      </Text>
    </Pressable>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { isDark } = useAppTheme();
  return (
    <View className={cn('flex-row items-center justify-between border-b px-5 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
      <Text className={cn('font-body text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
      <Text className={cn(mono ? 'font-mono' : 'font-body-medium', 'text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{value}</Text>
    </View>
  );
}

export function GatewayDetail({ gateway, devices, projects, canConfigure, onBack, onAddRack, onOpenRack, onOpenMenu }: GatewayDetailProps) {
  const { isDark } = useAppTheme();
  const [mode, setMode] = useState<'racks' | 'details'>('racks');
  const racks = racksForGateway(gateway, devices);

  return (
    <View className="flex-1">
      <View className="px-6 pt-5">
        <Pressable onPress={onBack}>
          <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{'< Devices'}</Text>
        </Pressable>
        <View className="mt-3 flex-row items-center justify-between gap-4">
          <View>
            <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{gateway.name}</Text>
            <Text className={cn('mt-1 font-mono text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
              {displayIpFor(gateway)} - {racks.length} rack{racks.length === 1 ? '' : 's'}
            </Text>
          </View>
          {canConfigure ? (
            <ActionButton label="Add Rack" permission={PERMISSIONS.DEVICE_CREATE} onPress={onAddRack} />
          ) : null}
        </View>
        <View className="mt-4 flex-row gap-2">
          <ModeTab label="Racks" active={mode === 'racks'} onPress={() => setMode('racks')} />
          <ModeTab label="Details" active={mode === 'details'} onPress={() => setMode('details')} />
        </View>
      </View>

      {mode === 'details' ? (
        <View className={cn('mx-6 mt-4 rounded-xl border', isDark ? 'border-line-dark' : 'border-line-light')}>
          <InfoRow label="Device" value={gateway.name} />
          <InfoRow label="Model" value={gateway.model} mono />
          <InfoRow label="IP Prefix" value={displayIpFor(gateway)} mono />
          <InfoRow label="Port" value={gateway.port || '-'} mono />
          <InfoRow label="Protocol" value={gateway.protocol} />
          <InfoRow label="Status" value={gateway.status} />
          <InfoRow label="Connected Racks" value={`${racks.length}`} mono />
          <InfoRow label="Last Communication" value={lastCommunicationLabel(gateway)} />
        </View>
      ) : racks.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className={cn('font-body text-sm italic', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>No racks connected to this gateway.</Text>
        </View>
      ) : (
        <DevicesTable devices={racks} allDevices={devices} projects={projects} onOpenDevice={onOpenRack} onOpenMenu={onOpenMenu} />
      )}
    </View>
  );
}

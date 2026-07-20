import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { displayIpFor, racksForGateway, type DeviceNode } from '../../lib/devices';
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

export function GatewayDetail({ gateway, devices, projects, canConfigure, onBack, onAddRack, onOpenRack, onOpenMenu }: GatewayDetailProps) {
  const { isDark } = useAppTheme();
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
      </View>

      {racks.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className={cn('font-body text-sm italic', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>No racks connected to this gateway.</Text>
        </View>
      ) : (
        <DevicesTable devices={racks} allDevices={devices} projects={projects} onOpenDevice={onOpenRack} onOpenMenu={onOpenMenu} />
      )}
    </View>
  );
}

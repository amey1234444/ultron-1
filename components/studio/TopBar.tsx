import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';

import { ThemeToggle } from '../ThemeToggle';
import { useAppTheme } from '../../hooks/useAppTheme';
import { LOGO_DARK, LOGO_LIGHT } from '../../lib/brandLogos';
import { cn } from '../../lib/cn';
import { racksForGateway, type DeviceNode } from '../../lib/devices';

const LOGO_ASPECT = 284 / 77;
const LOGO_HEIGHT = 24;

type TopBarProps = {
  projectName?: string | null;
  alarmCount?: number;
  devices?: DeviceNode[];
  canConfigure?: boolean;
  configureMode?: boolean;
  onConfigureModeChange?: (enabled: boolean) => void;
};

function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function LiveClock({ muted, ink }: { muted: string; ink: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className={cn('font-body-medium text-[11px] uppercase tracking-wide', muted)}>Live</Text>
      <Text className={cn('font-mono text-xs tabular-nums', ink)}>{formatClock(now)}</Text>
    </View>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={{ width: 1, height: 18, backgroundColor: color }} />;
}

function ConnectionsMenu({ devices, compact }: { devices: DeviceNode[]; compact: boolean }) {
  const { isDark } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';

  const realDevices = useMemo(() => devices.filter((d) => !d.archived), [devices]);
  const active = useMemo(() => realDevices.filter((d) => d.status === 'Online'), [realDevices]);
  const gateways = useMemo(() => realDevices.filter((d) => d.type === 'Gateway'), [realDevices]);
  const total = realDevices.length;
  const selectedGateway = useMemo(
    () => gateways.find((gateway) => gateway.id === selectedGatewayId) ?? gateways[0] ?? null,
    [gateways, selectedGatewayId],
  );
  const selectedRacks = useMemo(() => (selectedGateway ? racksForGateway(selectedGateway, devices) : []), [devices, selectedGateway]);

  useEffect(() => {
    if (!selectedGatewayId && gateways[0]) setSelectedGatewayId(gateways[0].id);
    if (selectedGatewayId && !gateways.some((gateway) => gateway.id === selectedGatewayId)) {
      setSelectedGatewayId(gateways[0]?.id ?? null);
    }
  }, [gateways, selectedGatewayId]);

  const panelStyle = {
    backgroundColor: isDark ? 'rgba(16,16,16,0.96)' : 'rgba(255,255,255,0.98)',
    backdropFilter: 'blur(18px) saturate(160%)',
    WebkitBackdropFilter: 'blur(18px) saturate(160%)',
  } as unknown as ViewStyle;

  const Row = ({ device, selected = false, onPress }: { device: DeviceNode; selected?: boolean; onPress?: () => void }) => {
    const isOnline = device.status === 'Online';
    return (
      <Pressable
        onPress={onPress}
        className={cn('flex-row items-center gap-2.5 px-3 py-2', selected && (isDark ? 'bg-ink/10' : 'bg-ink-inverse/10'))}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: isOnline ? '#3FB950' : isDark ? '#5A5A5A' : '#B4B4B4',
          }}
        />
        <View className="flex-1">
          <Text numberOfLines={1} className={cn('font-body-medium text-xs', inkClass)}>
            {device.name}
          </Text>
          <Text numberOfLines={1} className={cn('font-mono text-[10px]', mutedClass)}>
            {device.ip || 'no ip'} - {device.type}
          </Text>
        </View>
        <Text className={cn('font-body-medium text-[10px]', isOnline ? 'text-status-success' : mutedClass)}>
          {isOnline ? 'active' : 'offline'}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className={cn('flex-row items-center gap-1.5 rounded-full border px-2.5 py-1', lineClass)}
      >
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#3FB950' }} />
        <Text className={cn('font-body-medium text-[11px]', inkClass)}>
          {active.length}
          <Text className={mutedClass}>/{total}</Text>
        </Text>
        {!compact && <Text className={cn('font-body-medium text-[11px]', mutedClass)}>IPs</Text>}
        <Text className={cn('text-[9px]', mutedClass)}>v</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1" onPress={() => setOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className={cn('absolute overflow-hidden rounded-2xl border', lineClass)}
            style={[
              {
                top: 54,
                right: 12,
                width: compact ? 420 : 560,
                maxHeight: 380,
                shadowColor: '#000',
                shadowOpacity: isDark ? 0.5 : 0.18,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 12 },
                elevation: 12,
              },
              panelStyle,
            ]}
          >
            <View className={cn('flex-row items-center justify-between border-b px-3 py-2.5', lineClass)}>
              <Text className={cn('font-body-bold text-xs uppercase tracking-wider', inkClass)}>Connections</Text>
              <Text className={cn('font-body-medium text-[11px]', mutedClass)}>
                {active.length} of {total} active
              </Text>
            </View>

            {total === 0 ? (
              <Text className={cn('px-3 py-4 font-body text-xs italic', mutedClass)}>No devices added yet.</Text>
            ) : (
              <View className="flex-row">
                <View className={cn('border-r', lineClass)} style={{ width: compact ? 190 : 240 }}>
                  <Text className={cn('px-3 pb-1 pt-2 font-body-medium text-[10px] uppercase tracking-wider', mutedClass)}>
                    Gateways - {gateways.length}
                  </Text>
                  <ScrollView style={{ maxHeight: 320 }}>
                    {gateways.map((gateway) => (
                      <Row
                        key={gateway.id}
                        device={gateway}
                        selected={selectedGateway?.id === gateway.id}
                        onPress={() => setSelectedGatewayId(gateway.id)}
                      />
                    ))}
                  </ScrollView>
                </View>

                <View className="flex-1">
                  <Text className={cn('px-3 pb-1 pt-2 font-body-medium text-[10px] uppercase tracking-wider', mutedClass)}>
                    {selectedGateway ? `${selectedGateway.name} racks` : 'Racks'} - {selectedRacks.filter((rack) => rack.status === 'Online').length}/{selectedRacks.length} active
                  </Text>
                  <ScrollView style={{ maxHeight: 320 }}>
                    {selectedRacks.length === 0 ? (
                      <Text className={cn('px-3 py-4 font-body text-xs italic', mutedClass)}>No racks under this gateway.</Text>
                    ) : (
                      selectedRacks.map((rack) => <Row key={rack.id} device={rack} />)
                    )}
                  </ScrollView>
                </View>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function TopBar({
  projectName,
  alarmCount = 0,
  devices = [],
  canConfigure = false,
  configureMode = false,
  onConfigureModeChange,
}: TopBarProps) {
  const { isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const isNarrow = width > 0 && width < 640;
  const isMid = width > 0 && width < 900;

  const fade = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(10,10,10,0.12)';
  const dividerColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(10,10,10,0.10)';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const glassStyle = {
    backgroundColor: isDark ? 'rgba(10,10,10,0.55)' : 'rgba(250,250,250,0.6)',
    backdropFilter: 'blur(16px) saturate(160%)',
    WebkitBackdropFilter: 'blur(16px) saturate(160%)',
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,10,10,0.08)',
  } as unknown as ViewStyle;

  const hasAlarms = alarmCount > 0;
  const showDividers = !isNarrow;

  return (
    <View
      className="relative z-10 flex-row flex-wrap items-center justify-between gap-y-2 px-4 py-2"
      style={glassStyle}
    >
      <View className="flex-row items-center gap-3">
        <Image
          source={isDark ? LOGO_DARK : LOGO_LIGHT}
          style={{ height: LOGO_HEIGHT, width: LOGO_HEIGHT * LOGO_ASPECT }}
          resizeMode="contain"
        />
        {!isNarrow && (
          <>
            <Divider color={dividerColor} />
            <Text numberOfLines={1} className={cn('font-body-medium text-sm', mutedClass)} style={{ maxWidth: 220 }}>
              {projectName || 'Studio'}
            </Text>
          </>
        )}
      </View>

      <View className="flex-row flex-wrap items-center justify-end gap-3">
        {canConfigure && (
          <>
            <Pressable
              onPress={() => onConfigureModeChange?.(!configureMode)}
              accessibilityRole="switch"
              accessibilityState={{ checked: configureMode }}
              className={cn(
                'flex-row items-center gap-2 rounded-full border px-2.5 py-1',
                configureMode
                  ? 'border-accent bg-accent/15'
                  : isDark
                    ? 'border-line-dark'
                    : 'border-line-light',
              )}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: configureMode ? '#C9A15C' : isDark ? '#5A5A5A' : '#9A9A9A',
                }}
              />
              <Text className={cn('font-body-medium text-[11px]', configureMode ? 'text-accent' : mutedClass)}>Configure</Text>
            </Pressable>

            {showDividers && <Divider color={dividerColor} />}
          </>
        )}

        <ConnectionsMenu devices={devices} compact={isMid} />

        {showDividers && <Divider color={dividerColor} />}

        <View className="flex-row items-center gap-1.5">
          <View className={cn('h-2 w-2 rounded-full', hasAlarms ? 'bg-status-critical' : 'bg-ink-muted')} />
          <Text className={cn('font-body-medium text-[11px]', hasAlarms ? 'text-status-critical' : mutedClass)}>
            {alarmCount}
            {!isMid ? ` ${alarmCount === 1 ? 'Alarm' : 'Alarms'}` : ''}
          </Text>
        </View>

        {!isMid && (
          <>
            <Divider color={dividerColor} />
            <LiveClock muted={mutedClass} ink={inkClass} />
          </>
        )}

        {showDividers && <Divider color={dividerColor} />}

        <ThemeToggle />
      </View>

      <LinearGradient
        colors={['transparent', fade, fade, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1 }}
      />
    </View>
  );
}

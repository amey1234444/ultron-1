import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';

import { ThemeToggle } from '../ThemeToggle';
import { useAppTheme } from '../../hooks/useAppTheme';
import { LOGO_DARK, LOGO_LIGHT } from '../../lib/brandLogos';
import { cn } from '../../lib/cn';
import type { DeviceNode } from '../../lib/devices';

const LOGO_ASPECT = 284 / 77;
const LOGO_HEIGHT = 24;

type TopBarProps = {
  projectName?: string | null;
  // Optional live-status inputs; sensible defaults keep the header useful even
  // before real telemetry/alarm wiring exists.
  online?: boolean;
  alarmCount?: number;
  // Devices power the "Connections" dropdown (active/inactive IPs + machine ids).
  devices?: DeviceNode[];
};

function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Ticking wall-clock, refreshed every 15s.
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

// Dropdown listing every device grouped by connection state: active IPs get a
// green dot, inactive ones a grey dot, each paired with its machine/device id —
// so an operator can see at a glance which gateways/racks are reachable.
function ConnectionsMenu({
  devices,
  compact,
}: {
  devices: DeviceNode[];
  compact: boolean;
}) {
  const { isDark } = useAppTheme();
  const [open, setOpen] = useState(false);
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';

  const { active, inactive } = useMemo(() => {
    const real = devices.filter((d) => !d.archived);
    return {
      active: real.filter((d) => d.status === 'Online'),
      inactive: real.filter((d) => d.status !== 'Online'),
    };
  }, [devices]);
  const total = active.length + inactive.length;

  const panelStyle = {
    backgroundColor: isDark ? 'rgba(16,16,16,0.96)' : 'rgba(255,255,255,0.98)',
    backdropFilter: 'blur(18px) saturate(160%)',
    WebkitBackdropFilter: 'blur(18px) saturate(160%)',
  } as unknown as ViewStyle;

  const Row = ({ device }: { device: DeviceNode }) => {
    const isOnline = device.status === 'Online';
    return (
      <View className="flex-row items-center gap-2.5 px-3 py-2">
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
            {device.ip || 'no ip'} · {device.type}
          </Text>
        </View>
        <Text className={cn('font-body-medium text-[10px]', isOnline ? 'text-status-success' : mutedClass)}>
          {isOnline ? 'active' : 'idle'}
        </Text>
      </View>
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
        <Text className={cn('text-[9px]', mutedClass)}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1" onPress={() => setOpen(false)}>
          <View
            className={cn('absolute overflow-hidden rounded-2xl border', lineClass)}
            style={[
              {
                top: 54,
                right: 12,
                width: 288,
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
                {active.length} of {total} online
              </Text>
            </View>

            {total === 0 ? (
              <Text className={cn('px-3 py-4 font-body text-xs italic', mutedClass)}>No devices added yet.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {active.length > 0 && (
                  <View className={cn('border-b', lineClass)}>
                    <Text className={cn('px-3 pb-1 pt-2 font-body-medium text-[10px] uppercase tracking-wider text-status-success')}>
                      Active · {active.length}
                    </Text>
                    {active.map((d) => (
                      <Row key={d.id} device={d} />
                    ))}
                  </View>
                )}
                {inactive.length > 0 && (
                  <View>
                    <Text className={cn('px-3 pb-1 pt-2 font-body-medium text-[10px] uppercase tracking-wider', mutedClass)}>
                      Inactive · {inactive.length}
                    </Text>
                    {inactive.map((d) => (
                      <Row key={d.id} device={d} />
                    ))}
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export function TopBar({ projectName, online = true, alarmCount = 0, devices = [] }: TopBarProps) {
  const { isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  // Progressive disclosure: drop the least-essential chrome first as the header
  // narrows, so it never overflows on tablet/phone widths.
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
      {/* Left: brand + location breadcrumb */}
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

      {/* Right: connections + live status cluster + theme toggle */}
      <View className="flex-row items-center gap-3">
        <ConnectionsMenu devices={devices} compact={isMid} />

        {showDividers && <Divider color={dividerColor} />}

        <View className="flex-row items-center gap-1.5">
          <View className={cn('h-2 w-2 rounded-full', online ? 'bg-status-success' : 'bg-ink-muted')} />
          {!isMid && (
            <Text className={cn('font-body-medium text-[11px]', online ? 'text-status-success' : mutedClass)}>
              {online ? 'Online' : 'Offline'}
            </Text>
          )}
        </View>

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

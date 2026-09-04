import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';

import { ThemeToggle } from '../ThemeToggle';
import { useAppTheme } from '../../hooks/useAppTheme';
import { LOGO_ASPECT, LOGO_DARK, LOGO_LIGHT } from '../../lib/brandLogos';
import { cn } from '../../lib/cn';
import { deviceWithGatewayConnectionState, racksForGateway, type DeviceNode } from '../../lib/devices';

const LOGO_HEIGHT = 19;

/** The three top-level destinations the console opens onto. */
export type ConsoleView = 'overview' | 'hierarchy' | 'devices';

const VIEWS: { id: ConsoleView; label: string; hint: string }[] = [
  { id: 'overview', label: 'Plant Overview', hint: 'Operations, performance and history' },
  { id: 'hierarchy', label: 'Asset Hierarchy', hint: 'Projects, areas and machines' },
  { id: 'devices', label: 'Devices', hint: 'Gateways, racks and channels' },
];

type TopBarProps = {
  alarmCount?: number;
  devices?: DeviceNode[];
  canConfigure?: boolean;
  configureMode?: boolean;
  onConfigureModeChange?: (enabled: boolean) => void;
  onLogoPress?: () => void;
  /** Only signed-in operators get the view switcher. */
  authenticated?: boolean;
  view?: ConsoleView;
  onViewChange?: (view: ConsoleView) => void;
  /** Plants to choose between. Only surfaced while the overview is open. */
  plants?: { id: string; name: string }[];
  plantId?: string | null;
  onPlantChange?: (id: string) => void;
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
      <Text className={cn('font-mono text-[9px] uppercase tracking-[0.2em]', muted)}>Live</Text>
      <Text className={cn('font-mono text-xs tabular-nums', ink)}>{formatClock(now)}</Text>
    </View>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={{ width: 1, height: 18, backgroundColor: color }} />;
}

function ConnectionsMenu({ devices, compact }: { devices: DeviceNode[]; compact: boolean }) {
  const { isDark } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';

  const realDevices = useMemo(
    () => devices.filter((d) => !d.archived).map((device) => deviceWithGatewayConnectionState(device, devices)),
    [devices],
  );
  const active = useMemo(() => realDevices.filter((d) => d.status === 'Online'), [realDevices]);
  const gateways = useMemo(() => realDevices.filter((d) => d.type === 'Gateway'), [realDevices]);
  const total = realDevices.length;
  const selectedGateway = useMemo(() => gateways.find((gateway) => gateway.id === selectedGatewayId) ?? null, [gateways, selectedGatewayId]);
  const selectedRacks = useMemo(() => (selectedGateway ? racksForGateway(selectedGateway, realDevices) : []), [realDevices, selectedGateway]);
  const menuWidth = Math.max(250, Math.min((width || 360) - 24, compact ? 300 : 340));
  const panelMaxHeight = Math.max(190, Math.min(340, (height || 460) - 72));
  const listMaxHeight = Math.max(132, panelMaxHeight - 48);

  useEffect(() => {
    if (selectedGatewayId && !gateways.some((gateway) => gateway.id === selectedGatewayId)) {
      setSelectedGatewayId(null);
    }
  }, [gateways, selectedGatewayId]);

  const panelStyle = {
    backgroundColor: isDark ? 'rgba(16,16,16,0.97)' : 'rgba(255,255,255,0.98)',
    backdropFilter: 'blur(14px) saturate(150%)',
    WebkitBackdropFilter: 'blur(14px) saturate(150%)',
  } as unknown as ViewStyle;

  const Row = ({
    device,
    selected = false,
    onPress,
    onHoverIn,
    detail,
  }: {
    device: DeviceNode;
    selected?: boolean;
    onPress?: () => void;
    onHoverIn?: () => void;
    detail?: string;
  }) => {
    const isOnline = device.status === 'Online';
    return (
      <Pressable
        onPress={onPress}
        onHoverIn={onHoverIn}
        className={cn('flex-row items-center gap-2 px-3 py-1.5', selected && (isDark ? 'bg-ink/10' : 'bg-ink-inverse/10'))}
      >
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: isOnline ? '#3FBF6A' : isDark ? '#5A5A5A' : '#B4B4B4',
          }}
        />
        <View className="flex-1">
          <Text numberOfLines={1} className={cn('font-body-medium text-[11px]', inkClass)}>
            {device.name}
          </Text>
          <Text numberOfLines={1} className={cn('font-mono text-[10px]', mutedClass)}>
            {device.ip || 'not set'} - {detail ?? device.type}
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
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: active.length > 0 ? '#3FBF6A' : isDark ? '#5A5A5A' : '#B4B4B4' }} />
        <Text className={cn('font-body-medium text-[11px]', inkClass)}>
          {active.length}
          <Text className={mutedClass}>/{total}</Text>
        </Text>
        {!compact && <Text className={cn('font-mono text-[9.5px] uppercase tracking-[0.18em]', mutedClass)}>IPs</Text>}
        <Text className={cn('text-[9px]', mutedClass)}>v</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1" onPress={() => setOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className={cn('absolute overflow-hidden rounded-xl border', lineClass)}
            style={[
              {
                top: 54,
                right: 12,
                width: menuWidth,
                maxHeight: panelMaxHeight,
                shadowColor: '#000',
                shadowOpacity: isDark ? 0.42 : 0.14,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
              },
              panelStyle,
            ]}
          >
            <View className={cn('flex-row items-center justify-between border-b px-3 py-2', lineClass)}>
              <Text className={cn('font-mono text-[10px] uppercase tracking-[0.2em]', inkClass)}>Connections</Text>
              <Text className={cn('font-body-medium text-[11px]', mutedClass)}>
                {active.length} of {total} active
              </Text>
            </View>

            {total === 0 ? (
              <Text className={cn('px-3 py-4 font-body text-xs italic', mutedClass)}>No devices added yet.</Text>
            ) : (
              <ScrollView style={{ maxHeight: listMaxHeight }}>
                <Text className={cn('px-3 pb-0.5 pt-1.5 font-body-medium text-[9px] uppercase tracking-wider', mutedClass)}>
                  Gateways - {gateways.length}
                </Text>
                {gateways.length === 0 ? (
                  <Text className={cn('px-3 py-4 font-body text-xs italic', mutedClass)}>No gateways added yet.</Text>
                ) : (
                  gateways.map((gateway) => {
                    const gatewayRacks = racksForGateway(gateway, realDevices);
                    const onlineRackCount = gatewayRacks.filter((rack) => rack.status === 'Online').length;
                    const expanded = selectedGateway?.id === gateway.id;
                    return (
                      <View key={gateway.id}>
                        <Row
                          device={gateway}
                          selected={expanded}
                          detail={`${onlineRackCount}/${gatewayRacks.length} racks active`}
                          onHoverIn={() => setSelectedGatewayId(gateway.id)}
                          onPress={() => setSelectedGatewayId((current) => (current === gateway.id ? null : gateway.id))}
                        />
                        {expanded && (
                          <View
                            className={cn('mb-1 ml-6 mr-2 border-l pl-2', isDark ? 'border-line-dark' : 'border-line-light')}
                          >
                            <Text className={cn('pb-0.5 pt-1 font-body-medium text-[9px] uppercase tracking-wider', mutedClass)}>
                              Racks - {selectedRacks.filter((rack) => rack.status === 'Online').length}/{selectedRacks.length} active
                            </Text>
                            {selectedRacks.length === 0 ? (
                              <Text className={cn('py-2 font-body text-[11px] italic', mutedClass)}>No racks under this gateway.</Text>
                            ) : (
                              selectedRacks.map((rack) => <Row key={rack.id} device={rack} />)
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/**
 * The switcher that used to be a pill toggle floating over the sidebar.
 *
 * It belongs next to the wordmark: which workspace you are in is an
 * application-level fact, not a property of the tree, and putting it here means
 * the sidebar can go back to being nothing but the tree. The same control
 * carries the plant picker, which is why it takes generic options — a second
 * dropdown that looked different would read as a different kind of choice.
 */
function NavSelect<T extends string>({
  prefix,
  value,
  options,
  onChange,
  width = 268,
}: {
  prefix?: string;
  value: T;
  options: { id: T; label: string; hint?: string }[];
  onChange: (id: T) => void;
  width?: number;
}) {
  const { isDark } = useAppTheme();
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const current = options.find((entry) => entry.id === value) ?? options[0];
  if (!current) return null;

  // Measured rather than hard-coded: the trigger's x moves with the wordmark,
  // the prefix label and whatever sits before it.
  const open = () => {
    triggerRef.current?.measureInWindow?.((x, y, _w, h) => setAnchor({ left: x, top: y + h + 6 }));
  };

  return (
    <>
      <View ref={triggerRef} className="flex-row items-center gap-2">
        {prefix ? (
          <Text className={cn('font-mono text-[9px] uppercase tracking-[0.18em]', mutedClass)}>{prefix}</Text>
        ) : null}
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${prefix ?? 'View'}: ${current.label}. Change`}
          className={cn('flex-row items-center gap-2 rounded-lg border px-2.5 py-1', lineClass)}
        >
          <Text className={cn('font-body-medium text-[12px]', inkClass)}>{current.label}</Text>
          <Text className={cn('text-[8px]', mutedClass)}>▾</Text>
        </Pressable>
      </View>

      <Modal visible={anchor !== null} transparent animationType="fade" onRequestClose={() => setAnchor(null)}>
        <Pressable className="flex-1" onPress={() => setAnchor(null)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className={cn('absolute overflow-hidden rounded-xl border', lineClass)}
            style={{
              top: anchor?.top ?? 46,
              left: anchor?.left ?? 132,
              width,
              backgroundColor: isDark ? 'rgba(17,19,24,0.98)' : 'rgba(255,255,255,0.98)',
              shadowColor: '#000',
              shadowOpacity: isDark ? 0.42 : 0.14,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }}
          >
            {options.map((entry) => {
              const active = entry.id === value;
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => {
                    onChange(entry.id);
                    setAnchor(null);
                  }}
                  accessibilityRole="menuitem"
                  className={cn('flex-row items-center gap-2.5 px-3 py-2.5', active && (isDark ? 'bg-white/[0.06]' : 'bg-black/[0.04]'))}
                >
                  <View style={{ width: 3, height: entry.hint ? 22 : 14, borderRadius: 2, backgroundColor: active ? '#3FBF6A' : 'transparent' }} />
                  <View className="flex-1">
                    <Text className={cn('font-body-medium text-[12.5px]', inkClass)}>{entry.label}</Text>
                    {entry.hint ? <Text className={cn('mt-0.5 font-body text-[10.5px]', mutedClass)}>{entry.hint}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function TopBar({
  alarmCount = 0,
  devices = [],
  canConfigure = false,
  configureMode = false,
  onConfigureModeChange,
  onLogoPress,
  authenticated = false,
  view = 'overview',
  onViewChange,
  plants = [],
  plantId = null,
  onPlantChange,
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
    backgroundColor: isDark ? 'rgba(8,9,12,0.72)' : 'rgba(252,252,251,0.78)',
    backdropFilter: 'blur(20px) saturate(170%)',
    WebkitBackdropFilter: 'blur(20px) saturate(170%)',
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,10,10,0.08)',
    shadowColor: '#000',
    shadowOpacity: isDark ? 0.4 : 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  } as unknown as ViewStyle;

  const hasAlarms = alarmCount > 0;
  const showDividers = !isNarrow;

  return (
    <View
      className="relative z-10 flex-row flex-wrap items-center justify-between gap-y-1.5 px-4 py-1.5"
      style={glassStyle}
    >
      <View className="flex-row items-center gap-3">
        <Pressable onPress={onLogoPress} accessibilityRole="button" accessibilityLabel="Go to main page">
          <Image
            source={isDark ? LOGO_DARK : LOGO_LIGHT}
            style={{ height: LOGO_HEIGHT, width: LOGO_HEIGHT * LOGO_ASPECT }}
            resizeMode="contain"
          />
        </Pressable>
        {authenticated && onViewChange ? <NavSelect value={view} options={VIEWS} onChange={onViewChange} /> : null}
        {/* The plant picker only means anything inside the overview, so it only
            exists there — a disabled or irrelevant control in the nav is worse
            than no control. */}
        {authenticated && view === 'overview' && plants.length > 0 && onPlantChange ? (
          <NavSelect
            prefix="Plant"
            value={plantId ?? plants[0].id}
            options={plants.map((plant) => ({ id: plant.id, label: plant.name }))}
            onChange={onPlantChange}
            width={240}
          />
        ) : null}
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
                  backgroundColor: configureMode ? '#3FBF6A' : isDark ? '#5A5A5A' : '#9A9A9A',
                }}
              />
              <Text className={cn('font-mono text-[9.5px] uppercase tracking-[0.18em]', configureMode ? 'text-accent' : mutedClass)}>
                Configure
              </Text>
            </Pressable>

            {showDividers && <Divider color={dividerColor} />}
          </>
        )}

        <ConnectionsMenu devices={devices} compact={isMid} />

        {showDividers && <Divider color={dividerColor} />}

        <View className="flex-row items-center gap-1.5">
          <View className={cn('h-2 w-2 rounded-full', hasAlarms ? 'bg-status-critical' : 'bg-ink-muted')} />
          <Text className={cn('font-mono text-[10px] uppercase tracking-[0.16em]', hasAlarms ? 'text-status-critical' : mutedClass)}>
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

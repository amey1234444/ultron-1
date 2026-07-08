import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Image, Text, View, type ViewStyle } from 'react-native';

import { ThemeToggle } from '../ThemeToggle';
import { useAppTheme } from '../../hooks/useAppTheme';
import { LOGO_DARK, LOGO_LIGHT } from '../../lib/brandLogos';
import { cn } from '../../lib/cn';

const LOGO_ASPECT = 284 / 77;
const LOGO_HEIGHT = 24;

type TopBarProps = {
  projectName?: string | null;
  // Optional live-status inputs; sensible defaults keep the header useful even
  // before real telemetry/alarm wiring exists.
  online?: boolean;
  alarmCount?: number;
};

function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Ticking wall-clock, refreshed once a minute (aligned to the next minute).
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

export function TopBar({ projectName, online = true, alarmCount = 0 }: TopBarProps) {
  const { isDark } = useAppTheme();
  const fade = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(10,10,10,0.12)';
  const dividerColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(10,10,10,0.10)';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  // Frosted-glass bar: translucent surface + backdrop blur so anything behind
  // (menus, scrolling content) shows through softly. Web-only CSS keys are cast
  // through ViewStyle, matching the pattern used elsewhere in the studio.
  const glassStyle = {
    backgroundColor: isDark ? 'rgba(10,10,10,0.55)' : 'rgba(250,250,250,0.6)',
    backdropFilter: 'blur(16px) saturate(160%)',
    WebkitBackdropFilter: 'blur(16px) saturate(160%)',
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,10,10,0.08)',
  } as unknown as ViewStyle;

  const hasAlarms = alarmCount > 0;

  return (
    <View className="relative z-10 flex-row items-center justify-between px-4 py-2" style={glassStyle}>
      {/* Left: brand + location breadcrumb */}
      <View className="flex-row items-center gap-3">
        <Image
          source={isDark ? LOGO_DARK : LOGO_LIGHT}
          style={{ height: LOGO_HEIGHT, width: LOGO_HEIGHT * LOGO_ASPECT }}
          resizeMode="contain"
        />
        <Divider color={dividerColor} />
        <Text className={cn('font-body-medium text-sm', mutedClass)}>{projectName || 'Studio'}</Text>
      </View>

      {/* Right: live status cluster + theme toggle */}
      <View className="flex-row items-center gap-3">
        <View className="flex-row items-center gap-1.5">
          <View className={cn('h-2 w-2 rounded-full', online ? 'bg-status-success' : 'bg-ink-muted')} />
          <Text className={cn('font-body-medium text-[11px]', online ? 'text-status-success' : mutedClass)}>
            {online ? 'Online' : 'Offline'}
          </Text>
        </View>

        <Divider color={dividerColor} />

        <View className="flex-row items-center gap-1.5">
          <View className={cn('h-2 w-2 rounded-full', hasAlarms ? 'bg-status-critical' : 'bg-ink-muted')} />
          <Text className={cn('font-body-medium text-[11px]', hasAlarms ? 'text-status-critical' : mutedClass)}>
            {alarmCount} {alarmCount === 1 ? 'Alarm' : 'Alarms'}
          </Text>
        </View>

        <Divider color={dividerColor} />

        <LiveClock muted={mutedClass} ink={inkClass} />

        <Divider color={dividerColor} />

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

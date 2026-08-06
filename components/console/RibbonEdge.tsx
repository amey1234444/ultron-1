import { LinearGradient } from 'expo-linear-gradient';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { DeviceHealth } from '../../lib/devices';

const HEALTH_COLOR: Record<Exclude<DeviceHealth, 'normal'>, string> = {
  warning: '#E3B341',
  critical: '#F2624A',
  disconnected: '#F2624A',
};

function healthColor(health: DeviceHealth, isDark: boolean): string {
  if (health === 'normal') return isDark ? '#F5F5F5' : '#0A0A0A';
  return HEALTH_COLOR[health];
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** A soft, tapered light on one edge of a row — a glow segment, not a hard bar. */
export function RibbonEdge({ health, side }: { health: DeviceHealth; side: 'left' | 'right' }) {
  const { isDark } = useAppTheme();
  const color = healthColor(health, isDark);
  const peak = health === 'normal' ? (isDark ? 0.55 : 0.4) : 0.9;

  return (
    <LinearGradient
      colors={['transparent', hexToRgba(color, peak), hexToRgba(color, peak), 'transparent']}
      locations={[0, 0.28, 0.72, 1]}
      style={
        side === 'left'
          ? { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 }
          : { position: 'absolute', top: 0, bottom: 0, right: 0, width: 4 }
      }
    />
  );
}

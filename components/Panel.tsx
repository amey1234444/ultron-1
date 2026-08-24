import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '../hooks/useAppTheme';
import { cn } from '../lib/cn';
import { STATUS_HEX, type Status } from '../lib/status';

type PanelProps = {
  children: ReactNode;
  className?: string;
  status?: Status;
  // Fill the height of the column this panel sits in, instead of sizing to its
  // own content. A row of panels is a row of instruments and should read as one
  // band; without this the short one stops halfway and the row looks unfinished.
  // The surface inside has to grow too, or the panel's border would run to the
  // bottom of the column while its background stopped at the content.
  fill?: boolean;
};

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function Panel({ children, className, status, fill = false }: PanelProps) {
  const { isDark } = useAppTheme();
  // "success" reads as normal, not a color to celebrate — keep the panel neutral
  // (only the StatusDot shows green); warning/critical are the ones worth coloring.
  const glowColor = !status ? null : status === 'success' ? (isDark ? '#FFFFFF' : '#0A0A0A') : STATUS_HEX[status];

  return (
    <View
      className={cn(
        'overflow-hidden rounded-2xl border',
        isDark ? 'border-line-dark' : 'border-line-light',
        fill && 'flex-1',
        className,
      )}
      style={
        glowColor
          ? {
              shadowColor: glowColor,
              shadowOpacity: isDark ? 0.14 : 0.1,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 3,
            }
          : undefined
      }
    >
      {glowColor && <View style={{ height: 1, backgroundColor: hexToRgba(glowColor, 0.6) }} />}
      {glowColor ? (
        <LinearGradient
          colors={[hexToRgba(glowColor, isDark ? 0.05 : 0.06), isDark ? 'rgba(19,19,19,1)' : 'rgba(255,255,255,1)']}
          style={fill ? { padding: 24, flex: 1 } : { padding: 24 }}
        >
          {children}
        </LinearGradient>
      ) : (
        <View className={cn('p-6', fill && 'flex-1', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}>
          {children}
        </View>
      )}
    </View>
  );
}

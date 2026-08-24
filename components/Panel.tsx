import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '../hooks/useAppTheme';
import { cn } from '../lib/cn';
import { consolePalette } from '../lib/consoleTheme';
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
  const palette = consolePalette(isDark);
  // "success" reads as normal, not a color to celebrate — keep the panel neutral
  // (only the StatusDot shows green); warning/critical are the ones worth coloring.
  //
  // In LIGHT mode nothing is coloured, whatever the status. A tinted wash and a
  // coloured top rule are a dark-theme device: on #08090C they read as depth,
  // on #FFFFFF they turn an entire region of the page amber and the reader
  // stops being able to tell which part of it is actually the alarm. The state
  // is still said — by the ring, the bars, the status word and the diagnosis's
  // own accent — in the places where it means something. See the note at the
  // top of lib/consoleTheme.ts.
  const glowColor = !isDark || !status ? null : status === 'success' ? '#FFFFFF' : STATUS_HEX[status];

  return (
    <View
      className={cn('overflow-hidden rounded-2xl border', fill && 'flex-1', className)}
      style={
        glowColor
          ? {
              borderColor: palette.line,
              shadowColor: glowColor,
              shadowOpacity: 0.14,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 3,
            }
          : { borderColor: palette.line }
      }
    >
      {glowColor && <View style={{ height: 1, backgroundColor: hexToRgba(glowColor, 0.6) }} />}
      {glowColor ? (
        <LinearGradient
          colors={[hexToRgba(glowColor, 0.05), 'rgba(19,19,19,1)']}
          style={fill ? { padding: 24, flex: 1 } : { padding: 24 }}
        >
          {children}
        </LinearGradient>
      ) : (
        <View className={cn('p-6', fill && 'flex-1')} style={{ backgroundColor: palette.panel }}>
          {children}
        </View>
      )}
    </View>
  );
}

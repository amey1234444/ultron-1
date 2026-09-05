import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cardElevation, consolePalette } from '../../../../lib/consoleTheme';

export function OverviewPanel({
  children,
  style,
  padding = 18,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <View
      style={[
        {
          overflow: 'hidden',
          borderWidth: 1,
          borderRadius: 12,
          borderColor: palette.line,
          backgroundColor: isDark ? '#0A0B0C' : palette.panel,
          padding,
        },
        cardElevation(isDark),
        style,
      ]}
    >
      {children}
    </View>
  );
}

import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { ConsolePalette } from '../../../lib/consoleTheme';

export type Section = 'operations' | 'scorecard' | 'diagnostics' | 'setup' | 'trends' | 'history';

interface LeftMiniNavProps {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
  palette: ConsolePalette;
  isDark: boolean;
}

interface NavItemDef {
  id: Section;
  label: string;
  subtitle: string;
  icon: (color: string, active: boolean) => React.ReactNode;
  badge?: string;
}

const NAV_ITEMS: NavItemDef[] = [
  {
    id: 'operations',
    label: 'Operations',
    subtitle: '3D plant twin & live workspace',
    icon: (color, active) => (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <Rect x={3} y={3} width={7} height={7} rx={1.5} />
        <Rect x={14} y={3} width={7} height={7} rx={1.5} />
        <Rect x={14} y={14} width={7} height={7} rx={1.5} />
        <Rect x={3} y={14} width={7} height={7} rx={1.5} />
      </Svg>
    ),
  },
  {
    id: 'scorecard',
    label: 'Scorecard',
    subtitle: 'Plant performance & target gaps',
    icon: (color, active) => (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <Rect x={3} y={3} width={18} height={18} rx={2} />
        <Path d="M7 17v-4" />
        <Path d="M12 17V7" />
        <Path d="M17 17v-7" />
      </Svg>
    ),
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    subtitle: 'Telemetry & fault analysis',
    icon: (color, active) => (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </Svg>
    ),
  },
  {
    id: 'setup',
    label: 'Setup',
    subtitle: 'Plant configuration & assets',
    icon: (color, active) => (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </Svg>
    ),
  },
  {
    id: 'trends',
    label: 'Trends',
    subtitle: 'Telemetry history & multi-charts',
    icon: (color, active) => (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M3 3v18h18" />
        <Path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
      </Svg>
    ),
  },
  {
    id: 'history',
    label: 'History',
    subtitle: 'Operational logs & event stream',
    icon: (color, active) => (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx={12} cy={12} r={9} />
        <Path d="M12 7v5l3 3" />
      </Svg>
    ),
  },
];

export function LeftMiniNav({ activeSection, onSectionChange, palette, isDark }: LeftMiniNavProps) {
  const [hoveredId, setHoveredId] = useState<Section | null>(null);

  const bgStyle = {
    backgroundColor: isDark ? 'rgba(12, 14, 18, 0.95)' : 'rgba(255, 255, 255, 0.96)',
    borderRightWidth: 1,
    borderRightColor: palette.line,
  };

  return (
    <View
      style={[
        bgStyle,
        {
          width: 52,
          zIndex: 40,
          paddingVertical: 12,
          alignItems: 'center',
          justifyContent: 'flex-start',
        },
      ]}
    >
      <View style={{ gap: 10, width: '100%', alignItems: 'center' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === activeSection;
          const isHovered = item.id === hoveredId;
          const iconColor = isActive
            ? palette.accent
            : isHovered
            ? palette.ink
            : palette.inkMuted;

          return (
            <View key={item.id} style={{ position: 'relative', width: '100%', alignItems: 'center' }}>
              <Pressable
                onPress={() => onSectionChange(item.id)}
                onHoverIn={() => setHoveredId(item.id)}
                onHoverOut={() => setHoveredId(null)}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isActive
                    ? isDark
                      ? 'rgba(63, 191, 106, 0.14)'
                      : 'rgba(63, 191, 106, 0.10)'
                    : isHovered
                    ? isDark
                      ? 'rgba(255, 255, 255, 0.06)'
                      : 'rgba(10, 10, 10, 0.05)'
                    : 'transparent',
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                  transition: 'background-color 150ms ease',
                })}
              >
                {/* 2px active side indicator */}
                {isActive && (
                  <View
                    style={{
                      position: 'absolute',
                      left: -6,
                      top: 8,
                      bottom: 8,
                      width: 3,
                      borderRadius: 2,
                      backgroundColor: palette.accent,
                    }}
                  />
                )}

                {item.icon(iconColor, isActive)}
              </Pressable>

              {/* Compact Floating Tooltip */}
              {isHovered && (
                <View
                  style={
                    {
                      position: 'absolute',
                      left: 54,
                      top: 4,
                      zIndex: 100,
                      minWidth: 160,
                      maxWidth: 220,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: 8,
                      backgroundColor: isDark ? 'rgba(18, 22, 28, 0.96)' : 'rgba(255, 255, 255, 0.98)',
                      borderWidth: 1,
                      borderColor: palette.line,
                      boxShadow: isDark ? '0 6px 18px rgba(0,0,0,0.5)' : '0 4px 14px rgba(0,0,0,0.12)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      pointerEvents: 'none',
                    } as any
                  }
                >
                  <Text
                    style={{
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontSize: 12,
                      fontWeight: '600',
                      color: palette.ink,
                    }}
                  >
                    {item.label}
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontSize: 10,
                      fontWeight: '400',
                      color: palette.inkMuted,
                      marginTop: 2,
                    }}
                  >
                    {item.subtitle}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

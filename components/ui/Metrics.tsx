import { MaterialCommunityIcons } from '@expo/vector-icons';
import type React from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { Card } from './Card';
import { alpha, consolePalette, variantStyle, type IconName, type Variant } from './tokens';
import { text } from './type';

/**
 * Meter — a bounded 0-100 track.
 *
 * The fill carries severity; the unfilled track is a tinted step of the same
 * colour rather than a flat grey, so the state reads across the whole bar
 * instead of only the filled part.
 */
export function Meter({
  value,
  variant,
  height = 6,
  className,
}: {
  /** 0-100. Clamped. */
  value: number;
  variant: Variant;
  height?: number;
  className?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, variant);
  const pct = Math.max(0, Math.min(100, value));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      className={cn('w-full overflow-hidden', className)}
      style={{ height, borderRadius: height / 2, backgroundColor: alpha(style.accent, 0.16) }}
    >
      <View style={{ width: `${pct}%`, height, borderRadius: height / 2, backgroundColor: style.accent }} />
    </View>
  );
}

/**
 * StatTile — label, value, optional meter and supporting detail.
 *
 * The value uses the font's proportional figures: `tabular-nums` gives every
 * digit the width of a zero, which reads loose at display sizes. Tabular figures
 * are reserved for columns that must align vertically.
 */
export function StatTile({
  label,
  value,
  detail,
  variant = 'info',
  icon,
  meter,
  badge,
  className,
}: {
  label: string;
  value: string;
  detail?: string;
  variant?: Variant;
  icon?: IconName;
  /** 0-100. Renders a meter beneath the value when present. */
  meter?: number;
  badge?: React.ReactNode;
  className?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, variant);

  return (
    <Card className={cn('min-w-0 gap-2.5', className)}>
      <View className="flex-row items-center gap-2">
        <MaterialCommunityIcons name={icon ?? style.icon} size={13} color={style.accent} />
        <Text
          className={cn('min-w-0 flex-1', text.label)}
          style={{ color: palette.inkMuted }}
          numberOfLines={1}
        >
          {label}
        </Text>
        {badge}
      </View>
      <Text
        className="font-body-bold text-[19px] leading-6 tracking-[-0.025em]"
        style={{ color: palette.ink }}
        numberOfLines={2}
      >
        {value}
      </Text>
      {meter !== undefined ? <Meter value={meter} variant={variant} /> : null}
      {detail ? (
        <Text className="font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }} numberOfLines={3}>
          {detail}
        </Text>
      ) : null}
    </Card>
  );
}

export type MagnitudeDatum = {
  key: string;
  label: string;
  /** Bar length. Non-negative. */
  value: number;
  /** Printed at the bar tip. Falls back to the value. */
  display?: string;
  /** Direction of travel, shown as an icon + word rather than a second hue. */
  direction?: 'high' | 'low' | 'normal';
  detail?: string;
};

/**
 * MagnitudeBars — a single-series horizontal magnitude chart.
 *
 * One colour for the whole series, chosen by the episode's severity. Bar length
 * already encodes magnitude, so painting each bar darker-where-bigger would
 * double-encode it and burn the only free channel. Direction is carried by an
 * icon and a word, not by a second hue.
 *
 * Marks follow the house spec: a thin bar growing from one baseline, square at
 * the baseline and rounded at the data end, with a solid hairline axis.
 */
export function MagnitudeBars({
  data,
  variant,
  unitSuffix,
  className,
}: {
  data: MagnitudeDatum[];
  variant: Variant;
  /** Appended to the tip label, e.g. ' bands'. */
  unitSuffix?: string;
  className?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, variant);
  const max = Math.max(1, ...data.map((datum) => datum.value));

  return (
    <View className={cn('gap-3', className)}>
      {data.map((datum) => {
        const pct = Math.max(2, (datum.value / max) * 100);
        const arrow: IconName =
          datum.direction === 'high' ? 'arrow-up' : datum.direction === 'low' ? 'arrow-down' : 'minus';
        return (
          <View key={datum.key} className="gap-1.5">
            <View className="flex-row items-center gap-2">
              <Text
                className={cn('min-w-0 flex-1', text.data)}
                style={{ color: palette.ink }}
                numberOfLines={1}
              >
                {datum.label}
              </Text>
              {datum.direction ? (
                <View className="flex-row items-center gap-1">
                  <MaterialCommunityIcons name={arrow} size={11} color={palette.inkMuted} />
                  <Text className={text.meta} style={{ color: palette.inkMuted }}>
                    {datum.direction}
                  </Text>
                </View>
              ) : null}
              <Text
                className={text.data}
                style={{ color: palette.ink, fontVariant: ['tabular-nums'] }}
              >
                {datum.display ?? datum.value.toFixed(1)}
                {unitSuffix}
              </Text>
            </View>
            {/* Track is the hairline axis; the bar grows from its single baseline. */}
            <View className="w-full" style={{ height: 8, backgroundColor: alpha(style.accent, 0.14), borderRadius: 2 }}>
              <View
                style={{
                  width: `${pct}%`,
                  height: 8,
                  backgroundColor: style.accent,
                  borderTopLeftRadius: 2,
                  borderBottomLeftRadius: 2,
                  borderTopRightRadius: 4,
                  borderBottomRightRadius: 4,
                }}
              />
            </View>
            {datum.detail ? (
              <Text className="font-body text-[10.5px] leading-[14px]" style={{ color: palette.inkMuted }}>
                {datum.detail}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * A value shown against its limit, with the limit marked on the track.
 *
 * Used for hard process constraints, where "how close are we" matters as much as
 * pass/fail.
 */
export function LimitBar({
  value,
  limit,
  variant,
  className,
}: {
  value: number;
  limit: number;
  variant: Variant;
  className?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, variant);
  // Scale so the limit always sits at 80% of the track; a bar past the limit
  // then visibly overruns the marker instead of pinning at full width.
  const scale = limit > 0 ? (value / limit) * 80 : 0;
  const pct = Math.max(1, Math.min(100, scale));

  return (
    <View className={cn('w-full', className)} style={{ height: 8 }}>
      <View style={{ height: 8, borderRadius: 2, backgroundColor: alpha(style.accent, 0.14) }}>
        <View
          style={{
            width: `${pct}%`,
            height: 8,
            backgroundColor: style.accent,
            borderTopLeftRadius: 2,
            borderBottomLeftRadius: 2,
            borderTopRightRadius: 4,
            borderBottomRightRadius: 4,
          }}
        />
      </View>
      {/* Limit marker: a solid hairline, one step off the surface. */}
      <View
        style={{
          position: 'absolute',
          left: '80%',
          top: -2,
          width: 1,
          height: 12,
          backgroundColor: palette.lineStrong,
        }}
      />
    </View>
  );
}

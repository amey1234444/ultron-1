/**
 * The live instrument readout — the Analyzer's right rail.
 *
 * Every conclusion on this screen is read off these numbers, so they stay
 * beside the conclusion instead of three tabs away. One row per resolved tag:
 * identity, what it measures, where it has been going, what it reads now, and
 * whether that reading can be trusted.
 *
 * The list scrolls inside itself rather than growing the rail, so a machine
 * with fourteen mapped instruments does not push the connectivity panel under
 * the fold on a 1366×768 laptop.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { alpha, Badge, consolePalette, StatusDot, variantStyle, type ConsolePalette, type Variant } from '../../../ui';

export type ReadoutRow = {
  key: string;
  tag: string;
  /** The sentence a plant operator would use for this instrument. */
  name: string;
  value: number | null;
  unit: string;
  variant: Variant;
  /** Status word shown beside the dot, so state never travels as colour alone. */
  status: string;
  history: (number | null)[];
};

export type ReadoutMissing = { tag: string; label: string; essential: boolean };

function formatValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : Number(value.toPrecision(3));
  return String(rounded);
}

/**
 * A tag's recent samples, drawn at the height of a line of text.
 *
 * The rolling history the pipeline already keeps for its temporal features
 * costs nothing to draw and turns a bare number into a number with a direction.
 * Nulls break the line rather than being interpolated across — a gap in the
 * data is information, and joining over it would draw a measurement that was
 * never taken.
 */
export function TagTrend({
  values,
  colour,
  width = 62,
  height = 22,
}: {
  values: (number | null)[];
  colour: string;
  width?: number;
  height?: number;
}) {
  const path = useMemo(() => {
    const samples = values.slice(-24);
    const finite = samples.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (finite.length < 2) return null;
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const span = max - min || Math.abs(max) || 1;
    const stepX = samples.length > 1 ? width / (samples.length - 1) : width;

    let d = '';
    let pen = false;
    samples.forEach((value, index) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        pen = false;
        return;
      }
      const x = index * stepX;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      d += `${pen ? ' L' : ' M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      pen = true;
    });
    return d.trim() || null;
  }, [height, values, width]);

  if (!path) {
    return (
      <View style={{ width, height }} className="justify-center">
        <View style={{ height: 1, backgroundColor: alpha(colour, 0.25) }} />
      </View>
    );
  }

  return (
    <Svg width={width} height={height}>
      <Path d={path} fill="none" stroke={colour} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function accentFor(palette: ConsolePalette, variant: Variant): string {
  return variantStyle(palette, variant).accent;
}

export function LiveInstrumentReadout({
  rows,
  missing,
  /** Caps the scrolling list. The rail must not grow taller than the viewport. */
  maxHeight = 340,
}: {
  rows: ReadoutRow[];
  missing: ReadoutMissing[];
  maxHeight?: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const healthy = rows.filter((row) => row.variant === 'success').length;

  return (
    <View className="overflow-hidden rounded-xl border" style={{ backgroundColor: palette.panel, borderColor: palette.line }}>
      <View className="flex-row items-center gap-2 px-3.5 pb-2 pt-3">
        <MaterialCommunityIcons name="access-point" size={14} color={palette.accent} />
        <Text className="min-w-0 flex-1 font-body-bold text-[13px] tracking-[-0.015em]" style={{ color: palette.ink }}>
          Live instrument readout
        </Text>
        <Badge variant={rows.length > 0 ? 'success' : 'muted'} icon={null} outline>
          {rows.length} tag{rows.length === 1 ? '' : 's'}
        </Badge>
      </View>

      {rows.length > 0 ? (
        <View className="flex-row items-center gap-2 px-3.5 pb-2">
          <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
            {healthy}/{rows.length} good
          </Text>
          <View className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: palette.panelRaised }}>
            <View
              style={{
                width: `${rows.length === 0 ? 0 : (healthy / rows.length) * 100}%`,
                height: 3,
                backgroundColor: palette.accent,
              }}
            />
          </View>
        </View>
      ) : null}

      <View style={{ height: 1, backgroundColor: palette.line }} />

      {rows.length === 0 ? (
        <Text className="px-3.5 py-4 font-body text-[11.5px] leading-[16px]" style={{ color: palette.inkMuted }}>
          No mapped point resolved onto a diagnostic tag, so the model has nothing to read.
        </Text>
      ) : (
        <ScrollView style={{ maxHeight }} showsVerticalScrollIndicator={false}>
          {rows.map((row, index) => {
            const colour = accentFor(palette, row.variant);
            return (
              <View
                key={row.key}
                className="flex-row items-center gap-2.5 px-3.5 py-2"
                style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
              >
                <StatusDot variant={row.variant} size={6} />
                <View className="min-w-0 flex-1">
                  <Text className="font-mono text-[11px]" style={{ color: palette.ink }} numberOfLines={1}>
                    {row.tag}
                  </Text>
                  <Text className="font-body text-[10.5px] leading-[14px]" style={{ color: palette.inkMuted }} numberOfLines={1}>
                    {row.name}
                  </Text>
                </View>
                <TagTrend values={row.history} colour={colour} />
                <View style={{ minWidth: 66 }} className="items-end">
                  <Text
                    className="font-mono text-[12.5px]"
                    style={{ color: palette.ink, fontVariant: ['tabular-nums'] }}
                    numberOfLines={1}
                  >
                    {formatValue(row.value)}
                  </Text>
                  <Text
                    className="font-mono text-[9px] uppercase tracking-[0.1em]"
                    style={{ color: row.value === null ? colour : palette.inkFaint }}
                    numberOfLines={1}
                  >
                    {row.value === null ? row.status : row.unit}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {missing.length > 0 ? (
        <>
          <View style={{ height: 1, backgroundColor: palette.line }} />
          <View className="gap-1.5 px-3.5 py-2.5" style={{ backgroundColor: palette.panelRaised }}>
            <Text className="font-mono text-[8.5px] uppercase tracking-[0.16em]" style={{ color: palette.inkFaint }}>
              Not mapped · {missing.length}
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {missing.map((item) => (
                <Badge key={item.tag} variant={item.essential ? 'warning' : 'muted'} icon={null} outline>
                  {item.tag}
                </Badge>
              ))}
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

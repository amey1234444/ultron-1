import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { splinePath, useSmoothSeries } from '../../../../lib/chartMotion';
import { cn } from '../../../../lib/cn';
import { levelHexes, stateHexFor, type SensorState, type Thresholds } from '../../../../lib/condition';
import { consolePalette } from '../../../../lib/consoleTheme';

// Measured trend against its ALERT and DANGER limits.
//
// A note on the ranges. The demo buffer holds 96 samples at six plant-hours each,
// so it covers about 24 days at that resolution — which means a literal "1H" or
// "24H" range would be a single point or four. Rather than offer buttons that
// draw nothing, the ranges are generated from what the buffer can actually
// resolve. Wiring a historian that stores at minute or hourly resolution is what
// makes the shorter ranges meaningful, and nothing here needs to change for them
// to appear: they come from `sampleIntervalHours` and the buffer length.

const CHART_HEIGHT = 168;
const PAD_LEFT = 6;
const PAD_RIGHT = 8;
const PAD_Y = 10;

type Range = { label: string; samples: number };

function rangesFor(bufferLength: number, sampleIntervalHours: number): Range[] {
  const candidates = [
    { label: '1H', hours: 1 },
    { label: '6H', hours: 6 },
    { label: '24H', hours: 24 },
    { label: '7D', hours: 24 * 7 },
    { label: '30D', hours: 24 * 30 },
  ];

  const out: Range[] = [];
  for (const c of candidates) {
    const samples = Math.round(c.hours / sampleIntervalHours);
    // Fewer than four points is not a trend, and anything longer than the buffer
    // would silently render as the whole buffer under a label claiming more.
    if (samples < 4 || samples > bufferLength) continue;
    out.push({ label: c.label, samples });
  }

  // Always offer the whole buffer, labelled by what it actually spans.
  const totalHours = (bufferLength - 1) * sampleIntervalHours;
  const allLabel = totalHours >= 48 ? `${Math.round(totalHours / 24)}D` : `${Math.round(totalHours)}H`;
  if (!out.some((r) => r.label === allLabel)) out.push({ label: allLabel, samples: bufferLength });

  return out;
}

export type ConditionTrendProps = {
  label: string;
  unit: string;
  samples: number[];
  sampleIntervalHours: number;
  thresholds: Thresholds;
  state: SensorState;
  decimals: number;
  // Sensor picker, when the host has more than one to offer.
  onSelectSensor?: () => void;
};

export function ConditionTrend({
  label,
  unit,
  samples,
  sampleIntervalHours,
  thresholds,
  state,
  decimals,
  onSelectSensor,
}: ConditionTrendProps) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const palette = consolePalette(isDark);
  const levels = levelHexes(isDark);
  const grid = palette.chartGridMajor;

  const ranges = useMemo(() => rangesFor(samples.length, sampleIntervalHours), [samples.length, sampleIntervalHours]);
  const [rangeLabel, setRangeLabel] = useState<string | null>(null);
  const range = ranges.find((r) => r.label === rangeLabel) ?? ranges[ranges.length - 1];

  const [width, setWidth] = useState<number | null>(null);
  const colour = stateHexFor(state, isDark);

  const shown = range ? samples.slice(Math.max(0, samples.length - range.samples)) : samples;
  const smoothShown = useSmoothSeries(shown);

  const geometry = useMemo(() => {
    if (width === null || smoothShown.length < 2) return null;

    // Scale to include both limits, so the DANGER line is always on the chart
    // even when the reading is nowhere near it.
    const values = [
      ...smoothShown,
      thresholds.alert,
      thresholds.danger,
      ...(thresholds.lowAlert === undefined ? [] : [thresholds.lowAlert]),
      ...(thresholds.lowDanger === undefined ? [] : [thresholds.lowDanger]),
    ];
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const pad = (rawMax - rawMin) * 0.12 || 1;
    const min = rawMin - pad;
    const max = rawMax + pad;

    const innerW = width - PAD_LEFT - PAD_RIGHT;
    const innerH = CHART_HEIGHT - PAD_Y * 2;
    const x = (i: number) => PAD_LEFT + (i / (smoothShown.length - 1)) * innerW;
    const y = (v: number) => PAD_Y + (1 - (v - min) / (max - min)) * innerH;

    const points = smoothShown.map((v, i) => ({ x: x(i), y: y(v) }));
    const line = splinePath(points, 0.45);
    const area = `${line} L ${x(smoothShown.length - 1)} ${CHART_HEIGHT - PAD_Y} L ${x(0)} ${CHART_HEIGHT - PAD_Y} Z`;

    return {
      line,
      area,
      yAlert: y(thresholds.alert),
      yDanger: y(thresholds.danger),
      yLowAlert: thresholds.lowAlert === undefined ? null : y(thresholds.lowAlert),
      yLowDanger: thresholds.lowDanger === undefined ? null : y(thresholds.lowDanger),
      innerW,
      min,
      max,
    };
  }, [width, smoothShown, thresholds.alert, thresholds.danger, thresholds.lowAlert, thresholds.lowDanger]);

  const spanHours = range ? (range.samples - 1) * sampleIntervalHours : 0;

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Condition trend</Text>

        <View className="flex-row items-center gap-1">
          {ranges.map((r) => {
            const active = range?.label === r.label;
            return (
              <Pressable
                key={r.label}
                onPress={() => setRangeLabel(r.label)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${r.label} of trend`}
                className={cn('rounded border px-1.5 py-0.5', active ? 'border-accent/50 bg-accent/10' : lineClass)}
              >
                <Text className={cn('font-mono text-[9px]', active ? 'text-accent' : mutedClass)}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="flex-row flex-wrap items-baseline gap-2">
        <Text numberOfLines={1} className={cn('font-body-medium text-[12px]', inkClass)}>
          {label}
        </Text>
        {onSelectSensor ? (
          <Pressable onPress={onSelectSensor} accessibilityRole="button" accessibilityLabel="Change trended sensor">
            <Text className="font-body-medium text-[10px] text-accent">change ›</Text>
          </Pressable>
        ) : null}
        <View className="flex-1" />
        <Text className={cn('font-mono text-[9px]', mutedClass)}>
          {spanHours >= 48 ? `${Math.round(spanHours / 24)} d` : `${Math.round(spanHours)} h`} · {shown.length} samples · {unit}
        </Text>
      </View>

      <View
        style={{ height: CHART_HEIGHT }}
        className="w-full"
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          setWidth((prev) => (prev !== null && Math.abs(prev - w) < 1 ? prev : w));
        }}
      >
        {geometry && width !== null ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <Line x1={PAD_LEFT} y1={CHART_HEIGHT - PAD_Y} x2={width - PAD_RIGHT} y2={CHART_HEIGHT - PAD_Y} stroke={grid} strokeWidth={1} />
            <Line x1={PAD_LEFT} y1={PAD_Y} x2={width - PAD_RIGHT} y2={PAD_Y} stroke={grid} strokeWidth={1} />

            <Path d={geometry.area} fill={colour} fillOpacity={0.1} />
            <Path d={geometry.line} fill="none" stroke={colour} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />

            {/* Limits dashed, so they read as thresholds rather than as data. */}
            {geometry.yLowAlert !== null ? (
              <Line
                x1={PAD_LEFT}
                y1={geometry.yLowAlert}
                x2={width - PAD_RIGHT}
                y2={geometry.yLowAlert}
                stroke={levels.alert}
                strokeWidth={1.25}
                strokeDasharray="5 4"
              />
            ) : null}
            {geometry.yLowDanger !== null ? (
              <Line
                x1={PAD_LEFT}
                y1={geometry.yLowDanger}
                x2={width - PAD_RIGHT}
                y2={geometry.yLowDanger}
                stroke={levels.danger}
                strokeWidth={1.25}
                strokeDasharray="5 4"
              />
            ) : null}
            <Line
              x1={PAD_LEFT}
              y1={geometry.yAlert}
              x2={width - PAD_RIGHT}
              y2={geometry.yAlert}
              stroke={levels.alert}
              strokeWidth={1.25}
              strokeDasharray="5 4"
            />
            <Line
              x1={PAD_LEFT}
              y1={geometry.yDanger}
              x2={width - PAD_RIGHT}
              y2={geometry.yDanger}
              stroke={levels.danger}
              strokeWidth={1.25}
              strokeDasharray="5 4"
            />
          </Svg>
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className={cn('font-body text-[11px] italic', mutedClass)}>Not enough history to draw a trend yet.</Text>
          </View>
        )}
      </View>

      <View className="flex-row flex-wrap items-center gap-4">
        {thresholds.lowDanger !== undefined ? (
          <View className="flex-row items-center gap-1.5">
            <View style={{ width: 12, height: 2, backgroundColor: levels.danger }} />
            <Text className={cn('font-mono text-[9px]', mutedClass)}>LL {thresholds.lowDanger.toFixed(decimals)}</Text>
          </View>
        ) : null}
        {thresholds.lowAlert !== undefined ? (
          <View className="flex-row items-center gap-1.5">
            <View style={{ width: 12, height: 2, backgroundColor: levels.alert }} />
            <Text className={cn('font-mono text-[9px]', mutedClass)}>L {thresholds.lowAlert.toFixed(decimals)}</Text>
          </View>
        ) : null}
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 12, height: 2, backgroundColor: levels.alert }} />
          <Text className={cn('font-mono text-[9px]', mutedClass)}>ALERT {thresholds.alert.toFixed(decimals)}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 12, height: 2, backgroundColor: levels.danger }} />
          <Text className={cn('font-mono text-[9px]', mutedClass)}>DANGER {thresholds.danger.toFixed(decimals)}</Text>
        </View>
      </View>
    </View>
  );
}

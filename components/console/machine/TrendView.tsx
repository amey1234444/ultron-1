import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { EmptyState } from '../EmptyState';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { LIVE_RANGE_FOR_LETTER, type LiveKindLetter, useLiveHistory } from './liveValue';
import type { MappedChannel } from './RackOccupancyView';

// Human labels for the V/T/S/P/C/X live-reading letter scheme (see liveValue.ts).
const KIND_LABEL: Record<LiveKindLetter, string> = {
  V: 'Vibration',
  T: 'Temperature',
  S: 'Speed',
  P: 'Pressure',
  C: 'Current',
  X: 'Other',
};

// Overlaid series have to stay tellable apart, but a twelve-hue rainbow fights
// the console's black-grey-green palette and makes hue meaningless — you cannot
// tell "red because it is series four" from "red because it is in alarm".
//
// So the ramp is built from lightness instead: the first series takes the
// accent, the rest step down a neutral scale. Alarm colour is then free to mean
// only one thing. Twelve steps stay distinguishable because consecutive series
// are never adjacent in the ramp.
const SERIES_PALETTE = [
  '#3FBF6A',
  '#F2F2F0',
  '#3FBF6A',
  '#A1A3A0',
  '#8FF0A8',
  '#C9CCC9',
  '#2F7A48',
  '#6B6D6B',
  '#B8F5C6',
  '#E3E5E2',
  '#4FA36A',
  '#87897F',
];

const CHART_HEIGHT = 300;
const PAD_LEFT = 44;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 20;
const HISTORY_POINTS = 40; // matches useLiveHistory's rolling buffer length

type Pt = { x: number; y: number };

// Catmull-Rom spline (uniform, tension 0) expressed as cubic Béziers — turns the
// jagged straight-segment polyline into a smooth curve through every sample.
function smoothPath(points: Pt[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

type SeriesMeta = { id: string; letter: LiveKindLetter; colour: string; code: string; label: string; unit: string };

// One overlaid line. Runs its own rolling history walk (demo data) and, whenever
// it ticks, reports its latest value up so the legend can show a live readout in
// the series' own colour. Each series is normalised to *its own* measurement
// band, so a Temperature and a Vibration line are visually comparable even
// though their real units differ.
function SeriesLine({
  meta,
  machineId,
  visible,
  chartWidth,
  onSample,
}: {
  meta: SeriesMeta;
  machineId: string;
  visible: boolean;
  chartWidth: number;
  onSample: (id: string, value: number) => void;
}) {
  const history = useLiveHistory(meta.letter, true, `ultron.trendhistory.${machineId}.${meta.id}`);
  const latest = history[history.length - 1];

  // Report the latest sample up so the legend can show a live readout — in an
  // effect (not during render) so we never setState on the parent mid-render.
  useEffect(() => {
    onSample(meta.id, latest);
  }, [onSample, meta.id, latest]);

  const range = LIVE_RANGE_FOR_LETTER[meta.letter];
  const plotW = chartWidth - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const stepX = plotW / (HISTORY_POINTS - 1);
  const span = range.max - range.min || 1;

  // Right-align the most recent sample; shorter buffers grow in from the right.
  const points = history.map((v, i) => {
    const fromRight = history.length - 1 - i;
    return {
      x: PAD_LEFT + plotW - fromRight * stepX,
      y: PAD_TOP + (1 - (v - range.min) / span) * plotH,
    };
  });

  if (!visible || points.length < 2) return null;

  const d = smoothPath(points);
  const last = points[points.length - 1];

  return (
    <>
      <Path d={d} fill="none" stroke={meta.colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last.x} cy={last.y} r={3} fill={meta.colour} />
    </>
  );
}

function Dropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const { isDark } = useAppTheme();
  const [open, setOpen] = useState(false);
  const panelClass = isDark ? 'bg-surface-darkpanel border-line-dark' : 'bg-surface-lightpanel border-line-light';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const current = options.find((o) => o.value === value)?.label ?? value;

  return (
    <View style={{ position: 'relative', zIndex: 20 }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        className={cn('flex-row items-center gap-2 rounded-lg border px-3 py-2', panelClass)}
        style={{ minWidth: 176 }}
      >
        <Text className={cn('flex-1 font-body text-xs', textClass)}>{current}</Text>
        <Text className={cn('font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {open ? '▲' : '▼'}
        </Text>
      </Pressable>
      {open && (
        <View
          className={cn('rounded-lg border', panelClass)}
          style={{ position: 'absolute', top: 42, left: 0, right: 0, zIndex: 30, overflow: 'hidden' }}
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn('px-3 py-2', active ? (isDark ? 'bg-white/10' : 'bg-black/5') : '')}
              >
                <Text className={cn('font-body text-xs', textClass)}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export type TrendViewProps = {
  mappedChannels: MappedChannel[];
  machineId: string;
  expectedPoints: number;
};

// Actual View → Trend: every mapped channel overlaid on a single time chart.
// A dropdown filters by measurement type, and each series can be toggled on/off
// straight from the legend. All series start selected. Data is a demo random
// walk (see liveValue.ts), not a real historian.
export function TrendView({ mappedChannels, machineId, expectedPoints }: TrendViewProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const gridColour = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(10,10,10,0.10)';
  const axisTextColour = isDark ? '#A1A3A0' : '#6B6D6B';

  const [kindFilter, setKindFilter] = useState<'all' | LiveKindLetter>('all');
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [latest, setLatest] = useState<Record<string, number>>({});
  const [chartWidth, setChartWidth] = useState(0);

  const onSample = useCallback((id: string, value: number) => {
    setLatest((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setChartWidth(e.nativeEvent.layout.width);
  }, []);

  const series = useMemo<SeriesMeta[]>(
    () =>
      mappedChannels.map((m, i) => ({
        id: m.id,
        letter: m.channel.letter,
        colour: SERIES_PALETTE[i % SERIES_PALETTE.length],
        code: m.channel.code,
        label: m.label,
        unit: m.channel.unit,
      })),
    [mappedChannels],
  );

  // Dropdown options: "All", then only the measurement kinds actually present.
  const kindOptions = useMemo(() => {
    const present: LiveKindLetter[] = [];
    for (const s of series) if (!present.includes(s.letter)) present.push(s.letter);
    return [
      { value: 'all', label: 'All trends' },
      ...present.map((letter) => ({ value: letter, label: KIND_LABEL[letter] })),
    ];
  }, [series]);

  const filtered = useMemo(
    () => (kindFilter === 'all' ? series : series.filter((s) => s.letter === kindFilter)),
    [series, kindFilter],
  );

  if (mappedChannels.length === 0) {
    return <EmptyState title="No mapped channels" description="Trends plot saved rack mappings — link a box to a channel in Design mode, then save the canvas configuration." />;
  }

  // When a single kind is selected every series shares one real band, so the
  // Y axis can show real units; for "all" the axis is a normalised 0–100%.
  const singleRange = kindFilter === 'all' ? null : LIVE_RANGE_FOR_LETTER[kindFilter];
  const singleUnit = kindFilter === 'all' ? '' : filtered[0]?.unit ?? '';
  const plotH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const gridFracs = [0, 0.25, 0.5, 0.75, 1];

  const axisLabel = (frac: number) => {
    if (!singleRange) return `${Math.round((1 - frac) * 100)}%`;
    const v = singleRange.min + (1 - frac) * (singleRange.max - singleRange.min);
    return v.toFixed(singleRange.decimals);
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 16 }}>
      <View className="flex-row flex-wrap items-center justify-between gap-3" style={{ zIndex: 20 }}>
        <View className="gap-1">
          <Text className={cn('font-body-medium text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>Live trends</Text>
          {expectedPoints > 0 && (
            <Text className={cn('font-body text-[11px]', mutedClass)}>
              {mappedChannels.length} of {expectedPoints} expected points mapped
              {singleUnit ? ` · axis in ${singleUnit}` : ' · axis normalised to each channel band'}
            </Text>
          )}
        </View>
        <Dropdown value={kindFilter} options={kindOptions} onChange={(v) => setKindFilter(v as 'all' | LiveKindLetter)} />
      </View>

      <View
        onLayout={onLayout}
        className={cn('rounded-xl border', isDark ? 'bg-surface-darkpanel border-line-dark' : 'bg-surface-lightpanel border-line-light')}
        style={{ padding: 8 }}
      >
        {chartWidth > 0 && (
          <Svg width={chartWidth - 16} height={CHART_HEIGHT}>
            {gridFracs.map((frac) => {
              const y = PAD_TOP + frac * plotH;
              return (
                <React.Fragment key={frac}>
                  <Line x1={PAD_LEFT} y1={y} x2={chartWidth - 16 - PAD_RIGHT} y2={y} stroke={gridColour} strokeWidth={1} />
                  <SvgText x={PAD_LEFT - 6} y={y + 3} fontSize={9} fill={axisTextColour} textAnchor="end">
                    {axisLabel(frac)}
                  </SvgText>
                </React.Fragment>
              );
            })}
            {filtered.map((meta) => (
              <SeriesLine
                key={meta.id}
                meta={meta}
                machineId={machineId}
                visible={!hidden[meta.id]}
                chartWidth={chartWidth - 16}
                onSample={onSample}
              />
            ))}
          </Svg>
        )}
      </View>

      {/* Clickable legend — tap a series to hide it, tap again to bring it back. */}
      <View className="flex-row flex-wrap gap-2">
        {filtered.map((meta) => {
          const isHidden = !!hidden[meta.id];
          const value = latest[meta.id];
          return (
            <Pressable
              key={meta.id}
              onPress={() => setHidden((prev) => ({ ...prev, [meta.id]: !prev[meta.id] }))}
              className={cn(
                'flex-row items-center gap-2 rounded-lg border px-2.5 py-1.5',
                isDark ? 'border-line-dark' : 'border-line-light',
              )}
              style={{ opacity: isHidden ? 0.45 : 1 }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: meta.colour }} />
              <Text className={cn('font-mono text-[10px]', mutedClass)}>{meta.code}</Text>
              <Text
                numberOfLines={1}
                className={cn('font-body text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}
                style={{ maxWidth: 150, textDecorationLine: isHidden ? 'line-through' : 'none' }}
              >
                {meta.label}
              </Text>
              {value !== undefined && (
                <Text style={{ color: meta.colour }} className="font-mono text-[11px] font-bold">
                  {value.toFixed(LIVE_RANGE_FOR_LETTER[meta.letter].decimals)} {meta.unit}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
